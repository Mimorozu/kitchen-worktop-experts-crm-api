const cloudinary = require('cloudinary').v2

console.log('Cloudinary env check:', {
  cloud_name_present: !!process.env.CLOUDINARY_CLOUD_NAME,
  cloud_name_length: (process.env.CLOUDINARY_CLOUD_NAME || '').length,
  api_key_present: !!process.env.CLOUDINARY_API_KEY,
  api_key_length: (process.env.CLOUDINARY_API_KEY || '').length,
  api_secret_present: !!process.env.CLOUDINARY_API_SECRET,
  api_secret_length: (process.env.CLOUDINARY_API_SECRET || '').length
})

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
})

module.exports = cloudinary
