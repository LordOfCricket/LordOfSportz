import { createAmenity, findAllAmenities, deleteAmenity } from '../models/amenity.model.js'
import { uploadImageFileDetailed, deleteImageByPublicId } from '../utils/cloudinaryUpload.js'
import { isValidHttpUrl } from '../domain/accountCreation/validation.js'
import { logger } from '../utils/logger.js'

const CLOUDINARY_FOLDER = 'LOC/amenities'

export async function listAmenities(req, res, next) {
  try {
    const amenities = await findAllAmenities()
    res.json(amenities)
  } catch (err) {
    next(err)
  }
}

export async function addAmenity(req, res, next) {
  try {
    const { name, imageUrl, sortOrder } = req.body
    if (!name || !imageUrl) {
      return res.status(400).json({ message: 'name and imageUrl are required' })
    }
    if (!isValidHttpUrl(imageUrl)) {
      return res.status(400).json({ message: 'imageUrl must be a valid http(s) URL.' })
    }
    const amenity = await createAmenity({ groundId: req.ground.id, name, imageUrl, sortOrder })
    res.status(201).json(amenity)
  } catch (err) {
    next(err)
  }
}

export async function uploadAmenity(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'photo file is required' })
    }
    const { name, sortOrder } = req.body
    if (!name) {
      return res.status(400).json({ message: 'name is required' })
    }
    const uploaded = await uploadImageFileDetailed(req.file, CLOUDINARY_FOLDER)

    try {
      const amenity = await createAmenity({
        groundId: req.ground.id,
        name,
        imageUrl: uploaded.url,
        sortOrder,
        cloudinaryPublicId: uploaded.publicId,
      })
      res.status(201).json(amenity)
    } catch (dbErr) {
      try {
        await deleteImageByPublicId(uploaded.publicId)
      } catch (cleanupErr) {
        logger.error('Failed to roll back orphaned Cloudinary asset after amenities insert failure', {
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

export async function removeAmenity(req, res, next) {
  try {
    const amenity = await deleteAmenity(req.params.id)
    if (!amenity) {
      return res.status(404).json({ message: 'Amenity not found' })
    }
    if (amenity.cloudinary_public_id) {
      try {
        await deleteImageByPublicId(amenity.cloudinary_public_id)
      } catch (err) {
        logger.error('Cloudinary delete failed during amenity removal', {
          id: req.params.id,
          publicId: amenity.cloudinary_public_id,
          error: err.message,
        })
      }
    }
    res.json(amenity)
  } catch (err) {
    next(err)
  }
}
