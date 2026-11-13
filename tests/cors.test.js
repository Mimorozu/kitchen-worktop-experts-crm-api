// Browser access rules (src/cors.js). Runs a small Express app; no database involved.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')

const FRONTEND = 'https://kitchen-worktop-experts-crm-front-e.vercel.app'
process.env.FRONTEND_URL = FRONTEND

const { corsMiddleware } = require('../src/cors')

const app = express()
app.use(corsMiddleware)
app.get('/ping', (req, res) => res.json({ ok: true }))

const withServer = async (fn) => {
  const server = app.listen(0)
  try {
    await fn(`http://127.0.0.1:${server.address().port}`)
  } finally {
    server.closeAllConnections()
    server.close()
  }
}

test('frontend origin is allowed', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/ping`, { headers: { Origin: FRONTEND } })
    assert.equal(res.headers.get('access-control-allow-origin'), FRONTEND)
  })
})

test('other websites are not allowed', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/ping`, { headers: { Origin: 'https://evil.example.com' } })
    assert.equal(res.headers.get('access-control-allow-origin'), null)
  })
})

test('look-alike origins are not allowed', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/ping`, { headers: { Origin: FRONTEND.replace('https://', 'https://evil.') } })
    assert.equal(res.headers.get('access-control-allow-origin'), null)
  })
})

test('requests with no origin still succeed (tools, server-to-server)', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/ping`)
    assert.equal(res.status, 200)
  })
})

test('public website origins are allowed', async () => {
  await withServer(async (base) => {
    for (const origin of ['https://www.kitchenworktopexperts.co.uk', 'https://kitchenworktopexperts.co.uk']) {
      const res = await fetch(`${base}/ping`, { headers: { Origin: origin } })
      assert.equal(res.headers.get('access-control-allow-origin'), origin)
    }
  })
})
