import {
  getGroundPhotos,
  uploadGroundPhoto,
  deleteGroundPhoto,
} from '../services/groundPhotos.js'

export { getGroundPhotos, uploadGroundPhoto, deleteGroundPhoto }

export function nextSortOrder(photos) {
  return photos.length + 1
}
