// Lets a request through with either the website API key or a signed-in staff token.
// Used only on POST /api/leads.

const crypto = require('crypto')
const { bearerToken, userFromToken } = require('../authUtils')

const apiKeyMatches = (key) => {
  const expected = process.env.API_KEY || ''
  if (!key || !expected) return false
  const a = Buffer.from(key)
  const b = Buffer.from(expected)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

module.exports = async (req, res, next) => {
  if (apiKeyMatches(req.headers['x-api-key'])) return next()

  const token = bearerToken(req)
  if (!token) return res.status(401).json({ error: 'API key or auth token required' })

  const user = await userFromToken(token)
  if (!user) return res.status(401).json({ error: 'Session expired or invalid. Please log in again.' })

  req.user = { id: user.id, email: user.email }
  next()
}
