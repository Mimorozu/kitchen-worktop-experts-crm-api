// WhatsApp lead alerts (src/whatsapp.js). Stubs fetch; nothing is sent to Meta.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { sendLeadAlert, clean } = require('../src/whatsapp')

const LEAD = { id: 7, name: 'Sarah Whitfield', postcode: 'SW1A 1AA', material: 'Quartz' }

const setConfig = (on) => {
  if (on) {
    process.env.WHATSAPP_TOKEN = 'test-token'
    process.env.WHATSAPP_PHONE_NUMBER_ID = '123456789'
    process.env.WHATSAPP_ALERT_TO = '447700900000'
  } else {
    delete process.env.WHATSAPP_TOKEN
    delete process.env.WHATSAPP_PHONE_NUMBER_ID
    delete process.env.WHATSAPP_ALERT_TO
  }
}

test('without configuration: no request is made', async () => {
  setConfig(false)
  let called = false
  globalThis.fetch = async () => { called = true; return { ok: true } }
  await sendLeadAlert(LEAD)
  assert.equal(called, false)
})

test('with configuration: posts a template message to the Cloud API', async () => {
  setConfig(true)
  let request
  globalThis.fetch = async (url, opts) => { request = { url, opts }; return { ok: true, status: 200 } }
  await sendLeadAlert(LEAD)
  assert.equal(request.url, 'https://graph.facebook.com/v21.0/123456789/messages')
  assert.equal(request.opts.headers.Authorization, 'Bearer test-token')
  const body = JSON.parse(request.opts.body)
  assert.equal(body.messaging_product, 'whatsapp')
  assert.equal(body.to, '447700900000')
  assert.equal(body.type, 'template')
  assert.equal(body.template.name, 'new_lead_alert')
  assert.deepEqual(
    body.template.components[0].parameters.map((p) => p.text),
    ['Sarah Whitfield', 'SW1A 1AA', 'Quartz']
  )
})

test('Meta rejection is raised to the caller', async () => {
  setConfig(true)
  globalThis.fetch = async () => ({ ok: false, status: 401 })
  await assert.rejects(sendLeadAlert(LEAD), /WhatsApp returned 401/)
})

test('template parameters are cleaned: no line breaks, capped length, never empty', () => {
  assert.equal(clean('Line one\nLine two'), 'Line one Line two')
  assert.equal(clean('x'.repeat(200)).length, 60)
  assert.equal(clean(''), '-')
  assert.equal(clean(null), '-')
})
