// Sends auth emails through Resend when RESEND_API_KEY is set.
// Without a key: development prints the email to the console; production refuses, so a link is never lost silently.

const FROM = process.env.MAIL_FROM || 'Kitchen Worktop Experts <noreply@mail.kitchenworktopexperts.co.uk>'

const sendMail = async ({ to, subject, text }) => {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    if (process.env.NODE_ENV === 'production') throw new Error('RESEND_API_KEY is not set')
    console.log(`[mail] to=${to} subject="${subject}"\n${text}\n`)
    return
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [to], subject, text })
  })
  if (!response.ok) {
    throw new Error(`Resend returned ${response.status}`)
  }
}

// Base URL for links in emails. Required in production so links never point at localhost.
const frontendUrl = () => {
  const url = process.env.FRONTEND_URL
  if (!url && process.env.NODE_ENV === 'production') throw new Error('FRONTEND_URL must be set in production')
  return url || 'http://localhost:5173'
}

module.exports = { sendMail, frontendUrl }
