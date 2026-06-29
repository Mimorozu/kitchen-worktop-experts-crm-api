
// Entry point — starts the server

require('dotenv').config()

const cors = require('cors') 
const express = require('express')
const leadsRouter = require('./src/routes/leads')
const authRouter = require('./src/routes/auth')

const app = express()
const PORT = process.env.PORT || 5000

app.use(express.json())
app.use(cors())

// Mount the routers
app.use('/api/leads', leadsRouter)
app.use('/api/auth', authRouter)

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' })
})

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})