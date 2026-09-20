import * as ImagePicker from 'expo-image-picker'
import { validatePhoto } from './photoValidation'

// Shared image selection for Super Admin content uploads. Backend accepts
// JPEG / PNG / WEBP up to 10 MB (partner / merchandise routes); the same
// validatePhoto used by the player-photo flow enforces that here.

const EXT_MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }

function inferType(asset) {
  if (asset?.mimeType && EXT_MIME[asset.mimeType.split('/').pop()]) return asset.mimeType
  const ext = String(asset?.uri || asset?.fileName || '').toLowerCase().split('.').pop()
  return EXT_MIME[ext] || asset?.mimeType || 'image/jpeg'
}

function inferName(asset, type) {
  if (asset?.fileName) return asset.fileName
  const ext = (type.split('/').pop() || 'jpg').replace('jpeg', 'jpg')
  return `upload.${ext}`
}

// Returns { uri, type, name, size } or null (cancelled / denied / invalid).
// `onError(message)` reports permission / validation problems to the caller.
export async function pickContentImage(onError) {
  try {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      onError?.('Photo library access is needed to choose an image. Enable it in Settings.')
      return null
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    })
    if (result.canceled || !result.assets?.length) return null

    const asset = result.assets[0]
    const type = inferType(asset)
    const check = await validatePhoto(asset.uri, type, asset.fileSize ?? null)
    if (!check.valid) {
      onError?.(check.error?.message || 'That image can’t be used.')
      return null
    }

    return { uri: asset.uri, type, name: inferName(asset, type), size: asset.fileSize ?? null }
  } catch {
    onError?.('Couldn’t open the photo library. Try again.')
    return null
  }
}

// React Native multipart file part.
export function toFilePart(image) {
  return { uri: image.uri, name: image.name, type: image.type }
}
