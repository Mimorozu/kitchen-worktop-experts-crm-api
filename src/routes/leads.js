const { Router } = require('express')
const prisma = require('../prisma')
const auth = require('../middleware/auth')
const authOrApiKey = require('../middleware/authOrApiKey')

const router = Router()

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
    const lead = await prisma.lead.findUnique({ where: { id: Number(req.params.id) } })
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

module.exports = router