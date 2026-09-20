import { v2 as cloudinary } from 'cloudinary'

const cloudName = process.env.CLOUDINARY_CLOUD_NAME
const apiKey = process.env.CLOUDINARY_API_KEY
const apiSecret = process.env.CLOUDINARY_API_SECRET

const isCloudinaryConfigured = Boolean(cloudName && apiKey && apiSecret)

if (isCloudinaryConfigured) {
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
  })
}

export function hasCloudinaryConfig() {
  return isCloudinaryConfigured
}

// Phase 7 — file.originalname is fully attacker-controlled (the multipart
// form field's filename) and was being interpolated into `public_id`
// unsanitized. Cloudinary treats '/' in a public_id as folder nesting, so an
// originalname like "../other-folder/x.png" could place the asset outside
// the intended `folder` namespace. Strip to a safe charset — this is a
// display/organizational name only, never used to look the asset back up
// (callers always store/read the full public_id or secure_url Cloudinary
// returns).
export function safePublicIdSegment(originalname) {
  return originalname.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 100)
}

export async function uploadImageFile(file, folder = 'canteen-menu') {
  if (!file) return ''

  if (!isCloudinaryConfigured) {
    throw new Error('Cloudinary credentials are not configured.')
  }

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
        public_id: `${Date.now()}-${safePublicIdSegment(file.originalname)}`,
      },
      (error, result) => {
        if (error) {
          reject(error)
          return
        }

        resolve(result?.secure_url || '')
      },
    )

    stream.end(file.buffer)
  })
}

// Same upload_stream approach as uploadImageFile above, but returns the
// metadata the Gallery model needs (publicId for future transforms/deletes,
// width/height/format/bytes) instead of just a URL string. A sibling
// export, not a replacement — uploadImageFile's canteen callers are
// untouched.
export async function uploadImageFileDetailed(file, folder) {
  if (!file) throw new Error('No file provided for upload.')

  if (!isCloudinaryConfigured) {
    throw new Error('Cloudinary configuration is incomplete.')
  }

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
        public_id: `${Date.now()}-${safePublicIdSegment(file.originalname)}`,
      },
      (error, result) => {
        if (error) {
          reject(error)
          return
        }
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          width: result.width,
          height: result.height,
          format: result.format,
          bytes: result.bytes,
        })
      },
    )

    stream.end(file.buffer)
  })
}

// Best-effort cleanup — used both for the explicit delete flow and for
// rolling back a Cloudinary upload when the follow-up MongoDB write fails,
// so a failed request never leaves an orphaned asset behind. Callers decide
// how to react to a `false` return (e.g. log and keep the DB record rather
// than pretend the asset is gone).
export async function deleteImageByPublicId(publicId) {
  if (!publicId) return false
  if (!isCloudinaryConfigured) {
    throw new Error('Cloudinary configuration is incomplete.')
  }

  const result = await cloudinary.uploader.destroy(publicId, { resource_type: 'image' })
  return result?.result === 'ok' || result?.result === 'not found'
}

// Delivery URL for the SAME asset, transformed on the fly by Cloudinary
// (f_auto/q_auto pick the best format/quality per requesting browser; width
// caps how large a file anyone downloads) rather than a second stored copy.
export function getOptimizedImageUrl(publicId, { width } = {}) {
  if (!publicId) return ''
  const transformation = [{ fetch_format: 'auto', quality: 'auto' }]
  if (width) transformation.push({ width, crop: 'limit' })
  return cloudinary.url(publicId, { secure: true, transformation })
}
