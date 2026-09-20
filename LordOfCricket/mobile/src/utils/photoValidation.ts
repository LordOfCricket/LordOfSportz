const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])
const MAX_FILE_SIZE_MB = 10
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

export interface PhotoValidationError {
  code: 'missing' | 'unsupported_format' | 'too_large' | 'read_error'
  message: string
}

export async function validatePhoto(
  uri: string | null,
  mimeType: string | null,
  fileSize: number | null
): Promise<{ valid: boolean; error?: PhotoValidationError }> {
  // Check if URI exists
  if (!uri) {
    return {
      valid: false,
      error: { code: 'missing', message: 'Please select an image.' },
    }
  }

  // Check MIME type if available
  if (mimeType && !ALLOWED_MIME_TYPES.has(mimeType)) {
    return {
      valid: false,
      error: {
        code: 'unsupported_format',
        message: 'This image format isn\'t supported. Please use JPEG, PNG, or WEBP.',
      },
    }
  }

  // Check file size if available
  if (fileSize && fileSize > MAX_FILE_SIZE_BYTES) {
    const sizeMB = (fileSize / 1024 / 1024).toFixed(1)
    return {
      valid: false,
      error: {
        code: 'too_large',
        message: `This image is too large (${sizeMB} MB). Please choose an image smaller than 10 MB.`,
      },
    }
  }

  return { valid: true }
}

export function getPhotoErrorMessage(error: PhotoValidationError): string {
  switch (error.code) {
    case 'missing':
      return error.message
    case 'unsupported_format':
      return error.message
    case 'too_large':
      return error.message
    case 'read_error':
      return 'Could not read the image. Please try again.'
    default:
      return 'An error occurred with your image.'
  }
}
