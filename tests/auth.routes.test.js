// Tests the real backend auth routes against an in-memory fake of Prisma. Does not touch any database.
const { createRequire } = require('module')
const crypto = require('crypto')

const API = require('path').resolve(__dirname, '..')
const req = createRequire(API + '/x.js')
process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long'
delete process.env.NODE_ENV

const express = req('express')
const bcrypt = req('bcryptjs')

// ---- fake prisma
const users = []
let nextId = 1

const fakePrisma = {
  user: {
    findFirst: async ({ where }) => users.find((u) => {
      if (where.email) {
        // mirrors Prisma mode: 'insensitive'
        return u.email.toLowerCase() === where.email.equals.toLowerCase()
      }
      return Object.entries(where).every(([k, v]) => u[k] === v)
    }) ?? null,
    findUnique: async ({ where }) => users.find((u) => u.id === where.id) ?? null,
    create: async ({ data }) => {
      const u = { id: nextId++, tokenVersion: 0, failedLogins: 0, lockedUntil: null, emailVerified: false, ...data }
      users.push(u)
      return u
    },
    update: async ({ where, data }) => {
      const u = users.find((x) => x.id === where.id)
      for (const [k, v] of Object.entries(data)) {
        u[k] = v && typeof v === 'object' && 'increment' in v ? u[k] + v.increment : v
      }
      return u
    }
  }
}
const prismaPath = req.resolve('./src/prisma.js')
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: fakePrisma }

// capture mail output so tests can read tokens
const mailLog = []
const origLog = console.log
console.log = (...a) => {
  const s = a.join(' ')
  if (s.startsWith('[mail]')) mailLog.push(s)
  else origLog(...a)
}

const authRouter = req('./src/routes/auth.js')
const authMiddleware = req('./src/middleware/auth.js')
const { getJwtSecret } = req('./src/authUtils.js')

const app = express()
app.use(express.json())
app.use('/api/auth', authRouter)
app.get('/protected', authMiddleware, (r, res) => res.json({ user: r.user }))

const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex')
const tokenFrom = (kind) => {
  const line = [...mailLog].reverse().find((l) => l.includes(kind))
  return line.match(/token=([A-Za-z0-9_-]+)/)[1]
}

let pass = 0
let fail = 0
const check = (name, cond, extra = '') => {
  if (cond) { pass++; origLog('PASS', name) } else { fail++; origLog('FAIL', name, extra) }
}

const post = (base, p, body) => fetch(base + p, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
})
const get = (base, p, token) => fetch(base + p, { headers: token ? { Authorization: 'Bearer ' + token } : {} })

;(async () => {
  const server = app.listen(0)
  const base = `http://127.0.0.1:${server.address().port}`

  // seed: an unverified user with a verify token, and a verified user
  const pw = 'correct-horse-battery'
  users.push({
    id: nextId++, email: 'new@example.com', password: await bcrypt.hash(pw, 4), emailVerified: false,
    verifyTokenHash: sha256('verify-me-token'), verifyExpiresAt: new Date(Date.now() + 60000),
    failedLogins: 0, lockedUntil: null, tokenVersion: 0
  })
  users.push({
    id: nextId++, email: 'Old.User@example.com', password: await bcrypt.hash(pw, 4), emailVerified: true,
    failedLogins: 0, lockedUntil: null, tokenVersion: 0
  })

  let r = await post(base, '/api/auth/register', { email: 'x@y.com', password: pw })
  check('register route removed', r.status === 404)

  r = await post(base, '/api/auth/login', { email: 'new@example.com', password: pw })
  check('unverified login -> 403', r.status === 403)

  users[0].verifyExpiresAt = new Date(Date.now() - 1000)
  r = await post(base, '/api/auth/verify', { token: 'verify-me-token' })
  check('expired verify token -> 400', r.status === 400)
  users[0].verifyExpiresAt = new Date(Date.now() + 60000)

  r = await post(base, '/api/auth/verify', { token: 'verify-me-token' })
  check('verify ok -> 200', r.status === 200)
  r = await post(base, '/api/auth/verify', { token: 'verify-me-token' })
  check('verify token single use', r.status === 400)

  r = await post(base, '/api/auth/login', { email: 'old.user@EXAMPLE.com', password: pw })
  const body = await r.json()
  check('login mixed-case email -> token', r.status === 200 && !!body.token, JSON.stringify(body))
  const token = body.token

  r = await get(base, '/protected', token)
  check('protected with valid token -> 200', r.status === 200)
  r = await get(base, '/protected', 'forged.token.value')
  check('forged token -> 401', r.status === 401)
  r = await get(base, '/protected')
  check('no token -> 401', r.status === 401)

  r = await post(base, '/api/auth/login', { email: 'nobody@example.com', password: pw })
  const unk = await r.json()
  check('unknown email -> 401 generic', r.status === 401 && unk.error === 'Invalid credentials')

  // account lockout after 5 wrong passwords
  for (let i = 0; i < 4; i++) await post(base, '/api/auth/login', { email: 'Old.User@example.com', password: 'wrong-password-xx' })
  r = await post(base, '/api/auth/login', { email: 'Old.User@example.com', password: 'wrong-password-xx' })
  check('5th wrong password -> 401', r.status === 401)
  r = await post(base, '/api/auth/login', { email: 'Old.User@example.com', password: pw })
  check('locked account rejects correct password -> 429', r.status === 429)

  // reset flow: forgot -> reset clears lock, revokes old session, token single use
  await post(base, '/api/auth/forgot', { email: 'old.user@example.com' })
  const resetToken = tokenFrom('reset')
  r = await post(base, '/api/auth/reset', { token: resetToken, password: 'short' })
  check('reset weak password -> 400', r.status === 400)
  r = await post(base, '/api/auth/reset', { token: resetToken, password: 'brand-new-password-1' })
  check('reset ok -> 200', r.status === 200)
  r = await get(base, '/protected', token)
  check('old session revoked after reset -> 401', r.status === 401)
  r = await post(base, '/api/auth/reset', { token: resetToken, password: 'another-password-2' })
  check('reset token single use', r.status === 400)
  r = await post(base, '/api/auth/login', { email: 'Old.User@example.com', password: 'brand-new-password-1' })
  check('login with new password after reset -> 200', r.status === 200)

  // forgot is generic for unknown email and sends nothing
  const before = mailLog.length
  r = await post(base, '/api/auth/forgot', { email: 'ghost@example.com' })
  const ghost = await r.json()
  check('forgot unknown -> generic 200, no mail', r.status === 200 && mailLog.length === before && ghost.message.startsWith('If that account exists'))

  check('password stored hashed', users[1].password.startsWith('$2') && users[1].password !== 'brand-new-password-1')

  process.env.JWT_SECRET = 'short'
  let threw = false
  try { getJwtSecret() } catch { threw = true }
  check('short JWT_SECRET refused', threw)
  process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long'

  // IP lockout: 20 failures from one IP across unknown emails, then a valid login from that IP is blocked
  for (let i = 0; i < 20; i++) await post(base, '/api/auth/login', { email: `ghost${i}@example.com`, password: 'wrong-password-xx' })
  r = await post(base, '/api/auth/login', { email: 'Old.User@example.com', password: 'brand-new-password-1' })
  check('IP lockout after 20 failures -> 429', r.status === 429)

  origLog(`\n${pass} passed, ${fail} failed`)
  server.closeAllConnections()
  server.close()
  process.exitCode = fail ? 1 : 0
})().catch((e) => {
  origLog('ERROR', e)
  process.exit(1)
})
