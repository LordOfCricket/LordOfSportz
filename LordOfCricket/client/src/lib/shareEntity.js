// Priority 5 — share a LOC entity by its stable PUBLIC web URL.
//
// The URL is always this site's own origin + the entity's real public route
// (never a local-only or app-scheme URL). `window.location.origin` is the
// deployed frontend origin in production and localhost in dev — the same
// value useSeoMeta.js already uses for canonical/OG tags, so a shared link
// always points at exactly the page the sharer is looking at.

/** Absolute public URL for a public route path (e.g. "/players/PLR-abc"). */
export function publicShareUrl(path) {
  const origin = typeof window !== 'undefined' && window.location ? window.location.origin : ''
  return `${origin}${path.startsWith('/') ? path : `/${path}`}`
}

/**
 * Share `{ title, text, path }`. Prefers the native share sheet
 * (navigator.share), falls back to copying the URL to the clipboard.
 * @returns {Promise<'shared'|'copied'|'unsupported'>}
 */
export async function shareEntity({ title, text, path }) {
  const url = publicShareUrl(path)
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ title, text, url })
      return 'shared'
    } catch (err) {
      // AbortError = user dismissed the sheet; nothing to do, don't fall through
      if (err && err.name === 'AbortError') return 'shared'
      // any other failure: fall through to clipboard
    }
  }
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(url)
      return 'copied'
    } catch {
      /* ignore */
    }
  }
  return 'unsupported'
}
