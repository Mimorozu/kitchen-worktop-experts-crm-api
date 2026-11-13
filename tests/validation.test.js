// Input rules for lead and activity writes (src/validation.js). Pure functions, no database.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { validateLead, validateActivityMessage, parseId } = require('../src/validation')

const valid = { name: 'Sarah', email: 'sarah@example.com', postcode: 'SW1A 1AA', size: 'Medium', material: 'Quartz' }

test('create: a complete valid lead passes', () => {
  const r = validateLead(valid, { creating: true })
  assert.equal(r.error, undefined)
  assert.equal(r.value.email, 'sarah@example.com')
})

test('create: each required field is enforced', () => {
  for (const field of ['name', 'email', 'postcode', 'size', 'material']) {
    const body = { ...valid, [field]: '' }
    assert.match(validateLead(body, { creating: true }).error, new RegExp(`${field} is required`))
  }
})

test('text: must be a string, not an object or array', () => {
  assert.match(validateLead({ ...valid, name: { $gt: '' } }, { creating: true }).error, /name must be text/)
  assert.match(validateLead({ ...valid, notes: ['a'] }, { creating: true }).error, /notes must be text/)
})

test('text: length limits are enforced', () => {
  assert.match(validateLead({ ...valid, name: 'x'.repeat(121) }, { creating: true }).error, /name must be 120/)
  assert.equal(validateLead({ ...valid, name: 'x'.repeat(120) }, { creating: true }).error, undefined)
})

test('text: whitespace is trimmed before saving', () => {
  const r = validateLead({ ...valid, name: '  Sarah  ' }, { creating: true })
  assert.equal(r.value.name, 'Sarah')
})

test('email: rejects malformed addresses', () => {
  for (const email of ['not-an-email', 'a@b', 'a b@c.com', '@x.com']) {
    assert.match(validateLead({ ...valid, email }, { creating: true }).error, /valid address/, email)
  }
})

test('status: must be one of the known statuses', () => {
  assert.equal(validateLead({ status: 'Quoted' }).value.status, 'Quoted')
  assert.match(validateLead({ status: 'Hacked' }).error, /status must be one of/)
})

test('source: must be one of the known sources', () => {
  assert.equal(validateLead({ source: 'Referral' }).value.source, 'Referral')
  assert.match(validateLead({ source: 'Pigeon' }).error, /source must be one of/)
})

test('dates: must parse, and are stored as Date objects', () => {
  const r = validateLead({ followUpDate: '2026-08-04' })
  assert.ok(r.value.followUpDate instanceof Date)
  assert.match(validateLead({ followUpDate: 'next tuesday' }).error, /valid date/)
  assert.match(validateLead({ followUpDate: 12345 }).error, /valid date/)
})

test('quoteValue: numbers and numeric strings within range', () => {
  assert.equal(validateLead({ quoteValue: '3900' }).value.quoteValue, 3900)
  assert.equal(validateLead({ quoteValue: 0 }).value.quoteValue, 0)
  assert.match(validateLead({ quoteValue: -1 }).error, /quoteValue must be/)
  assert.match(validateLead({ quoteValue: 'lots' }).error, /quoteValue must be/)
  assert.match(validateLead({ quoteValue: 1e12 }).error, /quoteValue must be/)
})

test('blank optional fields are skipped, not written', () => {
  const r = validateLead({ notes: '', quoteValue: '', followUpDate: null })
  assert.deepEqual(r.value, {})
})

test('unknown fields are ignored (cannot set columns such as userId)', () => {
  const r = validateLead({ userId: 99, id: 5, createdAt: '2000-01-01' })
  assert.deepEqual(r.value, {})
})

test('update: unchanged legacy values are not re-checked', () => {
  // a record saved before the rules: its source is not in the list, but it isn't being changed
  const existing = { source: 'Airtable import', status: 'New', email: 'old@example.com', quoteValue: 500 }
  const r = validateLead({ source: 'Airtable import', status: 'New', email: 'old@example.com', quoteValue: '500', notes: 'hi' }, { existing })
  assert.equal(r.error, undefined)
  assert.deepEqual(r.value, { notes: 'hi' })
})

test('update: a changed legacy value is checked', () => {
  const existing = { source: 'Airtable import' }
  assert.match(validateLead({ source: 'Airtable import2' }, { existing }).error, /source must be one of/)
})

test('activity: message must be text, not blank, and capped', () => {
  assert.equal(validateActivityMessage('  rang back  ').value, 'rang back')
  assert.match(validateActivityMessage('   ').error, /required/)
  assert.match(validateActivityMessage(undefined).error, /required/)
  assert.match(validateActivityMessage({ $ne: 1 }).error, /required/)
  assert.match(validateActivityMessage('x'.repeat(2001)).error, /2000/)
})

test('parseId: accepts positive whole numbers only', () => {
  assert.equal(parseId('12'), 12)
  assert.equal(parseId('0'), null)
  assert.equal(parseId('-3'), null)
  assert.equal(parseId('1.5'), null)
  assert.equal(parseId('abc'), null)
  assert.equal(parseId('1e3'), null)
  assert.equal(parseId('12345678901'), null)
})
