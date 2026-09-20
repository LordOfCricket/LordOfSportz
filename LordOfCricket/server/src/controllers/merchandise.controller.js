import {
  MERCHANDISE_STATUSES,
  MERCHANDISE_CATEGORY_NAMES,
  createMerchandise,
  findPublicMerchandise,
  findAllMerchandise,
  findMerchandiseById,
  updateMerchandise,
  deleteMerchandise,
} from '../models/merchandise.model.js'
import { uploadImageFileDetailed, deleteImageByPublicId, getOptimizedImageUrl } from '../utils/cloudinaryUpload.js'
import { logger } from '../utils/logger.js'

const CLOUDINARY_FOLDER = 'LOC/merchandise'
const DELIVERY_WIDTH = 800

function toMoney(value) {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function parseAttributes(raw) {
  if (raw == null || raw === '') return {}
  if (typeof raw === 'object') return raw
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function toPublicShape(row) {
  const original = toMoney(row.original_price)
  const selling = toMoney(row.selling_price)
  const discount = toMoney(row.discount_price)
  const effective = discount ?? selling
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    category: row.category || null,
    imageUrl: getOptimizedImageUrl(row.cloudinary_public_id, { width: DELIVERY_WIDTH }) || row.image_url,
    originalPrice: original,
    sellingPrice: selling,
    discountPrice: discount,
    price: effective,
    onSale: (discount != null && discount < selling) || (original != null && selling != null && original > selling),
    stockQuantity: row.stock_quantity ?? 0,
    sku: row.sku || null,
    isFeatured: Boolean(row.is_featured),
    status: row.status,
    sortOrder: row.sort_order,
    attributes: row.attributes || {},
    createdAt: row.created_at,
  }
}

function toAdminShape(row) {
  return {
    ...toPublicShape(row),
    originalImageUrl: row.image_url,
    updatedAt: row.updated_at,
  }
}

function httpError(message, statusCode) {
  const err = new Error(message)
  err.statusCode = statusCode
  return err
}

function validateAndNormalize(body, { partial, existing } = {}) {
  const patch = {}

  if (body.name !== undefined || !partial) {
    const name = String(body.name ?? '').trim()
    if (!name) throw httpError('Product name is required.', 400)
    if (name.length > 150) throw httpError('Product name must be 150 characters or fewer.', 400)
    patch.name = name
  }

  if (body.description !== undefined) {
    patch.description = body.description === null ? null : String(body.description).trim() || null
  }

  if (body.category !== undefined || !partial) {
    const category = String(body.category ?? '').trim()
    if (!category) throw httpError('Category is required.', 400)
    if (!MERCHANDISE_CATEGORY_NAMES.includes(category)) {
      throw httpError(`Category must be one of: ${MERCHANDISE_CATEGORY_NAMES.join(', ')}.`, 400)
    }
    patch.category = category
  }

  if (body.status !== undefined) {
    if (!MERCHANDISE_STATUSES.includes(body.status)) {
      throw httpError(`Status must be one of: ${MERCHANDISE_STATUSES.join(', ')}.`, 400)
    }
    patch.status = body.status
  }

  if (body.sortOrder !== undefined) {
    const sortOrder = Number(body.sortOrder)
    if (!Number.isInteger(sortOrder) || sortOrder < 0) throw httpError('Display order must be a non-negative whole number.', 400)
    patch.sort_order = sortOrder
  }

  if (body.stockQuantity !== undefined && body.stockQuantity !== '') {
    const stock = Number(body.stockQuantity)
    if (!Number.isInteger(stock) || stock < 0) throw httpError('Stock quantity must be a non-negative whole number.', 400)
    patch.stock_quantity = stock
  }

  if (body.sku !== undefined) {
    const sku = String(body.sku ?? '').trim()
    if (sku.length > 60) throw httpError('SKU must be 60 characters or fewer.', 400)
    patch.sku = sku || null
  }

  if (body.isFeatured !== undefined) {
    patch.is_featured = body.isFeatured === true || body.isFeatured === 'true'
  }

  if (body.attributes !== undefined) {
    patch.attributes = parseAttributes(body.attributes)
  }

  const hasSelling = body.sellingPrice !== undefined && body.sellingPrice !== null && body.sellingPrice !== ''
  const hasOriginal = body.originalPrice !== undefined && body.originalPrice !== null && body.originalPrice !== ''
  const hasDiscount = body.discountPrice !== undefined && body.discountPrice !== null && body.discountPrice !== ''

  if (hasSelling || !partial) {
    const selling = Number(body.sellingPrice)
    if (!Number.isFinite(selling) || selling <= 0) throw httpError('Selling price must be a number greater than 0.', 400)
    patch.selling_price = selling
  }

  if (body.originalPrice !== undefined) {
    patch.original_price = hasOriginal ? Number(body.originalPrice) : null
    if (hasOriginal && (!Number.isFinite(patch.original_price) || patch.original_price <= 0)) {
      throw httpError('Original price must be a number greater than 0.', 400)
    }
  }

  if (body.discountPrice !== undefined) {
    patch.discount_price = hasDiscount ? Number(body.discountPrice) : null
    if (hasDiscount && (!Number.isFinite(patch.discount_price) || patch.discount_price <= 0)) {
      throw httpError('Discount price must be a number greater than 0.', 400)
    }
  }

  const selling = patch.selling_price ?? toMoney(existing?.selling_price)
  const original = patch.original_price !== undefined ? patch.original_price : toMoney(existing?.original_price)
  const discount = patch.discount_price !== undefined ? patch.discount_price : toMoney(existing?.discount_price)
  if (original != null && selling != null && selling > original) {
    throw httpError('Selling price cannot be greater than the original price.', 400)
  }
  if (discount != null && selling != null && discount > selling) {
    throw httpError('Discount price cannot be greater than the selling price.', 400)
  }

  return patch
}

export async function listPublicMerchandise(req, res, next) {
  try {
    const rows = await findPublicMerchandise()
    res.json({ items: rows.map(toPublicShape) })
  } catch (err) {
    next(err)
  }
}

// GET /merchandise/admin?category=&status=&q=&sort=&page=&pageSize=
export async function listAdminMerchandise(req, res, next) {
  try {
    const { category, status, q, sort } = req.query
    if (category && !MERCHANDISE_CATEGORY_NAMES.includes(category)) {
      throw httpError('Unknown category.', 400)
    }
    if (status && !MERCHANDISE_STATUSES.includes(status)) {
      throw httpError('Unknown status.', 400)
    }
    const page = Math.max(1, Number(req.query.page) || 1)
    const rawSize = Number(req.query.pageSize)
    const pageSize = Number.isInteger(rawSize) && rawSize > 0 && rawSize <= 100 ? rawSize : null

    const { rows, total } = await findAllMerchandise({
      category,
      status,
      q,
      sort,
      limit: pageSize,
      offset: pageSize ? (page - 1) * pageSize : 0,
    })
    res.json({ items: rows.map(toAdminShape), total, page, pageSize })
  } catch (err) {
    next(err)
  }
}

export async function getPublicMerchandise(req, res, next) {
  try {
    const id = Number(req.params.id)
    const row = Number.isInteger(id) ? await findMerchandiseById(id) : null
    if (!row || !['ACTIVE', 'OUT_OF_STOCK'].includes(row.status)) throw httpError('Product not found.', 404)
    res.json(toPublicShape(row))
  } catch (err) {
    next(err)
  }
}

export async function getAdminMerchandise(req, res, next) {
  try {
    const id = Number(req.params.id)
    const row = Number.isInteger(id) ? await findMerchandiseById(id) : null
    if (!row) throw httpError('Product not found.', 404)
    res.json(toAdminShape(row))
  } catch (err) {
    next(err)
  }
}

export async function createMerchandiseHandler(req, res, next) {
  try {
    if (!req.file) throw httpError('A product image is required.', 400)
    const patch = validateAndNormalize(req.body, { partial: false })

    const uploaded = await uploadImageFileDetailed(req.file, CLOUDINARY_FOLDER)

    try {
      const row = await createMerchandise({
        name: patch.name,
        description: patch.description ?? null,
        category: patch.category,
        image_url: uploaded.url,
        cloudinary_public_id: uploaded.publicId,
        original_price: patch.original_price ?? null,
        selling_price: patch.selling_price,
        discount_price: patch.discount_price ?? null,
        stock_quantity: patch.stock_quantity ?? 0,
        sku: patch.sku ?? null,
        is_featured: patch.is_featured ?? false,
        status: patch.status ?? 'DRAFT',
        sort_order: patch.sort_order ?? 0,
        attributes: patch.attributes ?? {},
      })
      res.status(201).json(toAdminShape(row))
    } catch (dbErr) {
      try {
        await deleteImageByPublicId(uploaded.publicId)
      } catch (cleanupErr) {
        logger.error('Failed to roll back orphaned Cloudinary asset after merchandise insert failure', {
          publicId: uploaded.publicId,
          saveError: dbErr.message,
          cleanupError: cleanupErr.message,
        })
      }
      if (dbErr.code === '23505') throw httpError('That SKU is already in use.', 400)
      throw dbErr
    }
  } catch (err) {
    next(err)
  }
}

export async function updateMerchandiseHandler(req, res, next) {
  try {
    const id = Number(req.params.id)
    const existing = Number.isInteger(id) ? await findMerchandiseById(id) : null
    if (!existing) throw httpError('Product not found.', 404)

    const patch = validateAndNormalize(req.body, { partial: true, existing })

    let uploaded = null
    if (req.file) {
      uploaded = await uploadImageFileDetailed(req.file, CLOUDINARY_FOLDER)
      patch.image_url = uploaded.url
      patch.cloudinary_public_id = uploaded.publicId
    }

    let row
    try {
      row = await updateMerchandise(id, patch)
    } catch (dbErr) {
      if (uploaded) {
        try {
          await deleteImageByPublicId(uploaded.publicId)
        } catch (cleanupErr) {
          logger.error('Failed to roll back orphaned Cloudinary asset after merchandise update failure', {
            publicId: uploaded.publicId,
            saveError: dbErr.message,
            cleanupError: cleanupErr.message,
          })
        }
      }
      if (dbErr.code === '23505') throw httpError('That SKU is already in use.', 400)
      throw dbErr
    }

    if (uploaded && existing.cloudinary_public_id) {
      try {
        await deleteImageByPublicId(existing.cloudinary_public_id)
      } catch (err) {
        logger.error('Cloudinary delete failed for replaced merchandise image', {
          id,
          publicId: existing.cloudinary_public_id,
          error: err.message,
        })
      }
    }

    res.json(toAdminShape(row))
  } catch (err) {
    next(err)
  }
}

export async function deleteMerchandiseHandler(req, res, next) {
  try {
    const id = Number(req.params.id)
    const row = Number.isInteger(id) ? await deleteMerchandise(id) : null
    if (!row) throw httpError('Product not found.', 404)

    if (row.cloudinary_public_id) {
      try {
        await deleteImageByPublicId(row.cloudinary_public_id)
      } catch (err) {
        logger.error('Cloudinary delete failed during merchandise removal', {
          id,
          publicId: row.cloudinary_public_id,
          error: err.message,
        })
      }
    }
    res.json({ id: row.id })
  } catch (err) {
    next(err)
  }
}
