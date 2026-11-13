// Auth routes: login, email verification and password reset.
// There is no public sign-up. Accounts are created with scripts/create-user.js.

const express = require('express')
const bcrypt = require('bcryptjs')
const prisma = require('../prisma')
const { sendMail, frontendUrl } = require('../mailer')
const {
  sha256, newToken, isValidPassword, PASSWORD_RULE, signSession, logAuth
} = require('../authUtils')

const router = express.Router()

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000
const RESET_TTL_MS = 60 * 60 * 1000
const LOCKOUT_MS = 15 * 60 * 1000
const MAX_FAILED_PER_ACCOUNT = 5
const MAX_FAILED_PER_IP = 20
const BCRYPT_ROUNDS = 12
const MAX_PASSWORD_INPUT = 1024

// Used when the email is unknown, so login takes the same time either way
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS)

// Per-IP failure counter. Lives in memory, so it resets on restart and isn't shared between instances.
const ipFailures = new Map() // ip -> { count, lockedUntil }
const ipLocked = (ip) => {
  const entry = ipFailures.get(ip)
  return !!entry && entry.lockedUntil > Date.now()
}
const recordIpFailure = (ip) => {
  const entry = ipFailures.get(ip) ?? { count: 0, lockedUntil: 0 }
  entry.count += 1
  if (entry.count >= MAX_FAILED_PER_IP) {
    entry.lockedUntil = Date.now() + LOCKOUT_MS
    entry.count = 0
  }
  ipFailures.set(ip, entry)
}

const normaliseEmail = (email) => email.trim().toLowerCase()

// Matches existing rows regardless of how the email was typed when the account was created
const findUserByEmail = (email) =>
  prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } })

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body ?? {}
    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password ||
        password.length > MAX_PASSWORD_INPUT) {
      return res.status(400).json({ error: 'email and password are required' })
    }

    if (ipLocked(req.ip)) {
      logAuth('login_locked', { ip: req.ip })
      return res.status(429).json({ error: 'Too many failed attempts. Try again in 15 minutes.' })
    }

    const key = normaliseEmail(email)
    const user = await findUserByEmail(key)

    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      logAuth('login_locked', { email: key, ip: req.ip })
      return res.status(429).json({ error: 'Too many failed attempts. Try again in 15 minutes.' })
    }

    const passwordOk = await bcrypt.compare(password, user ? user.password : DUMMY_HASH)
    if (!user || !passwordOk) {
      recordIpFailure(req.ip)
      if (user) {
        const failedLogins = user.failedLogins + 1
        const locking = failedLogins >= MAX_FAILED_PER_ACCOUNT
        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLogins: locking ? 0 : failedLogins,
            lockedUntil: locking ? new Date(Date.now() + LOCKOUT_MS) : user.lockedUntil
          }
        })
      }
      logAuth('login_failed', { email: key, ip: req.ip })
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    if (!user.emailVerified) {
      logAuth('login_unverified', { email: key, ip: req.ip })
      return res.status(403).json({ error: 'Verify your email before logging in' })
    }

    if (user.failedLogins > 0 || user.lockedUntil) {
      await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } })
    }
    logAuth('login_success', { email: key, ip: req.ip })
    res.json({ token: signSession(user) })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ error: 'Login failed' })
  }
})

// POST /api/auth/verify  { token }
router.post('/verify', async (req, res) => {
  try {
    const { token } = req.body ?? {}
    if (typeof token !== 'string' || !token) return res.status(400).json({ error: 'Verification link is invalid' })

    const user = await prisma.user.findFirst({ where: { verifyTokenHash: sha256(token) } })
    if (!user || !user.verifyExpiresAt || user.verifyExpiresAt < new Date()) {
      return res.status(400).json({ error: 'Verification link is invalid or has expired' })
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, verifyTokenHash: null, verifyExpiresAt: null }
    })
    logAuth('email_verified', { email: user.email })
    res.json({ message: 'Email verified. You can now log in.' })
  } catch (error) {
    console.error('Verify error:', error)
    res.status(500).json({ error: 'Verification failed' })
  }
})

// POST /api/auth/forgot  { email } — same reply whether or not the account exists
router.post('/forgot', async (req, res) => {
  try {
    const email = typeof req.body?.email === 'string' ? normaliseEmail(req.body.email) : ''
    const user = email ? await findUserByEmail(email) : null

    if (user && user.emailVerified) {
      const resetToken = newToken()
      await prisma.user.update({
        where: { id: user.id },
        data: { resetTokenHash: sha256(resetToken), resetExpiresAt: new Date(Date.now() + RESET_TTL_MS) }
      })
      await sendMail({
        to: user.email,
        subject: 'Reset your CRM password',
        text: `Reset your password within 1 hour:\n${frontendUrl()}/reset-password?token=${resetToken}`
      })
    }

    logAuth('password_reset_requested', { email, ip: req.ip, found: !!user })
    res.json({ message: 'If that account exists, a reset link has been sent.' })
  } catch (error) {
    console.error('Forgot password error:', error)
    res.status(500).json({ error: 'Request failed' })
  }
})

// POST /api/auth/reset  { token, password } — bumps tokenVersion, so every existing session stops working
router.post('/reset', async (req, res) => {
  try {
    const { token, password } = req.body ?? {}
    if (typeof token !== 'string' || !token) return res.status(400).json({ error: 'Reset link is invalid' })
    if (!isValidPassword(password)) return res.status(400).json({ error: PASSWORD_RULE })

    const user = await prisma.user.findFirst({ where: { resetTokenHash: sha256(token) } })
    if (!user || !user.resetExpiresAt || user.resetExpiresAt < new Date()) {
      return res.status(400).json({ error: 'Reset link is invalid or has expired' })
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: await bcrypt.hash(password, BCRYPT_ROUNDS),
        resetTokenHash: null,
        resetExpiresAt: null,
        failedLogins: 0,
        lockedUntil: null,
        tokenVersion: { increment: 1 }
      }
    })
    logAuth('password_reset', { email: user.email })
    res.json({ message: 'Password updated. Please log in.' })
  } catch (error) {
    console.error('Reset error:', error)
    res.status(500).json({ error: 'Reset failed' })
  }
})

module.exports = router
