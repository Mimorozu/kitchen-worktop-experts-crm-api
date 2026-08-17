const { Router } = require('express')
const prisma = require('../prisma')
const auth = require('../middleware/auth')
const apiKey = require('../middleware/apiKey')

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

// POST — API key protected (website form uses this) — redeploy trigger
router.post('/', apiKey, async (req, res) => {
  try {
    const {
      name, email, phone, postcode,
      size, material, quartzStyle,
      budget, timeline, photoUrl,
      status, notes
    } = req.body

    if (!name || !email || !postcode || !size || !material) {
      return res.status(400).json({ error: 'name, email, postcode, size and material are required' })
    }

    const lead = await prisma.lead.create({
      data: {
        name, email,
        phone:    phone    || 'Not provided',
        postcode, size, material,
        ...(quartzStyle && { quartzStyle }),
        ...(budget      && { budget }),
        ...(timeline    && { timeline }),
        ...(photoUrl    && { photoUrl }),
        ...(status      && { status }),
        ...(notes       && { notes }),
        source: 'Website',
        userId: 1
      }
    })

    res.status(201).json(lead)
  } catch (error) {
    res.status(500).json({ error: 'Failed to create lead' })
  }
})

// PUT — JWT protected
router.put('/:id', auth, async (req, res) => {
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