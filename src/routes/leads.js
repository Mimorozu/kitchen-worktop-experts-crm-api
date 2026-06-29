// Handles all incoming requests that start with /api/leads and decides what to do with them.
// GET, POST, PUT, DELETE


const { Router } = require('express')
const prisma = require('../prisma')
const auth = require('../middleware/auth')

const router = Router()

// All /api/leads routes require a valid JWT
router.use(auth)

// GET /api/leads — return all leads, newest first
router.get('/', async (req, res) => {
  try {
    const leads = await prisma.lead.findMany({ orderBy: { createdAt: 'desc' } })
    res.json(leads)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch leads' })
  }
})

// GET /api/leads/:id — return a single lead
router.get('/:id', async (req, res) => {
  try {
    const lead = await prisma.lead.findUnique({ where: { id: Number(req.params.id) } })
    if (!lead) return res.status(404).json({ error: 'Lead not found' })
    res.json(lead)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch lead' })
  }
})

// POST /api/leads — create a new lead
router.post('/', async (req, res) => {
  try {
    const {
      name, email, phone, postcode,
      size, material, quartzStyle,
      budget, timeline, photoUrl,
      status, notes
    } = req.body

    if (!name || !email || !phone || !postcode || !size || !material) {
      return res.status(400).json({ error: 'name, email, phone, postcode, size and material are required' })
    }

    const lead = await prisma.lead.create({
      data: {
        name, email, phone, postcode,
        size, material,
        ...(quartzStyle && { quartzStyle }),
        ...(budget      && { budget }),
        ...(timeline    && { timeline }),
        ...(photoUrl    && { photoUrl }),
        ...(status      && { status }),
        ...(notes       && { notes }),
        userId: req.user.userId
      }
    })

    res.status(201).json(lead)
  } catch (error) {
    res.status(500).json({ error: 'Failed to create lead' })
  }
})

// PUT /api/leads/:id — update a lead
router.put('/:id', async (req, res) => {
  try {
    const {
      name, email, phone, postcode,
      size, material, quartzStyle,
      budget, timeline, photoUrl,
      status, notes
    } = req.body

    const lead = await prisma.lead.update({
      where: { id: Number(req.params.id) },
      data: {
        ...(name        && { name }),
        ...(email       && { email }),
        ...(phone       && { phone }),
        ...(postcode    && { postcode }),
        ...(size        && { size }),
        ...(material    && { material }),
        ...(quartzStyle && { quartzStyle }),
        ...(budget      && { budget }),
        ...(timeline    && { timeline }),
        ...(photoUrl    && { photoUrl }),
        ...(status      && { status }),
        ...(notes       && { notes })
      }
    })

    res.json(lead)
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Lead not found' })
    res.status(500).json({ error: 'Failed to update lead' })
  }
})

// DELETE /api/leads/:id — delete a lead
router.delete('/:id', async (req, res) => {
  try {
    await prisma.lead.delete({ where: { id: Number(req.params.id) } })
    res.status(204).send()
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Lead not found' })
    res.status(500).json({ error: 'Failed to delete lead' })
  }
})

module.exports = router