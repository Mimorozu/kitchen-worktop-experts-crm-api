// reads a value from the request headers, checks it matches 
//what's in your .env, and either lets the request through or rejects it.

module.exports = (req, res, next) => {
  const key = req.headers['x-api-key']

  if (!key || key !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' })
  }

  next()
}