// Protects routes that need a signed-in staff user. Expects "Authorization: Bearer <token>".
// Attaches the user to req.user, or rejects the request with 401.

const { bearerToken, userFromToken } = require('../authUtils')

module.exports = async (req, res, next) => {
  const token = bearerToken(req)
  if (!token) return res.status(401).json({ error: 'Not signed in' })

  const user = await userFromToken(token)
  if (!user) return res.status(401).json({ error: 'Session expired or invalid. Please log in again.' })

  req.user = { id: user.id, email: user.email }
  next()
}
