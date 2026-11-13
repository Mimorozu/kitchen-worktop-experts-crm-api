
// Entry point — starts the server

require('dotenv').config()

// Fail at startup, not on the first login, if the JWT secret is missing or weak
require('./src/authUtils').getJwtSecret()

const cors = require('cors')
const express = require('express')
const leadsRouter = require('./src/routes/leads')
const authRouter = require('./src/routes/auth')
const pricingRouter = require('./src/routes/pricing')

const app = express()
const PORT = process.env.PORT || 5000

app.use(express.json())
app.use(cors())

// Mount the routers
app.use('/api/leads', leadsRouter)
app.use('/api/auth', authRouter)
app.use('/api/pricing', pricingRouter)

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' })
})

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})