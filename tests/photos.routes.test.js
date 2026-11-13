// Tests photo content checks, filename cleaning, photo limit, signed delivery and delete types against fakes.
const { createRequire } = require('module')

const API = require('path').resolve(__dirname, '..')
const req = createRequire(API + '/x.js')
process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long'

const express = req('express')

const users = [{ id: 7, email: 'staff@example.com', tokenVersion: 0 }]
let photos = []
const leads = [{ id: 1 }, { id: 2 }]
const uploadOptions = []
const destroyOptions = []
let nextPhotoId = 100

const fakePrisma = {
  user: { findUnique: async ({ where }) => users.find((u) => u.id === where.id) ?? null },
  lead: {
    findUnique: async ({ where, include }) => {
      const l = leads.find((x) => x.id === where.id)
      if (!l) return null
      return include?.photos ? { ...l, photos: photos.filter((p) => p.leadId === l.id) } : l
    }
  },
  photo: {
    count: async ({ where }) => photos.filter((p) => p.leadId === where.leadId).length,
    findUnique: async ({ where }) => photos.find((p) => p.id === where.id) ?? null,
    create: async ({ data }) => {
      const p = { id: nextPhotoId++, createdAt: new Date(), ...data }
      photos.push(p)
      return p
    },
    delete: async ({ where }) => { photos = photos.filter((p) => p.id !== where.id); return {} }
  }
}
const prismaPath = req.resolve('./src/prisma.js')
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: fakePrisma }

const fakeCloudinary = {
  url: (publicId, opts) => `https://res.example/${opts.type}/${publicId}?sig=abc&exp=${opts.expires_at}`,
  uploader: {
    destroy: async (publicId, opts) => { destroyOptions.push({ publicId, ...opts }); return {} },
    upload_stream: (opts, cb) => {
      uploadOptions.push(opts)
      return { end: () => cb(null, { secure_url: 'https://res.example/authenticated/x', public_id: 'kwe-crm/leads/1/abc', resource_type: 'image', format: 'pdf' }) }
    }
  }
}
const cloudPath = req.resolve('./src/cloudinary.js')
require.cache[cloudPath] = { id: cloudPath, filename: cloudPath, loaded: true, exports: fakeCloudinary }
// loaded after the stubs, so photos.js gets the fake Cloudinary
const photosLib = req('./src/photos.js')

const origLog = console.log
console.log = () => {}
console.error = (...a) => origLog('ERRLOG', ...a)

const { signSession } = req('./src/authUtils.js')
const leadsRouter = req('./src/routes/leads.js')
const app = express()
app.use(express.json())
app.use('/api/leads', leadsRouter)

let pass = 0
let fail = 0
const check = (name, cond, extra = '') => {
  if (cond) { pass++; origLog('PASS', name) } else { fail++; origLog('FAIL', name, extra) }
}

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10])
const PDF = Buffer.from('%PDF-1.4 test')
const TEXT = Buffer.from('<script>alert(1)</script>')

const upload = (base, auth, buf, name, type) => {
  const form = new FormData()
  form.append('photo', new Blob([buf], { type }), name)
  return fetch(base + '/api/leads/1/photos', { method: 'POST', headers: auth, body: form })
}

;(async () => {
  // unit: detection and filename cleaning
  check('detects JPEG', photosLib.detectFileType(JPEG) === 'jpg')
  check('detects PDF', photosLib.detectFileType(PDF) === 'pdf')
  check('detects PNG', photosLib.detectFileType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])) === 'png')
  check('detects WebP', photosLib.detectFileType(Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP')])) === 'webp')
  check('rejects script text', photosLib.detectFileType(TEXT) === null)
  check('filename: no path or markup', photosLib.sanitiseFilename('../../evil<script>.jpg') === 'evil_script_.jpg', photosLib.sanitiseFilename('../../evil<script>.jpg'))
  check('filename: empty falls back', photosLib.sanitiseFilename('') === 'photo')
  check('filename: capped at 120', photosLib.sanitiseFilename('a'.repeat(300) + '.jpg').length === 120)

  const server = app.listen(0)
  const base = `http://127.0.0.1:${server.address().port}`
  const auth = { Authorization: 'Bearer ' + signSession(users[0]) }

  // upload checks
  let r = await upload(base, auth, TEXT, 'photo.jpg', 'image/jpeg')
  check('text disguised as JPEG -> 400', r.status === 400)
  check('no cloud upload for rejected file', uploadOptions.length === 0)

  r = await upload(base, auth, PDF, '../quote<1>.pdf', 'application/pdf')
  check('PDF upload -> 201', r.status === 201, r.status)
  const saved = photos[photos.length - 1]
  check('upload is private (authenticated, image type)', uploadOptions[0].type === 'authenticated' && uploadOptions[0].resource_type === 'image')
  check('stored format from contents', saved.format === 'jpg' || saved.format === 'pdf' ? saved.format === 'pdf' : false, saved.format)
  check('stored delivery is authenticated', saved.delivery === 'authenticated')
  check('stored filename is cleaned', saved.filename === 'quote_1_.pdf', saved.filename)
  const body = await r.json()
  check('response URL is signed and expires', body.url.includes('sig=abc') && body.url.includes('exp='), body.url)

  // photo limit
  photos = photos.filter((p) => p.leadId !== 1)
  for (let i = 0; i < 30; i++) photos.push({ id: nextPhotoId++, leadId: 1, delivery: 'authenticated', publicId: 'x' + i, resourceType: 'image', url: '' })
  uploadOptions.length = 0
  r = await upload(base, auth, JPEG, 'more.jpg', 'image/jpeg')
  check('31st photo -> 409', r.status === 409)
  check('limit hit: nothing uploaded', uploadOptions.length === 0)

  // read: legacy public vs private URL signing
  photos = photos.filter((p) => p.leadId !== 1)
  photos.push({ id: 201, leadId: 1, delivery: 'upload', publicId: 'old-public', resourceType: 'image', url: 'https://res.example/upload/old-public.jpg', filename: 'old.jpg', format: null, createdAt: new Date() })
  photos.push({ id: 202, leadId: 1, delivery: 'authenticated', publicId: 'new-private', resourceType: 'image', url: 'https://res.example/authenticated/new-private', format: 'jpg', filename: 'new.jpg', createdAt: new Date() })
  r = await fetch(base + '/api/leads/1', { headers: auth })
  const lead = await r.json()
  const legacy = lead.photos.find((p) => p.id === 201)
  const priv = lead.photos.find((p) => p.id === 202)
  check('legacy photo keeps stored URL', legacy.url === 'https://res.example/upload/old-public.jpg')
  check('private photo gets signed URL', priv.url.startsWith('https://res.example/authenticated/new-private?sig=abc'), priv.url)
  const exp = Number(new URL(priv.url).searchParams.get('exp'))
  const now = Math.floor(Date.now() / 1000)
  check('signed URL expires in about one hour', exp - now > 3500 && exp - now <= 3600, String(exp - now))

  // delete uses the matching Cloudinary delivery type
  destroyOptions.length = 0
  r = await fetch(base + '/api/leads/1/photos/201', { method: 'DELETE', headers: auth })
  check('legacy photo delete -> 204', r.status === 204)
  check('legacy delete uses upload type', destroyOptions[0].type === 'upload', JSON.stringify(destroyOptions))

  destroyOptions.length = 0
  r = await fetch(base + '/api/leads/1/photos/202', { method: 'DELETE', headers: auth })
  check('private photo delete -> 204', r.status === 204)
  check('private delete uses authenticated type', destroyOptions[0].type === 'authenticated', JSON.stringify(destroyOptions))

  origLog(`\n${pass} passed, ${fail} failed`)
  server.closeAllConnections()
  server.close()
  process.exitCode = fail ? 1 : 0
})().catch((e) => {
  origLog('ERROR', e)
  process.exit(1)
})
