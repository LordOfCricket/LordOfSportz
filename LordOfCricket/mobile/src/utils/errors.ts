import { AxiosError } from 'axios'

export function getErrorMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    const data = error.response?.data
    return data?.message || data?.error || error.message || 'An error occurred'
  }
  if (error instanceof Error) {
    return error.message
  }
  return 'An unexpected error occurred'
}

export function isNetworkError(error: unknown): boolean {
  if (error instanceof AxiosError) {
    return !error.response || error.message === 'Network Error'
  }
  return false
}

/**
 * The backend gates every SUPER_ADMIN / GROUND_OWNER route behind a second
 * factor and answers `403 { code: 'MFA_REQUIRED' }` when the session has not
 * been verified. There is no mobile MFA flow yet, so callers surface a
 * dedicated notice instead of a generic error.
 */
export function isMfaRequiredError(error: unknown): boolean {
  return error instanceof AxiosError && error.response?.data?.code === 'MFA_REQUIRED'
}
