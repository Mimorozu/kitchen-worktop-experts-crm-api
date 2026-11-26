// Lead alert emails (src/leadAlert.js). Stubs fetch; nothing is sent to Resend.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { sendLeadAlert } = require('../src/leadAlert')

const LEAD = { id: 7, name: 'Sarah Whitfield', phone: '07700 900123', email: 'sarah@example.com', postcode: 'SW1A 1AA', material: 'Quartz', size: 'Medium', source: 'Website' }

const setConfig = (on) => {
  if (on) {
    process.env.RESEND_API_KEY = 'test-key'
    process.env.LEAD_ALERT_EMAIL = 'ethan@kitchenworktopexperts.co.uk'
  } else {
    delete process.env.LEAD_ALERT_EMAIL
  }
}

test('without LEAD_ALERT_EMAIL: no email is sent', async () => {
  setConfig(false)
  let called = false
  globalThis.fetch = async () => { called = true; return { ok: true } }
  await sendLeadAlert(LEAD)
  assert.equal(called, false)
})

test('with configuration: sends the lead details through Resend', async () => {
  setConfig(true)
  let request
  globalThis.fetch = async (url, opts) => { request = { url, body: JSON.parse(opts.body) }; return { ok: true, status: 200 } }
  await sendLeadAlert(LEAD)
  assert.equal(request.url, 'https://api.resend.com/emails')
  assert.deepEqual(request.body.to, ['ethan@kitchenworktopexperts.co.uk'])
  assert.equal(request.body.subject, 'New lead: Sarah Whitfield')
  assert.match(request.body.text, /Postcode: SW1A 1AA/)
  assert.match(request.body.text, /Lead ID: 7/)
})

test('line breaks in lead fields cannot add lines to the email', async () => {
  setConfig(true)
  let text
  globalThis.fetch = async (url, opts) => { text = JSON.parse(opts.body).text; return { ok: true, status: 200 } }
  await sendLeadAlert({ ...LEAD, name: 'Evil\nBcc: x@example.com' })
  assert.doesNotMatch(text, /\nBcc:/)
})

test('Resend rejection is raised to the caller', async () => {
  setConfig(true)
  globalThis.fetch = async () => ({ ok: false, status: 500 })
  await assert.rejects(sendLeadAlert(LEAD), /Resend returned 500/)
})
