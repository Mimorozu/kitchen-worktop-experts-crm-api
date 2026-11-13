// Tests lead and photo deletion ordering and Cloudinary cleanup against fakes. Does not touch any database or Cloudinary.
const { createRequire } = require('module')

const API = require('path').resolve(__dirname, '..')
const req = createRequire(API + '/x.js')
process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long'

const express = req('express')

const events = []
let destroyFails = false
let createPhotoFails = false
let uploadPublicId = 'kwe-crm/leads/1/new-upload'

const users = [{ id: 7, email: 'staff@example.com', tokenVersion: 0 }]
const leads = [
  { id: 1, name: 'A', photos: [
    { id: 11, leadId: 1, publicId: 'p-one', resourceType: 'image' },
    { id: 12, leadId: 1, publicId: 'p-two', resourceType: 'raw' }
  ] },
  { id: 2, name: 'B', photos: [] }
]
let photos = leads.flatMap((l) => l.photos)

const fakePrisma = {
  user: { findUnique: async ({ where }) => users.find((u) => u.id === where.id) ?? null },
  lead: {
    findUnique: async ({ where, include }) => {
      const l = leads.find((x) => x.id === where.id)
      if (!l) return null
      return include?.photos ? { ...l, photos: photos.filter((p) => p.leadId === l.id) } : l
    },
    delete: async ({ where }) => {
      events.push('db:lead.delete')
      const i = leads.findIndex((x) => x.id === where.id)
      if (i === -1) throw Object.assign(new Error('nf'), { code: 'P2025' })
      photos = photos.filter((p) => p.leadId !== where.id)
      leads.splice(i, 1)
      return {}
    }
  },
  photo: {
    count: async ({ where }) => photos.filter((p) => p.leadId === where.leadId).length,
    findUnique: async ({ where }) => photos.find((p) => p.id === where.id) ?? null,
    delete: async ({ where }) => {
      events.push('db:photo.delete')
      photos = photos.filter((p) => p.id !== where.id)
      return {}
    },
    create: async ({ data }) => {
      events.push('db:photo.create')
      if (createPhotoFails) throw new Error('db down')
      const p = { id: 99, ...data }
      photos.push(p)
      return p
    }
  }
}
const prismaPath = req.resolve('./src/prisma.js')
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: fakePrisma }

const fakeCloudinary = {
  // top-level in the real SDK, as used by src/photos.js
  url: (publicId, opts) => `https://signed.example/${publicId}?sig=1&exp=${opts.expires_at}`,
  uploader: {
    destroy: async (publicId, opts) => {
      events.push(`cloud:destroy:${publicId}:${opts.resource_type}`)
      if (destroyFails) throw new Error('cloud unavailable')
      return { result: 'ok' }
    },
    upload_stream: (opts, cb) => ({
      end: () => cb(null, { secure_url: 'https://x/y.jpg', public_id: uploadPublicId, resource_type: 'image' })
    })
  }
}
const cloudPath = req.resolve('./src/cloudinary.js')
require.cache[cloudPath] = { id: cloudPath, filename: cloudPath, loaded: true, exports: fakeCloudinary }

const origLog = console.log
const logged = []
console.error = (...a) => { logged.push(a.join(' ')) }
console.log = () => {}

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

;(async () => {
  const server = app.listen(0)
  const base = `http://127.0.0.1:${server.address().port}`
  const token = signSession(users[0])
  const auth = { Authorization: 'Bearer ' + token }

  // lead delete: database first, then files
  let r = await fetch(base + '/api/leads/1', { method: 'DELETE', headers: auth })
  check('delete lead with photos -> 204', r.status === 204)
  check('lead removed and photos cascaded', leads.every((l) => l.id !== 1) && photos.filter((p) => p.leadId === 1).length === 0)
  check('database delete happens before Cloudinary cleanup',
    events.indexOf('db:lead.delete') < events.indexOf('cloud:destroy:p-one:image') &&
    events.indexOf('db:lead.delete') < events.indexOf('cloud:destroy:p-two:raw'),
    JSON.stringify(events))
  check('raw files destroyed with their resource type', events.includes('cloud:destroy:p-two:raw'))

  // cloud failure after DB delete: still 204, orphan logged
  events.length = 0
  logged.length = 0
  leads.push({ id: 3, name: 'C', photos: [{ id: 31, leadId: 3, publicId: 'p-three', resourceType: 'image' }] })
  photos.push({ id: 31, leadId: 3, publicId: 'p-three', resourceType: 'image' })
  destroyFails = true
  r = await fetch(base + '/api/leads/3', { method: 'DELETE', headers: auth })
  check('cloud failure does not fail the delete -> 204', r.status === 204)
  check('orphan logged with public id', logged.some((l) => l.includes('[storage] orphaned Cloudinary file p-three')), JSON.stringify(logged))
  destroyFails = false

  // missing lead
  events.length = 0
  r = await fetch(base + '/api/leads/999', { method: 'DELETE', headers: auth })
  check('delete unknown lead -> 404', r.status === 404)
  check('unknown lead touches nothing', events.length === 0, JSON.stringify(events))

  // photo delete: DB first, then Cloudinary
  events.length = 0
  r = await fetch(base + '/api/leads/2/photos/nope', { method: 'DELETE', headers: auth })
  check('photo of other lead / missing -> 404', r.status === 404)

  photos.push({ id: 41, leadId: 2, publicId: 'p-four', resourceType: 'image' })
  leads[leads.findIndex((l) => l.id === 2)].photos = [photos[photos.length - 1]]
  events.length = 0
  r = await fetch(base + '/api/leads/2/photos/41', { method: 'DELETE', headers: auth })
  check('photo delete -> 204', r.status === 204)
  check('photo DB row deleted before the file', events[0] === 'db:photo.delete' && events[1] === 'cloud:destroy:p-four:image', JSON.stringify(events))

  // upload: saving the row fails -> new file removed, request fails
  events.length = 0
  createPhotoFails = true
  const form = new FormData()
  form.append('photo', new Blob([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10])], { type: 'image/jpeg' }), 'kitchen.jpg')
  r = await fetch(base + '/api/leads/2/photos', { method: 'POST', headers: auth, body: form })
  check('upload with DB failure -> 500', r.status === 500)
  check('uploaded file removed after DB failure', events.includes(`cloud:destroy:${uploadPublicId}:image`), JSON.stringify(events))
  createPhotoFails = false

  // upload success
  events.length = 0
  const form2 = new FormData()
  form2.append('photo', new Blob([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10])], { type: 'image/jpeg' }), 'kitchen.jpg')
  r = await fetch(base + '/api/leads/2/photos', { method: 'POST', headers: auth, body: form2 })
  const successBody = r.status === 201 ? '' : await r.text()
  check('upload success -> 201', r.status === 201, `${r.status} ${successBody}`)
  check('successful upload does not destroy the file', !events.some((e) => e.startsWith('cloud:destroy')))

  origLog(`\n${pass} passed, ${fail} failed`)
  server.closeAllConnections()
  server.close()
  process.exitCode = fail ? 1 : 0
})().catch((e) => {
  origLog('ERROR', e)
  process.exit(1)
})
