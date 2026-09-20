// Hand-authored, not Math.random() — a random position generated at render
// time would reshuffle on every re-render (StrictMode double-invoke, or any
// unrelated state update elsewhere on the page), which reads as particles
// "jumping." A fixed layout, with staggered NEGATIVE animation-delays so
// they don't all launch in visible sync, gives the same organic scatter
// with zero re-render risk.
const PARTICLES = [
  { left: '4%', size: 2, duration: 26, delay: -2, opacity: 0.35 },
  { left: '12%', size: 3, duration: 32, delay: -14, opacity: 0.25 },
  { left: '21%', size: 2, duration: 24, delay: -8, opacity: 0.4 },
  { left: '29%', size: 3, duration: 30, delay: -20, opacity: 0.3 },
  { left: '38%', size: 2, duration: 22, delay: -5, opacity: 0.35 },
  { left: '47%', size: 3, duration: 34, delay: -16, opacity: 0.25 },
  { left: '55%', size: 2, duration: 27, delay: -11, opacity: 0.4 },
  { left: '63%', size: 3, duration: 29, delay: -3, opacity: 0.3 },
  // Everything from here down is desktop/tablet-only (`hidden sm:block`) —
  // mobile keeps the first 8.
  { left: '71%', size: 2, duration: 25, delay: -19, opacity: 0.35 },
  { left: '78%', size: 3, duration: 33, delay: -9, opacity: 0.25 },
  { left: '85%', size: 2, duration: 23, delay: -13, opacity: 0.4 },
  { left: '92%', size: 3, duration: 31, delay: -7, opacity: 0.3 },
  { left: '8%', size: 2, duration: 28, delay: -17, opacity: 0.3 },
  { left: '35%', size: 2, duration: 26, delay: -1, opacity: 0.35 },
  { left: '60%', size: 2, duration: 30, delay: -22, opacity: 0.3 },
  { left: '90%', size: 2, duration: 24, delay: -6, opacity: 0.35 },
]

const MOBILE_COUNT = 8

/**
 * Layer 4 — tiny drifting dust motes. Pure CSS animation (transform +
 * opacity only, see .loc-bg-particle in index.css) — no per-frame React
 * work, no JS animation loop, for something that just needs to loop
 * quietly for as long as the homepage is mounted.
 */
export default function FloatingParticles() {
  return (
    <>
      {PARTICLES.map((p, i) => (
        <span
          key={i}
          className={`loc-bg-particle absolute bottom-[-6%] rounded-full bg-loc-warmwhite/70 ${
            i >= MOBILE_COUNT ? 'hidden sm:block' : ''
          }`}
          style={{
            left: p.left,
            width: p.size,
            height: p.size,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
            '--loc-particle-opacity': p.opacity,
          }}
        />
      ))}
    </>
  )
}
