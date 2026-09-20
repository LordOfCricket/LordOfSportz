import {
  listGalleryImages,
  getGalleryImageById,
  createGalleryImage,
  updateGalleryImageMetadata,
  deleteGalleryImage,
} from '../services/galleryImage.service.js'

export async function listImages(req, res, next) {
  try {
    const images = await listGalleryImages({ category: req.query.category })
    res.json({ success: true, images })
  } catch (err) {
    next(err)
  }
}

export async function getImage(req, res, next) {
  try {
    const image = await getGalleryImageById(req.params.id)
    res.json({ success: true, image })
  } catch (err) {
    next(err)
  }
}

export async function uploadImage(req, res, next) {
  try {
    const { title, description, category, order } = req.body
    const image = await createGalleryImage({
      file: req.file,
      title,
      description,
      category,
      order,
      createdBy: req.user?.id ?? null,
    })
    res.status(201).json({ success: true, image })
  } catch (err) {
    next(err)
  }
}

export async function updateImage(req, res, next) {
  try {
    const image = await updateGalleryImageMetadata(req.params.id, req.body)
    res.json({ success: true, image })
  } catch (err) {
    next(err)
  }
}

export async function deleteImage(req, res, next) {
  try {
    const result = await deleteGalleryImage(req.params.id)
    res.json({ success: true, ...result })
  } catch (err) {
    next(err)
  }
}
