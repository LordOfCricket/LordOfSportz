import {
  createGroundPhoto,
  findAllGroundPhotos,
  deleteGroundPhoto,
} from '../models/groundPhoto.model.js'
import { uploadImageFileDetailed, deleteImageByPublicId } from '../utils/cloudinaryUpload.js'
import { isValidHttpUrl } from '../domain/accountCreation/validation.js'
import { logger } from '../utils/logger.js'

const CLOUDINARY_FOLDER = 'LOC/ground-photos'

export async function listGroundPhotos(req, res, next) {
  try {
    const photos = await findAllGroundPhotos()
    res.json(photos)
  } catch (err) {
    next(err)
  }
}

export async function addGroundPhoto(req, res, next) {
  try {
    const { title, imageUrl, sortOrder } = req.body
    if (!imageUrl) {
      return res.status(400).json({ message: 'imageUrl is required' })
    }
    if (!isValidHttpUrl(imageUrl)) {
      return res.status(400).json({ message: 'imageUrl must be a valid http(s) URL.' })
    }
    // Externally-hosted URL, not an upload through this app — no Cloudinary
    // asset of ours exists for it, so cloudinaryPublicId stays null.
    const photo = await createGroundPhoto({ groundId: req.ground.id, title, imageUrl, sortOrder })
    res.status(201).json(photo)
  } catch (err) {
    next(err)
  }
}

export async function uploadGroundPhoto(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'photo file is required' })
    }
    const { title, sortOrder } = req.body
    const uploaded = await uploadImageFileDetailed(req.file, CLOUDINARY_FOLDER)

    try {
      const photo = await createGroundPhoto({
        groundId: req.ground.id,
        title,
        imageUrl: uploaded.url,
        sortOrder,
        cloudinaryPublicId: uploaded.publicId,
      })
      res.status(201).json(photo)
    } catch (dbErr) {
      // Cloudinary upload already succeeded — don't leave it orphaned just
      // because the DB write failed.
      try {
        await deleteImageByPublicId(uploaded.publicId)
      } catch (cleanupErr) {
        logger.error('Failed to roll back orphaned Cloudinary asset after ground_photos insert failure', {
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

export async function removeGroundPhoto(req, res, next) {
  try {
    const photo = await deleteGroundPhoto(req.params.id)
    if (!photo) {
      return res.status(404).json({ message: 'Ground photo not found' })
    }
    if (photo.cloudinary_public_id) {
      try {
        await deleteImageByPublicId(photo.cloudinary_public_id)
      } catch (err) {
        // The DB row is already gone (matches this app's existing delete
        // behavior for this table) — log rather than fail the request, so a
        // transient Cloudinary hiccup doesn't strand an admin on a photo
        // that's already removed from the gallery.
        logger.error('Cloudinary delete failed during ground photo removal', {
          id: req.params.id,
          publicId: photo.cloudinary_public_id,
          error: err.message,
        })
      }
    }
    res.json(photo)
  } catch (err) {
    next(err)
  }
}
