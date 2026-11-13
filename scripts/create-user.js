// Creates a staff account. Public sign-up is disabled, so this is the only way to add users.
// The password is read from stdin so it stays out of the command line and shell history.
// Usage: "your-password" | node scripts/create-user.js you@example.com
require('dotenv').config()

const bcrypt = require('bcryptjs')
const prisma = require('../src/prisma')
const { sendMail, frontendUrl } = require('../src/mailer')
const { sha256, newToken, isValidPassword, PASSWORD_RULE, logAuth } = require('../src/authUtils')

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000

const run = async (email, password) => {
  const key = email.trim().toLowerCase()
  if (!key.includes('@')) throw new Error('Enter a valid email address')
  if (!isValidPassword(password)) throw new Error(PASSWORD_RULE)

  const existing = await prisma.user.findFirst({ where: { email: { equals: key, mode: 'insensitive' } } })
  if (existing) throw new Error('A user with that email already exists')

  const verifyToken = newToken()
  await prisma.user.create({
    data: {
      email: key,
      password: await bcrypt.hash(password, 12),
      emailVerified: false,
      verifyTokenHash: sha256(verifyToken),
      verifyExpiresAt: new Date(Date.now() + VERIFY_TTL_MS)
    }
  })

  await sendMail({
    to: key,
    subject: 'Verify your CRM account',
    text: `Verify your email within 24 hours:\n${frontendUrl()}/verify-email?token=${verifyToken}`
  })
  logAuth('user_created', { email: key })
}

const email = process.argv[2]
if (!email) {
  console.error('Usage: "<password>" | node scripts/create-user.js <email>')
  process.exit(1)
}
if (process.stdin.isTTY) {
  console.error('Pipe the password in, e.g. "your-password" | node scripts/create-user.js <email>')
  process.exit(1)
}

let input = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => { input += chunk })
process.stdin.on('end', async () => {
  try {
    await run(email, input.replace(/\r?\n$/, ''))
    console.log('User created. Check the console above for the verification link.')
  } catch (err) {
    console.error(err.message)
    process.exitCode = 1
  } finally {
    await prisma.$disconnect()
  }
})
