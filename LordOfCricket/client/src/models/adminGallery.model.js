import { fetchGalleryImages, uploadGalleryImage, updateGalleryImage, deleteGalleryImage } from '../services/gallery.js'

export { fetchGalleryImages, uploadGalleryImage, updateGalleryImage, deleteGalleryImage }

export function nextOrder(images) {
  return images.length + 1
}
