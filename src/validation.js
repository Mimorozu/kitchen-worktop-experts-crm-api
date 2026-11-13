// Input rules for lead and activity writes. Everything is checked here before it reaches the database.
// Unknown fields are dropped, so a request can't set columns that aren't listed.

const LEAD_STATUSES = ['New', 'Contacted', 'Quoted', 'Booked', 'Fitted', 'Invoiced', 'Lost']
const LEAD_SOURCES = ['Website', 'Referral', 'Phone', 'Google Ads', 'Trade Show', 'Other']
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DATE_FIELDS = ['templateDate', 'installDate', 'kitchenInstallDate', 'warehouseVisitDate', 'followUpDate']
const REQUIRED_ON_CREATE = ['name', 'email', 'postcode', 'size', 'material']
const MAX_QUOTE_VALUE = 10000000
const MAX_ACTIVITY_LENGTH = 2000

// Maximum length of each text field
const TEXT_LIMITS = {
  name: 120, email: 254, phone: 40, postcode: 12, size: 40, material: 80,
  addressLine1: 200, addressLine2: 200, quartzStyle: 120, kitchenColour: 120, kitchenStyle: 120,
  floorColour: 120, handleColour: 120, wallColour: 120, specialFeatures: 500,
  selectedMaterial: 120, budget: 60, timeline: 60, photoUrl: 2000, notes: 5000
}

const isBlank = (v) => v === undefined || v === null || v === ''

// Returns { value } with the fields to write, or { error }.
// On an update, pass the stored lead as `existing`: a field that still holds the same value is not
// re-checked, so records saved before these rules still save when another field changes.
function validateLead(body, { existing = null, creating = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Request body must be an object' }

  if (creating) {
    for (const field of REQUIRED_ON_CREATE) {
      if (isBlank(body[field])) return { error: `${field} is required` }
    }
  }

  const value = {}

  for (const [field, max] of Object.entries(TEXT_LIMITS)) {
    const raw = body[field]
    if (isBlank(raw)) continue
    if (typeof raw !== 'string') return { error: `${field} must be text` }
    const text = raw.trim()
    if (existing && existing[field] === text) continue
    if (text.length > max) return { error: `${field} must be ${max} characters or fewer` }
    if (field === 'email' && !EMAIL_PATTERN.test(text)) return { error: 'email is not a valid address' }
    value[field] = text
  }

  if (!isBlank(body.status) && (!existing || existing.status !== body.status)) {
    if (!LEAD_STATUSES.includes(body.status)) return { error: `status must be one of: ${LEAD_STATUSES.join(', ')}` }
    value.status = body.status
  }

  if (!isBlank(body.source) && (!existing || existing.source !== body.source)) {
    if (!LEAD_SOURCES.includes(body.source)) return { error: `source must be one of: ${LEAD_SOURCES.join(', ')}` }
    value.source = body.source
  }

  for (const field of DATE_FIELDS) {
    const raw = body[field]
    if (isBlank(raw)) continue
    if (typeof raw !== 'string' || Number.isNaN(Date.parse(raw))) return { error: `${field} must be a valid date` }
    const date = new Date(raw)
    if (existing && existing[field] && new Date(existing[field]).getTime() === date.getTime()) continue
    value[field] = date
  }

  if (!isBlank(body.quoteValue)) {
    const n = typeof body.quoteValue === 'number' ? body.quoteValue : Number(body.quoteValue)
    if (!Number.isFinite(n) || n < 0 || n > MAX_QUOTE_VALUE) {
      return { error: `quoteValue must be a number from 0 to ${MAX_QUOTE_VALUE}` }
    }
    if (!existing || existing.quoteValue !== n) value.quoteValue = n
  }

  return { value }
}

// Activity notes: text, not blank, capped in length. Returns { value } or { error }.
function validateActivityMessage(message) {
  if (typeof message !== 'string' || !message.trim()) return { error: 'message is required' }
  const text = message.trim()
  if (text.length > MAX_ACTIVITY_LENGTH) return { error: `message must be ${MAX_ACTIVITY_LENGTH} characters or fewer` }
  return { value: text }
}

// Route ids are positive whole numbers. Returns the number, or null for anything else.
const parseId = (raw) => (/^[1-9]\d{0,9}$/.test(String(raw)) ? Number(raw) : null)

module.exports = {
  LEAD_STATUSES, LEAD_SOURCES, validateLead, validateActivityMessage, parseId
}
