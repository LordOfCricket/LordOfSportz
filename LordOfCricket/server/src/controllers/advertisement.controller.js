import {
  createAdvertisement,
  findAllAdvertisements,
  deleteAdvertisement,
} from '../models/advertisement.model.js'

export async function listAdvertisements(req, res, next) {
  try {
    const ads = await findAllAdvertisements()
    res.json(ads)
  } catch (err) {
    next(err)
  }
}

export async function addAdvertisement(req, res, next) {
  try {
    const { title, imageUrl, linkUrl, sortOrder } = req.body
    if (!imageUrl) {
      return res.status(400).json({ message: 'imageUrl is required' })
    }
    const ad = await createAdvertisement({ title, imageUrl, linkUrl, sortOrder })
    res.status(201).json(ad)
  } catch (err) {
    next(err)
  }
}

export async function removeAdvertisement(req, res, next) {
  try {
    const ad = await deleteAdvertisement(req.params.id)
    if (!ad) {
      return res.status(404).json({ message: 'Advertisement not found' })
    }
    res.json(ad)
  } catch (err) {
    next(err)
  }
}
