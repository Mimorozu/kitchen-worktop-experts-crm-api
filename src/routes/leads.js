const { Router } = require('express')
const multer = require('multer')
const prisma = require('../prisma')
const cloudinary = require('../cloudinary')
const auth = require('../middleware/auth')
const authOrApiKey = require('../middleware/authOrApiKey')

const router = Router()

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
    res.status(500).json({ error: 'Failed to fetch leads' })
  }
})

// GET single lead — JWT protected
router.get('/:id', auth, async (req, res) => {
  try {
    const lead = await prisma.lead.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        photos: { orderBy: { createdAt: 'asc' } },
        activityLog: { orderBy: { createdAt: 'asc' } }
      }
    })
    if (!lead) return res.status(404).json({ error: 'Lead not found' })
    res.json(lead)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch lead' })
  }
})

// Fields the CRM UI can edit, beyond the required core ones
const OPTIONAL_STRING_FIELDS = [
  'addressLine1', 'addressLine2',
  'quartzStyle', 'kitchenColour', 'kitchenStyle', 'floorColour',
  'handleColour', 'wallColour', 'specialFeatures', 'selectedMaterial',
  'budget', 'timeline', 'photoUrl', 'status', 'source', 'notes'
]
const DATE_FIELDS = [
  'templateDate', 'installDate', 'kitchenInstallDate',
  'warehouseVisitDate', 'followUpDate'
]

// POST — API key (website form) or JWT (CRM staff creating a lead)
router.post('/', authOrApiKey, async (req, res) => {
  try {
    const { name, email, phone, postcode, size, material, quoteValue } = req.body

    if (!name || !email || !postcode || !size || !material) {
      return res.status(400).json({ error: 'name, email, postcode, size and material are required' })
    }

    const data = {
      name, email,
      phone: phone || 'Not provided',
      postcode, size, material,
      source: 'Website',
      userId: 1
    }

    for (const field of OPTIONAL_STRING_FIELDS) {
      if (req.body[field]) data[field] = req.body[field]
    }
    for (const field of DATE_FIELDS) {
      if (req.body[field]) data[field] = new Date(req.body[field])
    }
    if (quoteValue !== undefined && quoteValue !== '') data.quoteValue = parseFloat(quoteValue)

    const lead = await prisma.lead.create({ data })

    res.status(201).json(lead)
  } catch (error) {
    res.status(500).json({ error: 'Failed to create lead' })
  }
})

// PUT — JWT protected
router.put('/:id', auth, async (req, res) => {
  try {
    const { name, email, phone, postcode, size, material, quoteValue } = req.body

    const data = {
      ...(name     && { name }),
      ...(email    && { email }),
      ...(phone    && { phone }),
      ...(postcode && { postcode }),
      ...(size     && { size }),
      ...(material && { material })
    }

    for (const field of OPTIONAL_STRING_FIELDS) {
      if (req.body[field]) data[field] = req.body[field]
    }
    for (const field of DATE_FIELDS) {
      if (req.body[field]) data[field] = new Date(req.body[field])
    }
    if (quoteValue !== undefined && quoteValue !== '') data.quoteValue = parseFloat(quoteValue)

    const lead = await prisma.lead.update({
      where: { id: Number(req.params.id) },
      data
    })

    res.json(lead)
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Lead not found' })
    res.status(500).json({ error: 'Failed to update lead' })
  }
})

// DELETE — JWT protected
router.delete('/:id', auth, async (req, res) => {
  try {
    await prisma.lead.delete({ where: { id: Number(req.params.id) } })
    res.status(204).send()
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Lead not found' })
    res.status(500).json({ error: 'Failed to delete lead' })
  }
})

// POST photo — JWT protected. Uploads to Cloudinary, stores the reference.
router.post('/:id/photos', auth, upload.single('photo'), async (req, res) => {
  try {
    const lead = await prisma.lead.findUnique({ where: { id: Number(req.params.id) } })
    if (!lead) return res.status(404).json({ error: 'Lead not found' })
    if (!req.file) return res.status(400).json({ error: 'No valid file uploaded' })

    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: `kwe-crm/leads/${lead.id}`, resource_type: 'auto' },
        (error, result) => (error ? reject(error) : resolve(result))
      )
      stream.end(req.file.buffer)
    })

    const photo = await prisma.photo.create({
      data: {
        filename: req.file.originalname,
        url: uploadResult.secure_url,
        publicId: uploadResult.public_id,
        resourceType: uploadResult.resource_type,
        leadId: lead.id
      }
    })

    res.status(201).json(photo)
  } catch (error) {
    res.status(500).json({ error: 'Failed to upload photo' })
  }
})

// DELETE photo — JWT protected
router.delete('/:id/photos/:photoId', auth, async (req, res) => {
  try {
    const photo = await prisma.photo.findUnique({ where: { id: Number(req.params.photoId) } })
    if (!photo || photo.leadId !== Number(req.params.id)) {
      return res.status(404).json({ error: 'Photo not found' })
    }

    await cloudinary.uploader.destroy(photo.publicId, { resource_type: photo.resourceType })
    await prisma.photo.delete({ where: { id: photo.id } })

    res.status(204).send()
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete photo' })
  }
})

// POST activity note — JWT protected
router.post('/:id/activity', auth, async (req, res) => {
  try {
    const { message } = req.body
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'message is required' })
    }

    const lead = await prisma.lead.findUnique({ where: { id: Number(req.params.id) } })
    if (!lead) return res.status(404).json({ error: 'Lead not found' })

    const entry = await prisma.activityLog.create({
      data: { message: message.trim(), leadId: lead.id }
    })

    res.status(201).json(entry)
  } catch (error) {
    res.status(500).json({ error: 'Failed to add activity' })
  }
})

module.exports = router