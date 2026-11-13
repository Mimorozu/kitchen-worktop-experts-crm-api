// Tests lead access rules in the real backend routes against an in-memory fake of Prisma. Does not touch any database.
const { createRequire } = require('module')

const API = require('path').resolve(__dirname, '..')
const req = createRequire(API + '/x.js')
process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long'
process.env.API_KEY = 'website-key-for-tests-only-0123456789'

const express = req('express')

const users = [
  { id: 7, email: 'staff-a@example.com', tokenVersion: 0 },
  { id: 8, email: 'staff-b@example.com', tokenVersion: 0 }
]
const leads = []
let nextId = 1
const calls = []

const fakePrisma = {
  user: { findUnique: async ({ where }) => users.find((u) => u.id === where.id) ?? null },
  lead: {
    create: async ({ data }) => {
      calls.push({ op: 'create', data })
      const lead = { id: nextId++, ...data }
      leads.push(lead)
      return lead
    },
    findMany: async () => leads,
    findUnique: async ({ where }) => leads.find((l) => l.id === where.id) ?? null,
    update: async ({ where, data }) => {
      calls.push({ op: 'update', data })
      const lead = leads.find((l) => l.id === where.id)
      if (!lead) throw Object.assign(new Error('not found'), { code: 'P2025' })
      Object.assign(lead, data)
      return lead
    }
  }
}
const prismaPath = req.resolve('./src/prisma.js')
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: fakePrisma }

const origLog = console.log
console.log = (...a) => { if (!String(a[0]).startsWith('[auth]')) origLog(...a) }
const origErr = console.error
console.error = () => {}

const { signSession } = req('./src/authUtils.js')
const leadsRouter = req('./src/routes/leads.js')

const app = express()
app.use(express.json())
app.use('/api/leads', leadsRouter)

let pass = 0
let fail = 0
const check = (name, cond, extra = '') => {
  if (cond) { pass++; origLog('PASS', name) } else { fail++; origLog('FAIL', name, extra) }
}

const newLeadBody = { name: 'Test Customer', email: 'c@example.com', postcode: 'SW1A 1AA', size: 'Medium', material: 'Quartz' }

;(async () => {
  const server = app.listen(0)
  const base = `http://127.0.0.1:${server.address().port}`
  const tokenA = signSession(users[0])
  const tokenB = signSession(users[1])
  const j = { 'Content-Type': 'application/json' }

  let r = await fetch(base + '/api/leads')
  check('list without auth -> 401', r.status === 401)

  r = await fetch(base + '/api/leads/1')
  check('get without auth -> 401', r.status === 401)

  r = await fetch(base + '/api/leads', { method: 'POST', headers: j, body: JSON.stringify(newLeadBody) })
  check('create without key or token -> 401', r.status === 401)

  r = await fetch(base + '/api/leads', { method: 'POST', headers: { ...j, Authorization: 'Bearer ' + tokenA }, body: JSON.stringify(newLeadBody) })
  let lead = await r.json()
  check('staff A create -> 201 and creator = A', r.status === 201 && lead.userId === 7, JSON.stringify(lead))

  r = await fetch(base + '/api/leads', { method: 'POST', headers: { ...j, 'x-api-key': process.env.API_KEY }, body: JSON.stringify(newLeadBody) })
  lead = await r.json()
  check('website (API key) create -> creator null', r.status === 201 && lead.userId === null, JSON.stringify(lead))

  r = await fetch(base + '/api/leads', { method: 'POST', headers: { ...j, 'x-api-key': 'wrong-key' }, body: JSON.stringify(newLeadBody) })
  check('wrong API key -> 401', r.status === 401)

  // team model: staff B can read and edit a lead created by staff A
  r = await fetch(base + '/api/leads', { headers: { Authorization: 'Bearer ' + tokenB } })
  const all = await r.json()
  check('staff B lists all leads', r.status === 200 && all.length === 2)

  r = await fetch(base + '/api/leads/1', { method: 'PUT', headers: { ...j, Authorization: 'Bearer ' + tokenB }, body: JSON.stringify({ status: 'Quoted', userId: 99 }) })
  lead = await r.json()
  check('staff B edits lead created by A -> 200', r.status === 200 && lead.status === 'Quoted')
  check('PUT cannot change creator', lead.userId === 7, JSON.stringify(lead))
  const lastUpdate = calls.filter((c) => c.op === 'update').pop()
  check('update payload has no userId', lastUpdate && lastUpdate.data.userId === undefined)

  r = await fetch(base + '/api/leads/999', { method: 'PUT', headers: { ...j, Authorization: 'Bearer ' + tokenB }, body: JSON.stringify({ status: 'Lost' }) })
  check('PUT unknown lead -> 404', r.status === 404)

  // input validation on the routes
  r = await fetch(base + '/api/leads', { method: 'POST', headers: { ...j, 'x-api-key': process.env.API_KEY }, body: JSON.stringify({ ...newLeadBody, email: 'not-an-email' }) })
  check('create with bad email -> 400', r.status === 400)
  r = await fetch(base + '/api/leads', { method: 'POST', headers: { ...j, 'x-api-key': process.env.API_KEY }, body: JSON.stringify({ ...newLeadBody, name: { $gt: '' } }) })
  check('create with object name -> 400', r.status === 400)
  r = await fetch(base + '/api/leads/1', { method: 'PUT', headers: { ...j, Authorization: 'Bearer ' + tokenB }, body: JSON.stringify({ status: 'Hacked' }) })
  check('update with unknown status -> 400', r.status === 400)
  r = await fetch(base + '/api/leads/abc', { headers: { Authorization: 'Bearer ' + tokenB } })
  check('non-numeric lead id -> 404 (not a database error)', r.status === 404)
  r = await fetch(base + '/api/leads/1/activity', { method: 'POST', headers: { ...j, Authorization: 'Bearer ' + tokenB }, body: JSON.stringify({ message: '   ' }) })
  check('blank activity note -> 400', r.status === 400)

  origLog(`\n${pass} passed, ${fail} failed`)
  server.closeAllConnections()
  server.close()
  process.exitCode = fail ? 1 : 0
})().catch((e) => {
  origLog('ERROR', e)
  process.exit(1)
})
