/**
 * The canonical environmental progression the background reads
 * from (ScrollEnvironmentContext.jsx). One shared definition consumed by
 * two effects (ScrollAtmosphere's brightness, EnvironmentTint's color)
 * instead of two hand-tuned curves drifting apart over time.
 *
 * Stops are approximate fractions of total page-scroll height, in DOM
 * order (Hero → Footer) — not measured against live section boundaries.
 * Exact pixel snapping isn't the goal: the brief asks for smooth, blended
 * progression ("avoid dramatic transitions"), not a hard cut the instant a
 * section's edge crosses the viewport, so a few percent of drift between
 * devices/content-lengths is invisible in practice. If a future phase
 * needs exact section-edge accuracy, measure each section ref's
 * `offsetTop` instead of adding more hand-picked stops here.
 */
export const SCENE_STOPS = [0, 0.12, 0.3, 0.45, 0.58, 0.72, 0.85, 1]

/**
 * Ambient/Glow brightness multiplier at each stop (ScrollAtmosphere) — the
 * brief's "Lighting Progression": fresh-but-soft at Hero, softer at
 * Gallery, brighter energy at Matches, balanced through Amenities/About/
 * Partners, a warm premium peak at Booking, settling to calm dark at
 * Footer.
 */
export const BRIGHTNESS_STOPS = [0.92, 0.86, 1.05, 1.0, 1.0, 0.95, 1.12, 0.78]

/**
 * Color-temperature grading overlay (EnvironmentTint) at each stop — rgba
 * strings so motion's built-in color interpolation can blend them
 * directly. Kept low-alpha throughout; this is a mood shift, not a wash.
 */
export const TINT_STOPS = [
  'rgba(191, 227, 255, 0.10)', // Hero — cool morning / stadium opening
  'rgba(243, 241, 231, 0.05)', // Gallery — soft neutral
  'rgba(63, 143, 95, 0.10)', // Matches — energetic grass-green
  'rgba(243, 241, 231, 0.04)', // Amenities — balanced, comfortable
  'rgba(22, 48, 61, 0.08)', // About — cool, trustworthy
  'rgba(169, 178, 167, 0.06)', // Partners — professional grey
  'rgba(198, 161, 91, 0.15)', // Booking — warm premium spotlight
  'rgba(14, 18, 16, 0.20)', // Footer — calm settling darkness
]
