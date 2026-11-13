// Browser access rules for the API. Only the frontend address may call it from a browser.
// Production sets FRONTEND_URL, so only that origin is allowed. Without it (local development),
// the two Vite dev-server addresses are allowed. Requests without an Origin header (tools, server-to-server)
// are not affected by CORS.

const cors = require('cors')

// Public website domains that also call the CRM API from a browser
const PUBLIC_SITE_ORIGINS = [
  'https://kitchenworktopexperts.co.uk',
  'https://www.kitchenworktopexperts.co.uk'
]

const allowedOrigins = process.env.FRONTEND_URL
  ? [process.env.FRONTEND_URL, ...PUBLIC_SITE_ORIGINS]
  : ['http://localhost:5173', 'http://localhost:5174']

const corsOptions = {
  origin: (origin, callback) => {
    // No Origin header: not a browser cross-site request, so there is nothing to allow or block
    if (!origin) return callback(null, true)
    // Returning false sends no CORS headers, so the browser blocks the response
    callback(null, allowedOrigins.includes(origin))
  }
}

module.exports = { corsMiddleware: cors(corsOptions), allowedOrigins }
