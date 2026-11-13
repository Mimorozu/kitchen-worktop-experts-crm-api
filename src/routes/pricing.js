const express = require('express')
const prisma = require('../prisma')
const auth = require('../middleware/auth')
const { DEFAULT_PRICING, validatePricing } = require('../pricingSettings')

// Quote pricing settings. Any signed-in staff user can read and change them.
// Until the first save, the defaults are returned and nothing is written.
const router = express.Router()
const ROW_ID = 1

// GET /api/pricing
router.get('/', auth, async (req, res) => {
  try {
    const row = await prisma.pricing.findUnique({ where: { id: ROW_ID } })
    res.json(row ? row.data : DEFAULT_PRICING)
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed to load pricing' })
  }
})

// PUT /api/pricing — validates the whole object, then replaces the saved settings
router.put('/', auth, async (req, res) => {
  try {
    const result = validatePricing(req.body)
    if (result.error) return res.status(400).json({ error: result.error })

    await prisma.pricing.upsert({
      where: { id: ROW_ID },
      update: { data: result.value },
      create: { id: ROW_ID, data: result.value }
    })
    console.log(`[pricing] settings updated by user ${req.user.id}`)
    res.json(result.value)
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed to save pricing' })
  }
})

module.exports = router
