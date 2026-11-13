const { Router } = require('express')
const multer = require('multer')
const prisma = require('../prisma')
const auth = require('../middleware/auth')
const authOrApiKey = require('../middleware/authOrApiKey')
const photos = require('../photos')
const { notifyNewLead } = require('../whatsapp')
const { validateLead, validateActivityMessage, parseId } = require('../validation')

const router = Router()

// Cheap first filter on the claimed type. The real check is the file contents, in photos.detectFileType.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    cb(null, allowed.includes(file.mimetype))
  }
})

// GET all leads — JWT protected
router.get('/', auth, async (req, res) => {
  try {
    const leads = await prisma.lead.findMany({ orderBy: { createdAt: 'desc' } })
    res.json(leads)
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed to fetch leads' })
  }
})

// GET single lead — JWT protected
router.get('/:id', auth, async (req, res) => {
  try {
    const id = parseId(req.params.id)
    if (!id) return res.status(404).json({ error: 'Lead not found' })
    const lead = await prisma.lead.findUnique({
      where: { id },
      include: {
        photos: { orderBy: { createdAt: 'asc' } },
        activityLog: { orderBy: { createdAt: 'asc' } }
      }
    })
    if (!lead) return res.status(404).json({ error: 'Lead not found' })
    res.json(photos.presentLead(lead))
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed to fetch lead' })
  }
})

// POST — API key (website form) or JWT (CRM staff creating a lead)
router.post('/', authOrApiKey, async (req, res) => {
  try {
    const checked = validateLead(req.body, { creating: true })
    if (checked.error) return res.status(400).json({ error: checked.error })

    const data = {
      phone: 'Not provided',
      source: 'Website',
      ...checked.value,
      // Staff creating a lead via JWT are recorded as creator; website (API key) leads have none
      userId: req.user ? req.user.id : null
    }

    const lead = await prisma.lead.create({ data })
    // Alert is sent in the background; a WhatsApp failure must not affect the saved lead
    notifyNewLead(lead)
    res.status(201).json(lead)
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed to create lead' })
  }
})

// PUT — JWT protected. Only the fields in the request are changed; the creator never changes.
router.put('/:id', auth, async (req, res) => {
  try {
    const id = parseId(req.params.id)
    if (!id) return res.status(404).json({ error: 'Lead not found' })

    const existing = await prisma.lead.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ error: 'Lead not found' })

    const checked = validateLead(req.body, { existing })
    if (checked.error) return res.status(400).json({ error: checked.error })

    const lead = await prisma.lead.update({ where: { id }, data: checked.value })
    res.json(lead)
  } catch (error) {
    console.error(error)
    if (error.code === 'P2025') return res.status(404).json({ error: 'Lead not found' })
    res.status(500).json({ error: 'Failed to update lead' })
  }
})

// DELETE — JWT protected
router.delete('/:id', auth, async (req, res) => {
  try {
    const id = parseId(req.params.id)
    if (!id) return res.status(404).json({ error: 'Lead not found' })

    const lead = await prisma.lead.findUnique({ where: { id }, include: { photos: true } })
    if (!lead) return res.status(404).json({ error: 'Lead not found' })

    // Photo and activity rows cascade in the database; then remove the files
    await prisma.lead.delete({ where: { id } })
    await photos.removeFiles(lead.photos)

    res.status(204).send()
  } catch (error) {
    console.error(error)
    if (error.code === 'P2025') return res.status(404).json({ error: 'Lead not found' })
    res.status(500).json({ error: 'Failed to delete lead' })
  }
})

// POST photo — JWT protected. Checks the file contents, uploads it as a private Cloudinary asset.
router.post('/:id/photos', auth, upload.single('photo'), async (req, res) => {
  try {
    const leadId = parseId(req.params.id)
    const lead = leadId ? await prisma.lead.findUnique({ where: { id: leadId } }) : null
    if (!lead) return res.status(404).json({ error: 'Lead not found' })
    if (!req.file) return res.status(400).json({ error: 'No valid file uploaded' })

    const format = photos.detectFileType(req.file.buffer)
    if (!format) return res.status(400).json({ error: 'File must be a JPEG, PNG, WebP or PDF' })

    const count = await prisma.photo.count({ where: { leadId: lead.id } })
    if (count >= photos.MAX_PHOTOS_PER_LEAD) {
      return res.status(409).json({ error: `Photo limit reached (${photos.MAX_PHOTOS_PER_LEAD} per lead)` })
    }

    const uploadResult = await photos.uploadPrivate(req.file.buffer, `kwe-crm/leads/${lead.id}`)

    let photo
    try {
      photo = await prisma.photo.create({
        data: {
          filename: photos.sanitiseFilename(req.file.originalname),
          url: uploadResult.secure_url,
          publicId: uploadResult.public_id,
          resourceType: uploadResult.resource_type,
          delivery: photos.PRIVATE_DELIVERY,
          format,
          leadId: lead.id
        }
      })
    } catch (error) {
      // Saving the row failed after the upload succeeded: don't leave the new file orphaned
      await photos.removeFiles([{
        publicId: uploadResult.public_id,
        resourceType: uploadResult.resource_type,
        delivery: photos.PRIVATE_DELIVERY
      }])
      throw error
    }

    res.status(201).json(photos.presentPhoto(photo))
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed to upload photo' })
  }
})

// DELETE photo — JWT protected
router.delete('/:id/photos/:photoId', auth, async (req, res) => {
  try {
    const leadId = parseId(req.params.id)
    const photoId = parseId(req.params.photoId)
    if (!leadId || !photoId) return res.status(404).json({ error: 'Photo not found' })

    const photo = await prisma.photo.findUnique({ where: { id: photoId } })
    if (!photo || photo.leadId !== leadId) {
      return res.status(404).json({ error: 'Photo not found' })
    }

    await prisma.photo.delete({ where: { id: photo.id } })
    await photos.removeFiles([photo])

    res.status(204).send()
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed to delete photo' })
  }
})

// POST activity note — JWT protected
router.post('/:id/activity', auth, async (req, res) => {
  try {
    const leadId = parseId(req.params.id)
    const lead = leadId ? await prisma.lead.findUnique({ where: { id: leadId } }) : null
    if (!lead) return res.status(404).json({ error: 'Lead not found' })

    const checked = validateActivityMessage(req.body?.message)
    if (checked.error) return res.status(400).json({ error: checked.error })

    const entry = await prisma.activityLog.create({
      data: { message: checked.value, leadId: lead.id }
    })

    res.status(201).json(entry)
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed to add activity' })
  }
})

module.exports = router
