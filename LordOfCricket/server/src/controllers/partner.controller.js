import { createPartner, findAllPartners, findActivePartners, findPartnerById, updatePartner, deletePartner } from '../models/partner.model.js'
import { uploadImageFileDetailed, deleteImageByPublicId } from '../utils/cloudinaryUpload.js'
import { recordEvent, ACCOUNT_AUDIT_EVENTS } from '../services/accountAudit.service.js'
import { logger } from '../utils/logger.js'

const CLOUDINARY_FOLDER = 'LOC/partners'

// Public — the LOC homepage's SponsorsSection.jsx. Only active/visible ones.
export async function listPartners(req, res, next) {
  try {
    const partners = await findActivePartners()
    res.json(partners)
  } catch (err) {
    next(err)
  }
}

// Admin — the Sponsors management page. Every sponsor, active or not, so a
// deactivated one can still be found and reactivated.
export async function listAllPartnersAdmin(req, res, next) {
  try {
    const partners = await findAllPartners()
    res.json(partners)
  } catch (err) {
    next(err)
  }
}

export async function addPartner(req, res, next) {
  try {
    const { name, logoUrl, websiteUrl, description, sortOrder } = req.body
    if (!name || !logoUrl) {
      return res.status(400).json({ message: 'name and logoUrl are required' })
    }
    const partner = await createPartner({ name, logoUrl, websiteUrl, description, sortOrder })
    await recordEvent(ACCOUNT_AUDIT_EVENTS.SPONSOR_CREATED, { actorUserId: req.user.id, metadata: { partnerId: partner.id, name: partner.name } })
    res.status(201).json(partner)
  } catch (err) {
    next(err)
  }
}

export async function uploadPartner(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'logo file is required' })
    }
    const { name, websiteUrl, description, sortOrder } = req.body
    if (!name) {
      return res.status(400).json({ message: 'name is required' })
    }
    const uploaded = await uploadImageFileDetailed(req.file, CLOUDINARY_FOLDER)

    try {
      const partner = await createPartner({
        name,
        logoUrl: uploaded.url,
        websiteUrl,
        description,
        sortOrder,
        cloudinaryPublicId: uploaded.publicId,
      })
      await recordEvent(ACCOUNT_AUDIT_EVENTS.SPONSOR_CREATED, { actorUserId: req.user.id, metadata: { partnerId: partner.id, name: partner.name } })
      res.status(201).json(partner)
    } catch (dbErr) {
      try {
        await deleteImageByPublicId(uploaded.publicId)
      } catch (cleanupErr) {
        logger.error('Failed to roll back orphaned Cloudinary asset after partners insert failure', {
          publicId: uploaded.publicId,
          saveError: dbErr.message,
          cleanupError: cleanupErr.message,
        })
      }
      throw dbErr
    }
  } catch (err) {
    next(err)
  }
}

// Edit an existing sponsor — name/description/websiteUrl/isActive/
// displayOrder, and optionally a replacement logo (multipart, field
// optional — same "upload new, then swap" shape as uploadPartner, only
// deleting the OLD Cloudinary asset once the DB update has succeeded).
export async function updatePartnerHandler(req, res, next) {
  try {
    const id = Number(req.params.id)
    const existing = await findPartnerById(id)
    if (!existing) {
      return res.status(404).json({ message: 'Partner not found' })
    }

    const { name, websiteUrl, description, isActive, sortOrder } = req.body
    const fields = {}
    if (name !== undefined) fields.name = name
    if (websiteUrl !== undefined) fields.website_url = websiteUrl
    if (description !== undefined) fields.description = description
    if (sortOrder !== undefined) fields.sort_order = sortOrder
    if (isActive !== undefined) fields.is_active = isActive === true || isActive === 'true'

    let uploaded = null
    if (req.file) {
      uploaded = await uploadImageFileDetailed(req.file, CLOUDINARY_FOLDER)
      fields.logo_url = uploaded.url
      fields.cloudinary_public_id = uploaded.publicId
    }

    let partner
    try {
      partner = await updatePartner(id, fields)
    } catch (dbErr) {
      if (uploaded) {
        try {
          await deleteImageByPublicId(uploaded.publicId)
        } catch (cleanupErr) {
          logger.error('Failed to roll back orphaned Cloudinary asset after partner update failure', {
            publicId: uploaded.publicId,
            saveError: dbErr.message,
            cleanupError: cleanupErr.message,
          })
        }
      }
      throw dbErr
    }

    // Old logo is only deleted AFTER the DB update commits successfully,
    // and only once we know a new one actually replaced it.
    if (uploaded && existing.cloudinary_public_id) {
      try {
        await deleteImageByPublicId(existing.cloudinary_public_id)
      } catch (err) {
        logger.error('Cloudinary delete failed for replaced partner logo', { id, publicId: existing.cloudinary_public_id, error: err.message })
      }
    }

    const deactivating = fields.is_active === false && existing.is_active !== false
    await recordEvent(
      deactivating ? ACCOUNT_AUDIT_EVENTS.SPONSOR_DEACTIVATED : ACCOUNT_AUDIT_EVENTS.SPONSOR_UPDATED,
      { actorUserId: req.user.id, metadata: { partnerId: id, name: partner.name } },
    )

    res.json(partner)
  } catch (err) {
    next(err)
  }
}

export async function removePartner(req, res, next) {
  try {
    const partner = await deletePartner(req.params.id)
    if (!partner) {
      return res.status(404).json({ message: 'Partner not found' })
    }
    if (partner.cloudinary_public_id) {
      try {
        await deleteImageByPublicId(partner.cloudinary_public_id)
      } catch (err) {
        logger.error('Cloudinary delete failed during partner removal', {
          id: req.params.id,
          publicId: partner.cloudinary_public_id,
          error: err.message,
        })
      }
    }
    await recordEvent(ACCOUNT_AUDIT_EVENTS.SPONSOR_DELETED, { actorUserId: req.user.id, metadata: { partnerId: partner.id, name: partner.name } })
    res.json(partner)
  } catch (err) {
    next(err)
  }
}
