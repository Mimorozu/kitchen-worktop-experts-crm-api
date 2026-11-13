// Pricing settings for job quotes: validation and defaults.
// Stored as one row in the Pricing table (see src/routes/pricing.js).

const FINISHES = ['Polished', 'Velluto']
const THICKNESSES = ['20mm', '30mm']
const MAX_CUTTING_QTY = 4
const MAX_SLABS = 500

// BQS Quartz Composite price list (2026), £/m² ex. VAT. Source: BQS PRICE LIST 2026.pdf.
const DEFAULT_PRICING = {
  vatRate: 0.2,
  markup: 200,
  slabAreaM2: 5.12, // standard slab 320 x 160cm
  // Flat cutting cost by slab quantity (1-4; 4 also applies to larger orders) and thickness
  cuttingCosts: {
    '20mm': { 1: 900, 2: 1300, 3: 1600, 4: 1900 },
    '30mm': { 1: 1200, 2: 1500, 3: 1900, 4: 2200 }
  },
  slabs: [
    { name: 'Arctic', finishes: { Polished: { price20mm: 137.5, price30mm: 166.6 } } },
    { name: 'Aurora Dune', finishes: {
      Polished: { price20mm: 136.1, price30mm: 162.3 },
      Velluto: { price20mm: 142.6, price30mm: 168.8 }
    } },
    { name: 'Avenza', finishes: { Polished: { price20mm: 137.5, price30mm: 166.6 } } },
    { name: 'Beige Mirrorlux', finishes: { Polished: { price20mm: 66.8, price30mm: 88.7 } } },
    { name: 'Bianco Fontana', finishes: {
      Polished: { price20mm: 130.3, price30mm: 159.4 },
      Velluto: { price20mm: 136.8, price30mm: 165.9 }
    } },
    { name: 'Bianco Massa', finishes: { Polished: { price20mm: 79.8, price30mm: 108.9 } } },
    { name: 'Bianco Venatino', finishes: { Polished: { price20mm: 79.8, price30mm: 108.9 } } },
    { name: 'Black Mirrorlux', finishes: { Polished: { price20mm: 66.8, price30mm: 88.7 } } },
    { name: 'Blanco Mist', finishes: { Polished: { price20mm: 75, price30mm: 97 } } },
    { name: 'Borealis Green', finishes: {
      Polished: { price20mm: 136.1, price30mm: 162.3 },
      Velluto: { price20mm: 142.6, price30mm: 168.8 }
    } },
    { name: 'Calacatta Aurora', finishes: { Polished: { price20mm: 137.5, price30mm: 166.6 } } },
    { name: 'Calacatta Forte', finishes: { Polished: { price20mm: 123.1, price30mm: 147.8 } } },
    { name: 'Calacatta Viola', finishes: { Polished: { price20mm: 134.6, price30mm: 163.7 } } },
    { name: 'Canaletto', finishes: { Polished: { price20mm: 137.5, price30mm: 166.6 } } },
    { name: 'Capri', finishes: {
      Polished: { price20mm: 137.5, price30mm: 166.6 },
      Velluto: { price20mm: 144, price30mm: 173.1 }
    } },
    { name: 'Cararra Extra', finishes: {
      Polished: { price20mm: 87, price30mm: 116.1 },
      Velluto: { price20mm: 93.5, price30mm: 122.6 }
    } },
    { name: 'Carrara Minari', finishes: { Polished: { price20mm: 97, price30mm: 126 } } },
    { name: 'Crema Fiore', finishes: {
      Polished: { price20mm: 137.5, price30mm: 166.6 },
      Velluto: { price20mm: 144, price30mm: 173.1 }
    } },
    { name: 'Desert Grey', finishes: { Polished: { price20mm: 79.8, price30mm: 108.9 } } },
    { name: 'Elegant Grey', finishes: { Polished: { price20mm: 79.8, price30mm: 108.9 } } },
    { name: 'Glacier', finishes: {
      Polished: { price20mm: 123.1, price30mm: 152.2 },
      Velluto: { price20mm: 129.6, price30mm: 158.7 }
    } },
    { name: 'Gracious', finishes: { Polished: { price20mm: 108.7, price30mm: 137.7 } } },
    { name: 'Grey Mirrorlux', finishes: { Polished: { price20mm: 66.8, price30mm: 88.7 } } },
    { name: 'Grey Shimmer', finishes: { Polished: { price20mm: 68.3, price30mm: 93 } } },
    { name: 'Lumen Ice', finishes: {
      Polished: { price20mm: 136.1, price30mm: 162.3 },
      Velluto: { price20mm: 142.6, price30mm: 168.8 }
    } },
    { name: 'Midas Gold', finishes: { Polished: { price20mm: 80, price30mm: 102 } } },
    { name: 'Neo Calacatta', finishes: { Polished: { price20mm: 130.3, price30mm: 159.4 } } },
    { name: 'Opus White', finishes: {
      Polished: { price20mm: 68.3, price30mm: 93 },
      Velluto: { price20mm: 74.8, price30mm: 99.5 }
    } },
    { name: 'Pearl White', finishes: { Polished: { price20mm: 75.5, price30mm: 104.5 } } },
    { name: 'Permafrost', finishes: {
      Polished: { price20mm: 123.1, price30mm: 152.2 },
      Velluto: { price20mm: 129.6, price30mm: 158.7 }
    } },
    { name: 'Pietra Modena', finishes: { Polished: { price20mm: 130.3, price30mm: 159.4 } } },
    { name: 'Rapture', finishes: { Polished: { price20mm: 108.7, price30mm: 137.7 } } },
    { name: 'Roma', finishes: { Polished: { price20mm: 101.4, price30mm: 130.5 } } },
    { name: 'Siberia', finishes: { Polished: { price20mm: 108.7, price30mm: 137.7 } } },
    { name: 'Statuario Gold', finishes: { Polished: { price20mm: 120.2, price30mm: 149.3 } } },
    { name: 'Statuario Grey', finishes: { Polished: { price20mm: 120.2, price30mm: 149.3 } } },
    { name: 'Super White Plus', finishes: {
      Polished: { price20mm: 87, price30mm: 116.1 },
      Velluto: { price20mm: 93.5, price30mm: 122.6 }
    } },
    { name: 'Taj Mahal', finishes: {
      Polished: { price20mm: 146.2, price30mm: 176.1 },
      Velluto: { price20mm: 152.7, price30mm: 182.6 }
    } },
    { name: 'White Almond', finishes: { Polished: { price20mm: 68.3, price30mm: 93 } } },
    { name: 'White Mirrorlux', finishes: { Polished: { price20mm: 66.8, price30mm: 88.7 } } },
    { name: 'White Shimmer', finishes: { Polished: { price20mm: 68.3, price30mm: 93 } } }
  ]
}

const isNonNegNumber = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0

// Checks and cleans a pricing object. Returns { value } or { error }. Unknown fields are dropped.
function validatePricing(input) {
  if (!input || typeof input !== 'object') return { error: 'Pricing must be an object' }
  const { vatRate, markup, slabAreaM2, cuttingCosts, slabs } = input

  if (typeof vatRate !== 'number' || !Number.isFinite(vatRate) || vatRate < 0 || vatRate > 1) {
    return { error: 'VAT rate must be between 0% and 100%' }
  }
  if (!isNonNegNumber(markup)) return { error: 'Markup must be a number of 0 or more' }
  if (typeof slabAreaM2 !== 'number' || !Number.isFinite(slabAreaM2) || slabAreaM2 <= 0) {
    return { error: 'Slab area must be greater than 0' }
  }

  const cleanCutting = {}
  for (const thickness of THICKNESSES) {
    cleanCutting[thickness] = {}
    for (let qty = 1; qty <= MAX_CUTTING_QTY; qty++) {
      const cost = cuttingCosts?.[thickness]?.[qty]
      if (!isNonNegNumber(cost)) return { error: `Cutting cost for ${thickness}, ${qty} slab(s) must be 0 or more` }
      cleanCutting[thickness][qty] = cost
    }
  }

  if (!Array.isArray(slabs) || slabs.length > MAX_SLABS) {
    return { error: `Materials must be a list of up to ${MAX_SLABS} entries` }
  }
  const seenNames = new Set()
  const cleanSlabs = []
  for (const slab of slabs) {
    const name = typeof slab?.name === 'string' ? slab.name.trim() : ''
    if (!name || name.length > 100) return { error: 'Every material needs a name of up to 100 characters' }
    const key = name.toLowerCase()
    if (seenNames.has(key)) return { error: `Duplicate material name: ${name}` }
    seenNames.add(key)

    const finishes = {}
    for (const [finish, prices] of Object.entries(slab.finishes || {})) {
      if (!FINISHES.includes(finish)) return { error: `Unknown finish for ${name}: ${finish}` }
      if (!isNonNegNumber(prices?.price20mm) || !isNonNegNumber(prices?.price30mm)) {
        return { error: `Prices for ${name} (${finish}) must be 0 or more` }
      }
      finishes[finish] = { price20mm: prices.price20mm, price30mm: prices.price30mm }
    }
    if (Object.keys(finishes).length === 0) return { error: `${name} needs at least one finish` }
    cleanSlabs.push({ name, finishes })
  }

  return {
    value: { vatRate, markup, slabAreaM2, cuttingCosts: cleanCutting, slabs: cleanSlabs }
  }
}

module.exports = { DEFAULT_PRICING, validatePricing }
