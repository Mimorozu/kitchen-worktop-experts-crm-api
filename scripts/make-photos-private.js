// Converts existing public lead photos to private delivery.
// Dry run by default: lists what would change. Pass --apply to change Cloudinary and the database.
// Usage: node scripts/make-photos-private.js [--apply] [--limit=N]
require('dotenv').config()

const crypto = require('crypto')
const prisma = require('../src/prisma')
const cloudinary = require('../src/cloudinary')
const { PRIVATE_DELIVERY } = require('../src/photos')

const apply = process.argv.includes('--apply')
const limitArg = process.argv.find((a) => a.startsWith('--limit='))
const limit = limitArg ? Number(limitArg.split('=')[1]) : undefined

// Cloudinary can't change delivery type in place, so each file is renamed to a new public id
const newPublicId = (publicId) => {
  const folder = publicId.includes('/') ? publicId.slice(0, publicId.lastIndexOf('/')) : ''
  const name = `private-${crypto.randomBytes(8).toString('hex')}`
  return folder ? `${folder}/${name}` : name
}

const run = async () => {
  const photos = await prisma.photo.findMany({
    where: { delivery: 'upload' },
    orderBy: { id: 'asc' },
    take: limit
  })
  console.log(`${photos.length} public photo(s) found. ${apply ? 'APPLYING' : 'Dry run, no changes made.'}`)

  let converted = 0
  for (const photo of photos) {
    const target = newPublicId(photo.publicId)
    if (!apply) {
      console.log(`  would convert photo ${photo.id}: ${photo.publicId} -> ${target}`)
      continue
    }

    try {
      const renamed = await cloudinary.uploader.rename(photo.publicId, target, {
        resource_type: photo.resourceType,
        type: 'upload',
        to_type: PRIVATE_DELIVERY,
        overwrite: false
      })
      try {
        await prisma.photo.update({
          where: { id: photo.id },
          data: {
            publicId: renamed.public_id,
            url: renamed.secure_url,
            delivery: PRIVATE_DELIVERY,
            format: renamed.format || null
          }
        })
      } catch (dbError) {
        // The file moved but the row didn't: record the mapping so it can be fixed by hand
        console.error(`  DATABASE UPDATE FAILED for photo ${photo.id}: old ${photo.publicId}, new ${renamed.public_id}: ${dbError.message}`)
        continue
      }
      converted++
      console.log(`  converted photo ${photo.id}`)
    } catch (error) {
      console.error(`  failed photo ${photo.id} (${photo.publicId}): ${error.message}`)
    }
  }

  if (apply) console.log(`${converted} of ${photos.length} converted.`)
}

run()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
