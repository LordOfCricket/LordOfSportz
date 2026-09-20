import {
  GALLERY_CATEGORIES,
  insertGalleryImage,
  findGalleryImages,
  findGalleryImageById,
  updateGalleryImageById,
  deleteGalleryImageById,
} from '../models/galleryImage.model.js'
import { uploadImageFileDetailed, deleteImageByPublicId, getOptimizedImageUrl } from '../utils/cloudinaryUpload.js'
import { logger } from '../utils/logger.js'

const CLOUDINARY_FOLDER = 'LOC/ground-gallery'
const DELIVERY_WIDTH = 1600 // wide enough for the hero gallery's largest (desktop 2fr) presentation, capped so nobody downloads a 6000px original

function httpError(message, statusCode) {
  const err = new Error(message)
  err.statusCode = statusCode
  return err
}

// PostgreSQL is a hard dependency for this whole app (connectPostgres()
// exits the process on failure — see config/db.js) — unlike the retired
// Mongo-backed version, there's no "storage temporarily unavailable"
// degraded state to gate here: if the process is running, the table is
// reachable.
function parsePostgresId(id) {
  const numericId = Number(id)
  return Number.isInteger(numericId) ? numericId : null
}

function toPublicShape(row) {
  return {
    id: String(row.id),
    title: row.title,
    description: row.description || '',
    category: row.category,
    imageUrl: getOptimizedImageUrl(row.cloudinary_public_id, { width: DELIVERY_WIDTH }) || row.image_url,
    originalImageUrl: row.image_url,
    width: row.image_width,
    height: row.image_height,
    order: row.sort_order,
    isActive: row.is_active,
    createdAt: row.created_at,
  }
}

export async function listGalleryImages({ category, activeOnly = true } = {}) {
  if (category && !GALLERY_CATEGORIES.includes(category)) {
    throw httpError(`Unknown category '${category}'. Supported: ${GALLERY_CATEGORIES.join(', ')}.`, 400)
  }

  const rows = await findGalleryImages({ category, activeOnly })
  return rows.map(toPublicShape)
}

export async function getGalleryImageById(id) {
  const numericId = parsePostgresId(id)
  const row = numericId === null ? null : await findGalleryImageById(numericId)
  if (!row) throw httpError('Gallery image not found.', 404)
  return toPublicShape(row)
}

export async function createGalleryImage({ file, title, description, category, order, createdBy }) {
  if (!file) throw httpError('An image file is required.', 400)
  if (!title || !title.trim()) throw httpError('A title is required.', 400)
  const resolvedCategory = category || 'ground'
  if (!GALLERY_CATEGORIES.includes(resolvedCategory)) {
    throw httpError(`Unknown category '${resolvedCategory}'. Supported: ${GALLERY_CATEGORIES.join(', ')}.`, 400)
  }

  const uploaded = await uploadImageFileDetailed(file, CLOUDINARY_FOLDER)

  try {
    const row = await insertGalleryImage({
      title: title.trim(),
      description: description || '',
      category: resolvedCategory,
      imageUrl: uploaded.url,
      cloudinaryPublicId: uploaded.publicId,
      imageWidth: uploaded.width ?? null,
      imageHeight: uploaded.height ?? null,
      imageFormat: uploaded.format ?? null,
      imageBytes: uploaded.bytes ?? null,
      sortOrder: Number.isFinite(Number(order)) ? Number(order) : 0,
      createdBy: createdBy ?? null,
    })
    return toPublicShape(row)
  } catch (err) {
    // Cloudinary upload already succeeded — don't leave it orphaned just
    // because the metadata write failed (validation error, DB hiccup).
    try {
      await deleteImageByPublicId(uploaded.publicId)
    } catch (cleanupErr) {
      logger.error('Failed to roll back orphaned Cloudinary asset after gallery_images insert failure', {
        publicId: uploaded.publicId,
        saveError: err.message,
        cleanupError: cleanupErr.message,
      })
    }
    throw httpError('Failed to save gallery image metadata.', 500)
  }
}

const PATCHABLE_FIELDS = ['title', 'description', 'order', 'isActive', 'category']

export async function updateGalleryImageMetadata(id, updates) {
  const numericId = parsePostgresId(id)
  const existing = numericId === null ? null : await findGalleryImageById(numericId)
  if (!existing) throw httpError('Gallery image not found.', 404)

  const patch = {}
  for (const field of PATCHABLE_FIELDS) {
    if (updates[field] === undefined) continue
    if (field === 'category' && !GALLERY_CATEGORIES.includes(updates.category)) {
      throw httpError(`Unknown category '${updates.category}'. Supported: ${GALLERY_CATEGORIES.join(', ')}.`, 400)
    }
    if (field === 'title' && !String(updates.title).trim()) {
      throw httpError('Title cannot be empty.', 400)
    }
    patch[field] = field === 'title' ? String(updates.title).trim() : updates[field]
  }

  const row = await updateGalleryImageById(numericId, patch)
  return toPublicShape(row)
}

export async function deleteGalleryImage(id) {
  const numericId = parsePostgresId(id)
  const existing = numericId === null ? null : await findGalleryImageById(numericId)
  if (!existing) throw httpError('Gallery image not found.', 404)

  // Cloudinary first, database second — an unexpected Cloudinary failure
  // (not just "already gone", which deleteImageByPublicId treats as
  // success) aborts here rather than deleting the record for an asset we
  // couldn't confirm is actually gone. Same ordering as the retired
  // Mongo-backed version.
  let cloudinaryOk
  try {
    cloudinaryOk = await deleteImageByPublicId(existing.cloudinary_public_id)
  } catch (err) {
    logger.error('Cloudinary delete failed during gallery image deletion', {
      id: String(existing.id),
      publicId: existing.cloudinary_public_id,
      error: err.message,
    })
    throw httpError('Failed to delete the image from Cloudinary. The gallery record was not removed.', 502)
  }

  if (!cloudinaryOk) {
    throw httpError('Failed to delete the image from Cloudinary. The gallery record was not removed.', 502)
  }

  await deleteGalleryImageById(numericId)
  return { id: String(numericId) }
}
