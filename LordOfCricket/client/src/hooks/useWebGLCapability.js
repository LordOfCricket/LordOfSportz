import { useState } from 'react'

// A throwaway canvas, never the real render target — created only to ask
// "can a WebGL context exist at all," then discarded.
function detectWebGL() {
  if (typeof document === 'undefined') return false
  try {
    const canvas = document.createElement('canvas')
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
}

// A lightweight, best-effort capability heuristic — not a precise GPU
// benchmark, just enough to keep the Hero scene off hardware where it's
// unlikely to run well. `deviceMemory` is Chrome/Android-only (undefined
// in Safari/Firefox); `hardwareConcurrency` is broadly supported, so it
// carries most of the signal. Either check failing low is enough to
// exclude the device — this errs toward "don't mount" over "mount and
// stutter."
function isLowEndDevice() {
  if (typeof navigator === 'undefined') return false
  const cores = navigator.hardwareConcurrency
  if (typeof cores === 'number' && cores <= 2) return true
  const memory = navigator.deviceMemory
  if (typeof memory === 'number' && memory < 4) return true
  return false
}

/**
 * One-time, synchronous capability probe, checked in Hero.jsx
 * *before* HeroScene's dynamic import ever fires. Unsupported or low-end
 * devices never download the three.js chunk at all — not a visual
 * fallback after the fact, an avoided network request. Mirrors
 * usePointerCapability.js's pattern (a single boolean, computed once);
 * unlike pointer capability, WebGL/hardware support can't change during a
 * session, so no change listener is needed.
 */
export default function useWebGLCapability() {
  const [supported] = useState(() => detectWebGL() && !isLowEndDevice())
  return supported
}
