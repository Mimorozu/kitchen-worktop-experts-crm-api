// Tests the real backend pricing routes against an in-memory fake of Prisma. Does not touch any database.
const { createRequire } = require('module')

const API = require('path').resolve(__dirname, '..')
const req = createRequire(API + '/x.js')
process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long'

const express = req('express')

// ---- fake prisma: one user (for the token) and one pricing row
const users = [{ id: 7, email: 'staff@example.com', tokenVersion: 0 }]
let pricingRow = null

const fakePrisma = {
  user: {
    findUnique: async ({ where }) => users.find((u) => u.id === where.id) ?? null
  },
  pricing: {
    findUnique: async ({ where }) => (pricingRow && pricingRow.id === where.id ? pricingRow : null),
    upsert: async ({ where, update, create }) => {
      if (pricingRow && pricingRow.id === where.id) {
        pricingRow = { ...pricingRow, ...update, updatedAt: new Date() }
      } else {
        pricingRow = { ...create, updatedAt: new Date() }
      }
      return pricingRow
    }
  }
}
const prismaPath = req.resolve('./src/prisma.js')
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: fakePrisma }

const origLog = console.log
console.log = (...a) => {
  const s = a.join(' ')
  if (!s.startsWith('[pricing]')) origLog(...a)
  else origLog(s)
}

const { signSession } = req('./src/authUtils.js')
const pricingRouter = req('./src/routes/pricing.js')

const app = express()
app.use(express.json())
app.use('/api/pricing', pricingRouter)

let pass = 0
let fail = 0
const check = (name, cond, extra = '') => {
  if (cond) { pass++; origLog('PASS', name) } else { fail++; origLog('FAIL', name, extra) }
}

const call = (base, method, token, body) => fetch(base + '/api/pricing', {
  method,
  headers: {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: 'Bearer ' + token } : {})
  },
  body: body ? JSON.stringify(body) : undefined
})

;(async () => {
  const server = app.listen(0)
  const base = `http://127.0.0.1:${server.address().port}`
  const token = signSession(users[0])

  let r = await call(base, 'GET', null)
  check('GET without token -> 401', r.status === 401)

  r = await call(base, 'GET', token)
  let body = await r.json()
  check('GET with no row -> defaults', r.status === 200 && body.slabs.length === 41 && body.markup === 200, JSON.stringify(body).slice(0, 120))
  check('GET with no row writes nothing', pricingRow === null)

  r = await call(base, 'PUT', null, body)
  check('PUT without token -> 401', r.status === 401)

  r = await call(base, 'PUT', token, { ...body, vatRate: 2 })
  check('PUT invalid VAT -> 400', r.status === 400 && (await r.json()).error.includes('VAT'))
  check('invalid PUT did not write', pricingRow === null)

  r = await call(base, 'PUT', token, { ...body, slabs: [...body.slabs, { name: 'arctic', finishes: { Polished: { price20mm: 1, price30mm: 1 } } }] })
  check('PUT duplicate material (case-insensitive) -> 400', r.status === 400)

  const edited = { ...body, markup: 250, junkField: 'should be dropped' }
  r = await call(base, 'PUT', token, edited)
  body = await r.json()
  check('PUT valid -> 200', r.status === 200 && body.markup === 250)
  check('unknown fields dropped on save', body.junkField === undefined && pricingRow.data.junkField === undefined)

  r = await call(base, 'GET', token)
  body = await r.json()
  check('GET returns saved settings', body.markup === 250)

  r = await call(base, 'PUT', token, { ...body, slabs: [] })
  body = await r.json()
  check('empty materials list saves (valid)', r.status === 200 && body.slabs.length === 0)

  r = await call(base, 'PUT', token, { ...body, cuttingCosts: { '20mm': { 1: 900 }, '30mm': {} } })
  check('incomplete cutting costs -> 400', r.status === 400)

  origLog(`\n${pass} passed, ${fail} failed`)
  server.closeAllConnections()
  server.close()
  process.exitCode = fail ? 1 : 0
})().catch((e) => {
  origLog('ERROR', e)
  process.exit(1)
})
