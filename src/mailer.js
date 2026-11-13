// Sends auth emails. Dev: prints to the console. Production: replace the body with a real provider
// (SMTP or an email API) before launch; until then production refuses to send silently to the console.
const sendMail = async ({ to, subject, text }) => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('No email provider configured: add one in src/mailer.js before production use')
  }
  console.log(`[mail] to=${to} subject="${subject}"\n${text}\n`)
}

// Base URL for links in emails. Required in production so links never point at localhost.
const frontendUrl = () => {
  const url = process.env.FRONTEND_URL
  if (!url && process.env.NODE_ENV === 'production') throw new Error('FRONTEND_URL must be set in production')
  return url || 'http://localhost:5173'
}

module.exports = { sendMail, frontendUrl }
