// Shared auth helpers: JWT sessions, token hashing, password rules and auth event logging.

const crypto = require('crypto')
const jwt = require('jsonwebtoken')
const prisma = require('./prisma')

const SESSION_TTL = '8h'
const MIN_PASSWORD_LENGTH = 12
const MAX_PASSWORD_LENGTH = 1024

// Refuses to run with a missing or weak secret, so tokens can't be forged with a guessable key
const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be set to at least 32 characters')
  }
  return secret
}

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex')
const newToken = () => crypto.randomBytes(32).toString('base64url')

const isValidPassword = (password) =>
  typeof password === 'string' && password.length >= MIN_PASSWORD_LENGTH && password.length <= MAX_PASSWORD_LENGTH

const PASSWORD_RULE = `Password must be ${MIN_PASSWORD_LENGTH}-${MAX_PASSWORD_LENGTH} characters`

// tv (token version) lets a password reset invalidate every session issued before it
const signSession = (user) =>
  jwt.sign(
    { userId: user.id, email: user.email, tv: user.tokenVersion },
    getJwtSecret(),
    { expiresIn: SESSION_TTL, algorithm: 'HS256' }
  )

// Returns the live user for a Bearer token, or null if the token is bad, expired or revoked
const userFromToken = async (token) => {
  let payload
  try {
    payload = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] })
  } catch {
    return null
  }
  const user = await prisma.user.findUnique({ where: { id: payload.userId } })
  // Tokens issued before tokenVersion existed have no tv, which counts as 0
  if (!user || (payload.tv ?? 0) !== user.tokenVersion) return null
  return user
}

const bearerToken = (req) => {
  const header = req.headers.authorization || ''
  return header.startsWith('Bearer ') ? header.slice(7) : ''
}

const logAuth = (event, details) => {
  console.log(`[auth] ${new Date().toISOString()} ${event} ${JSON.stringify(details)}`)
}

module.exports = {
  getJwtSecret, sha256, newToken, isValidPassword, PASSWORD_RULE,
  signSession, userFromToken, bearerToken, logAuth,
  MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH
}
