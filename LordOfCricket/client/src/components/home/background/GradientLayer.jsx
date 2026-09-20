/**
 * Layer 1 — the base atmosphere. A single, oversized (`inset:-10%`) dark
 * gradient that drifts via `transform` only (never `background-position`,
 * which is a paint-thread cost on every frame) — the oversize margin means
 * the slow drift/scale never reveals an edge. Frozen to a still, still-
 * beautiful gradient under `prefers-reduced-motion` (see index.css).
 */
export default function GradientLayer() {
  return <div className="loc-bg-gradient-layer" />
}
