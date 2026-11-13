const { createRequire } = require('module')
const req = createRequire(require('path').resolve(__dirname, '..', 'x.js'))
const mailer = req('./src/mailer.js')
const calls = []
globalThis.fetch = async (url, opts) => { calls.push({ url, opts }); return { ok: true, status: 200 } }
;(async () => {
  let fails = 0
  const check = (n, c) => { console.log(c ? 'PASS' : 'FAIL', n); if (!c) fails++ }
  delete process.env.RESEND_API_KEY; process.env.NODE_ENV = 'development'
  await mailer.sendMail({ to: 'a@b.co', subject: 's', text: 't' })
  check('dev without key: no HTTP call', calls.length === 0)
  process.env.RESEND_API_KEY = 'test-key-value'
  await mailer.sendMail({ to: 'a@b.co', subject: 'Verify', text: 'link' })
  check('with key: posts to Resend', calls[0]?.url === 'https://api.resend.com/emails')
  const body = JSON.parse(calls[0].opts.body)
  check('with key: sends from verified subdomain', body.from.includes('@mail.kitchenworktopexperts.co.uk'))
  check('with key: bearer auth header', calls[0].opts.headers.Authorization === 'Bearer test-key-value')
  globalThis.fetch = async () => ({ ok: false, status: 403 })
  let threw = false
  try { await mailer.sendMail({ to: 'a@b.co', subject: 's', text: 't' }) } catch (e) { threw = /Resend returned 403/.test(e.message) }
  check('Resend error is raised, not swallowed', threw)
  delete process.env.RESEND_API_KEY; process.env.NODE_ENV = 'production'
  threw = false
  try { await mailer.sendMail({ to: 'a@b.co', subject: 's', text: 't' }) } catch { threw = true }
  check('production without key refuses', threw)
  console.log(fails ? `${fails} failed` : 'all passed')
  process.exit(fails ? 1 : 0)
})()
