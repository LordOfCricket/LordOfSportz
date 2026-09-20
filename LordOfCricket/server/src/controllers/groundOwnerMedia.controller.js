import {
  createGroundPhoto,
  findPhotosByGroundIdForOwner,
  findPhotoByIdAndGroundId,
  setFeaturedPhoto,
  updatePhotoSortOrder,
  deleteGroundPhotoByOwner,
} from '../models/groundPhoto.model.js'
import { uploadImageFileDetailed, deleteImageByPublicId } from '../utils/cloudinaryUpload.js'
import { isValidHttpUrl } from '../domain/accountCreation/validation.js'
import { logger } from '../utils/logger.js'

const CLOUDINARY_FOLDER = 'LOC/ground-photos'

// Phase 2 — Ground Owner media management. req.ground is resolved +
// authorized by requireGroundRole('GROUND_OWNER') before these ever run.
// req.params.publicGroundId is used ONLY to look up which ground; all
// authorization comes from req.ground.id (already verified owned by req.user).

export async function listGroundMedia(req, res, next) {
  try {
    const photos = await findPhotosByGroundIdForOwner(req.ground.id)
    res.json({ photos })
  } catch (err) {
    next(err)
  }
}

export async function addGroundMediaByUrl(req, res, next) {
  try {
    const { title, sortOrder } = req.body
    const { imageUrl } = req.body

    if (!imageUrl) {
      return res.status(400).json({ error: 'imageUrl is required.' })
    }
    if (!isValidHttpUrl(imageUrl)) {
      return res.status(400).json({ error: 'imageUrl must be a valid http(s) URL.' })
    }

    const photo = await createGroundPhoto({
      groundId: req.ground.id,
      title,
      imageUrl,
      sortOrder: sortOrder || 0,
      cloudinaryPublicId: null,
    })

    res.status(201).json({ photo })
  } catch (err) {
    next(err)
  }
}

export async function uploadGroundMedia(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'photo file is required.' })
    }

    const { title, sortOrder } = req.body
    const uploaded = await uploadImageFileDetailed(req.file, CLOUDINARY_FOLDER)

    try {
      const photo = await createGroundPhoto({
        groundId: req.ground.id,
        title,
        imageUrl: uploaded.url,
        sortOrder: sortOrder || 0,
        cloudinaryPublicId: uploaded.publicId,
      })
      res.status(201).json({ photo })
    } catch (dbErr) {
      // Cloudinary upload already succeeded — clean up the orphan
      try {
        await deleteImageByPublicId(uploaded.publicId)
      } catch (cleanupErr) {
        logger.error('Failed to clean up orphaned Cloudinary asset after ground photo insert', {
          publicId: uploaded.publicId,
          groundId: req.ground.id,
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

export async function deleteGroundMedia(req, res, next) {
  try {
    const photoId = Number(req.params.id)

    // Verify photo belongs to this ground (IDOR protection)
    const photo = await deleteGroundPhotoByOwner(photoId, req.ground.id)

    if (!photo) {
      return res.status(404).json({ error: 'Photo not found.' })
    }

    // Clean up Cloudinary asset if it exists
    if (photo.cloudinary_public_id) {
      try {
        await deleteImageByPublicId(photo.cloudinary_public_id)
      } catch (err) {
        // DB row is already deleted; log but don't fail the request
        logger.error('Cloudinary delete failed during ground photo removal', {
          photoId,
          groundId: req.ground.id,
          publicId: photo.cloudinary_public_id,
          error: err.message,
        })
      }
    }

    res.json({ photo })
  } catch (err) {
    next(err)
  }
}

export async function setHeroPhoto(req, res, next) {
  try {
    const photoId = Number(req.params.id)

    // Verify ownership before setting hero
    const existingPhoto = await findPhotoByIdAndGroundId(photoId, req.ground.id)
    if (!existingPhoto) {
      return res.status(404).json({ error: 'Photo not found.' })
    }

    const photo = await setFeaturedPhoto(req.ground.id, photoId)
    if (!photo) {
      throw new Error('Failed to set hero photo.')
    }

    res.json({ photo })
  } catch (err) {
    next(err)
  }
}

export async function reorderPhotos(req, res, next) {
  try {
    const { updates } = req.body
    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ error: 'updates array is required.' })
    }

    const results = await updatePhotoSortOrder(req.ground.id, updates)
    if (!results) {
      return res.status(404).json({ error: 'One or more photos not found.' })
    }

    res.json({ photos: results })
  } catch (err) {
    next(err)
  }
}
