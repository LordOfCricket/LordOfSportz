import { findAll, findByKey, createAmenity, updateAmenity, deleteAmenity } from '../models/amenityCatalog.model.js'
import { isAllowedAmenityIcon, AMENITY_ICON_ALLOW_LIST } from '../domain/amenity/iconAllowList.js'
import { recordEvent, ACCOUNT_AUDIT_EVENTS } from '../services/accountAudit.service.js'
import { slugify } from '../utils/slug.js'

const KEY_MAX_LENGTH = 40
// Leaves room for a "_NN" collision suffix without ever exceeding the
// VARCHAR(40) column.
const KEY_BASE_MAX_LENGTH = 34

// amenity_catalog's existing seed keys are underscore_case ('practice_nets'),
// not slugify's default hyphens — converted here so admin-created entries
// match the established convention exactly.
async function generateUniqueKey(name) {
  const base = (slugify(name).replace(/-/g, '_') || 'amenity').slice(0, KEY_BASE_MAX_LENGTH)
  let candidate = base
  let suffix = 2
  while (await findByKey(candidate)) {
    candidate = `${base}_${suffix}`.slice(0, KEY_MAX_LENGTH)
    suffix += 1
  }
  return candidate
}

export async function listAllAmenities(req, res, next) {
  try {
    res.json({ amenities: await findAll(), iconAllowList: AMENITY_ICON_ALLOW_LIST })
  } catch (err) {
    next(err)
  }
}

export async function createAmenityHandler(req, res, next) {
  try {
    const { name, icon, displayOrder } = req.body
    if (!name || !icon) {
      return res.status(400).json({ error: 'name and icon are required.' })
    }
    if (!isAllowedAmenityIcon(icon)) {
      return res.status(400).json({ error: 'icon must be one of the allowed amenity icons.' })
    }
    const key = await generateUniqueKey(name)
    const amenity = await createAmenity({ key, name, icon, displayOrder: displayOrder ?? 0 })
    await recordEvent(ACCOUNT_AUDIT_EVENTS.AMENITY_CREATED, { actorUserId: req.user.id, metadata: { key: amenity.key, name: amenity.name } })
    res.status(201).json(amenity)
  } catch (err) {
    next(err)
  }
}

export async function updateAmenityHandler(req, res, next) {
  try {
    const { key } = req.params
    const existing = await findByKey(key)
    if (!existing) {
      return res.status(404).json({ error: 'Amenity not found.' })
    }

    const { name, icon, displayOrder, isActive } = req.body
    if (icon !== undefined && !isAllowedAmenityIcon(icon)) {
      return res.status(400).json({ error: 'icon must be one of the allowed amenity icons.' })
    }

    const fields = {}
    if (name !== undefined) fields.name = name
    if (icon !== undefined) fields.icon = icon
    if (displayOrder !== undefined) fields.display_order = displayOrder
    if (isActive !== undefined) fields.is_active = isActive === true || isActive === 'true'

    const amenity = await updateAmenity(key, fields)

    const deactivating = fields.is_active === false && existing.is_active !== false
    await recordEvent(
      deactivating ? ACCOUNT_AUDIT_EVENTS.AMENITY_DEACTIVATED : ACCOUNT_AUDIT_EVENTS.AMENITY_UPDATED,
      { actorUserId: req.user.id, metadata: { key, name: amenity.name } },
    )

    res.json(amenity)
  } catch (err) {
    next(err)
  }
}

export async function deleteAmenityHandler(req, res, next) {
  try {
    const { key } = req.params
    const amenity = await deleteAmenity(key)
    if (!amenity) {
      return res.status(404).json({ error: 'Amenity not found.' })
    }
    await recordEvent(ACCOUNT_AUDIT_EVENTS.AMENITY_DELETED, { actorUserId: req.user.id, metadata: { key, name: amenity.name } })
    res.json(amenity)
  } catch (err) {
    // FK violation — this amenity is still referenced by one or more
    // grounds (ground_amenities) or pending requests
    // (ground_registration_amenities). Don't destroy that history —
    // deactivate instead (Part 11 of the brief).
    if (err.code === '23503') {
      return res.status(409).json({ error: 'This amenity is in use by one or more grounds. Deactivate it instead of deleting.' })
    }
    next(err)
  }
}
