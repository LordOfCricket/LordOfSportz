import { getAmenities, uploadAmenity, deleteAmenity } from '../services/amenities.js'

export { getAmenities, uploadAmenity, deleteAmenity }

export function nextSortOrder(amenities) {
  return amenities.length + 1
}
