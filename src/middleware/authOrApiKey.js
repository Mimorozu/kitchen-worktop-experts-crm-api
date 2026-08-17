// Lets a request through if it has either a valid x-api-key (website form)
// or a valid JWT (staff creating a lead from the CRM). Used only on POST /api/leads.

const jwt = require('jsonwebtoken')

module.exports = (req, res, next) => {
  const key = req.headers['x-api-key']
  if (key && key === process.env.API_KEY) {
    return next()
  }

  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]
  if (token) {
    return jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) return res.status(403).json({ error: 'Invalid or expired token' })
      req.user = decoded
      next()
    })
  }

  return res.status(401).json({ error: 'API key or auth token required' })
}
