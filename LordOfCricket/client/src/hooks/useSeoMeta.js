import { useEffect } from 'react'

// Phase 12 — no head-management library exists in this project (every page
// currently only sets document.title directly via useEffect); this extends
// that same pattern to meta description/canonical/Open Graph/Twitter tags
// instead of pulling in react-helmet for a handful of call sites. Each tag
// is created if missing, restored to its previous value (or removed, if it
// didn't exist before) on unmount/re-run — so navigating between pages never
// leaves a stale description/canonical from the previous page active.

function setMetaTag(attr, key, content) {
  if (!content) return null
  let el = document.head.querySelector(`meta[${attr}="${key}"]`)
  const existed = !!el
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  const previous = el.getAttribute('content')
  el.setAttribute('content', content)
  return () => {
    if (!existed) el.remove()
    else if (previous !== null) el.setAttribute('content', previous)
  }
}

function setLinkTag(rel, href) {
  if (!href) return null
  let el = document.head.querySelector(`link[rel="${rel}"]`)
  const existed = !!el
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', rel)
    document.head.appendChild(el)
  }
  const previous = el.getAttribute('href')
  el.setAttribute('href', href)
  return () => {
    if (!existed) el.remove()
    else if (previous !== null) el.setAttribute('href', previous)
  }
}

/**
 * @param {Object} opts
 * @param {string} [opts.title]
 * @param {string} [opts.description]
 * @param {string} [opts.canonical] - absolute URL
 * @param {string} [opts.ogImage] - absolute URL
 * @param {string} [opts.ogType]
 */
export function useSeoMeta({ title, description, canonical, ogImage, ogType = 'website' } = {}) {
  useEffect(() => {
    const cleanups = []

    if (title) {
      const prevTitle = document.title
      document.title = title
      cleanups.push(() => { document.title = prevTitle })
    }
    cleanups.push(setMetaTag('name', 'description', description))
    cleanups.push(setLinkTag('canonical', canonical))
    cleanups.push(setMetaTag('property', 'og:title', title))
    cleanups.push(setMetaTag('property', 'og:description', description))
    cleanups.push(setMetaTag('property', 'og:type', ogType))
    cleanups.push(setMetaTag('property', 'og:url', canonical))
    cleanups.push(setMetaTag('property', 'og:image', ogImage))
    cleanups.push(setMetaTag('name', 'twitter:card', ogImage ? 'summary_large_image' : 'summary'))
    cleanups.push(setMetaTag('name', 'twitter:title', title))
    cleanups.push(setMetaTag('name', 'twitter:description', description))
    cleanups.push(setMetaTag('name', 'twitter:image', ogImage))

    return () => {
      for (const fn of cleanups) if (fn) fn()
    }
  }, [title, description, canonical, ogImage, ogType])
}
