// Lead photo handling: checks file contents, uploads as private Cloudinary assets,
// signs short-lived delivery URLs and removes files. Photos from before private delivery
// (delivery = 'upload') keep their stored public URL until they are converted.

const cloudinary = require('./cloudinary')

const MAX_PHOTOS_PER_LEAD = 30
const URL_TTL_SECONDS = 60 * 60
const PRIVATE_DELIVERY = 'authenticated'

// Identifies the file from its first bytes, not the mimetype or extension the client sent
const detectFileType = (buffer) => {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg'
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png'
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp'
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-') return 'pdf'
  return null
}

// Keeps only safe characters, so the name can't carry markup or path parts
const sanitiseFilename = (name) => {
  const base = String(name || 'photo').split(/[\\/]/).pop()
  const safe = base.replace(/[^A-Za-z0-9._ -]/g, '_').slice(0, 120).trim()
  return safe || 'photo'
}

// Uploads as an authenticated (private) image. PDFs are stored as image resources in Cloudinary.
const uploadPrivate = (buffer, folder) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image', type: PRIVATE_DELIVERY },
      (error, result) => (error ? reject(error) : resolve(result))
    )
    stream.end(buffer)
  })

// Returns the photo with a fresh signed URL that expires after URL_TTL_SECONDS.
// Legacy public photos are returned unchanged.
const presentPhoto = (photo) => {
  if (photo.delivery !== PRIVATE_DELIVERY) return photo
  const url = cloudinary.url(photo.publicId, {
    type: PRIVATE_DELIVERY,
    resource_type: photo.resourceType,
    format: photo.format || undefined,
    sign_url: true,
    secure: true,
    expires_at: Math.floor(Date.now() / 1000) + URL_TTL_SECONDS
  })
  return { ...photo, url }
}

const presentLead = (lead) => (lead && lead.photos
  ? { ...lead, photos: lead.photos.map(presentPhoto) }
  : lead)

// Deletes files after their database rows are gone. A failure is logged, not thrown:
// a leftover file costs storage, while a live row pointing at a missing file breaks the lead.
const removeFiles = async (photos) => {
  for (const photo of photos) {
    try {
      await cloudinary.uploader.destroy(photo.publicId, {
        resource_type: photo.resourceType,
        type: photo.delivery === PRIVATE_DELIVERY ? PRIVATE_DELIVERY : 'upload'
      })
    } catch (error) {
      console.error(`[storage] orphaned Cloudinary file ${photo.publicId} (${photo.resourceType}): ${error.message}`)
    }
  }
}

module.exports = {
  MAX_PHOTOS_PER_LEAD, PRIVATE_DELIVERY,
  detectFileType, sanitiseFilename, uploadPrivate,
  presentPhoto, presentLead, removeFiles
}
