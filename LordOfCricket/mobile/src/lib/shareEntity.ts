import { Share } from 'react-native'

// Priority 5 — share a LOC entity by its stable PUBLIC WEB URL (never the
// `loc-mobile://` app-scheme link, which only resolves on a device that
// already has the app). The base is EXPO_PUBLIC_WEB_URL when configured
// (same env pattern as EXPO_PUBLIC_API_URL in services/api.ts), falling back
// to the production domain the backend already uses as its own default
// (server APP_URL fallback) — not an invented domain.
export const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL || 'https://lordofcricket.com').replace(/\/+$/, '')

/** Absolute public URL for a public route path (e.g. "/players/PLR-abc"). */
export function publicShareUrl(path: string): string {
  return `${WEB_URL}${path.startsWith('/') ? path : `/${path}`}`
}

/**
 * Open the OS share sheet for `{ title, message, path }`. `message` is a
 * short, factual line; the public URL is appended (and also passed as `url`
 * for iOS, which shows it separately). A dismissed sheet is a no-op.
 */
export async function shareEntity({ title, message, path }: { title?: string; message: string; path: string }): Promise<void> {
  const url = publicShareUrl(path)
  try {
    await Share.share({ title, message: `${message}\n${url}`, url })
  } catch {
    // user dismissed the sheet / share unavailable — nothing to do
  }
}
