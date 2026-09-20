import { ReactLenis } from 'lenis/react'

/**
 * Site-wide smooth scroll (mounted once in Layout.jsx, above the router
 * outlet, so it survives route changes instead of re-initializing per page).
 *
 * `root` mode: Lenis smooths the window/document scroll directly and
 * renders NO wrapper <div> — it can't become a new containing block for
 * anything relying on `position: fixed` (the homepage Navbar's header,
 * its mobile menu overlay, BookingModal, etc. all stay exactly as they are).
 *
 * Options, and why each one is set:
 * - `anchors: true` — Lenis's own same-page hash-link handling (used by the
 *   ground homepage's #matches/#about/#booking section links). It reads each
 *   target's `scroll-margin-top` via computed style — the same
 *   `scroll-mt-24` already on those sections — so it lands exactly where the
 *   native anchor jump already did. No navbar-height offset is duplicated
 *   here. (The gallery used to be one of these anchor targets too — it's now
 *   a modal opened from the navbar's "Gallery" button instead.)
 * - `respectReducedMotion: true` (library default, set explicitly for
 *   clarity) — under prefers-reduced-motion, Lenis disables wheel smoothing
 *   (tracks input 1:1) and makes every scrollTo, including the anchor jumps
 *   above, instant.
 * - `syncTouch: false` (library default) — touch scrolling stays fully
 *   native on tablet/mobile; only desktop wheel/trackpad input is smoothed.
 * - `allowNestedScroll: true` — without this, Lenis's default wheel handling
 *   doesn't know about elements with their own scroll (e.g. BookingModal's
 *   `overflow-y-auto` body), and would try to scroll the whole page instead
 *   of letting them scroll internally. This restores that native nested-
 *   scroll behavior everywhere it already existed, with no per-component
 *   opt-out attribute needed.
 */
export default function SmoothScrollProvider({ children }) {
  return (
    <ReactLenis
      root
      options={{
        smoothWheel: true,
        syncTouch: false,
        anchors: true,
        respectReducedMotion: true,
        allowNestedScroll: true,
      }}
    >
      {children}
    </ReactLenis>
  )
}
