import { useEffect } from 'react'

// Phase 12 — injects a single JSON-LD <script> tag for structured data.
// Only ever fed real, already-fetched data by callers (ground name/address/
// photos actually returned by the API) — never fabricated ratings, reviews,
// or prices this app has no source of truth for.
export function useJsonLd(data) {
  // Serialized once up front so a caller passing a fresh object literal each
  // render (the common case) doesn't re-run this effect — and re-append/
  // remove the <script> tag — on every render; only the actual JSON content
  // changing does.
  const json = data ? JSON.stringify(data) : null

  useEffect(() => {
    if (!json) return undefined
    const script = document.createElement('script')
    script.type = 'application/ld+json'
    script.text = json
    document.head.appendChild(script)
    return () => script.remove()
  }, [json])
}
