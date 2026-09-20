import { CanvasTexture, RepeatWrapping } from 'three'

/**
 * Procedurally generates the cricket ball's surface detail
 * (leather grain + stitched seam) as a single grayscale canvas texture, at
 * runtime, entirely in memory. This is a deliberate choice over an
 * external asset:
 *
 *   1. Source — none; drawn with the 2D canvas API in this file.
 *   2. License — none needed; no third-party asset involved.
 *   3. File size — 0 bytes shipped; nothing added to the repo or the
 *      network waterfall (a canvas texture never touches the network).
 *   4. Resolution — 512×512, generated once per mount and memoized by the
 *      caller (CricketBall.jsx wraps this in useMemo) — small enough that
 *      the one-time generation cost is sub-millisecond and GPU upload is
 *      trivial for a hero-scale object.
 *   5. Why local generation is preferable here — a cricket ball's seam is
 *      a simple, repeatable geometric pattern (an equatorial stitch band)
 *      well within what a few canvas draw calls can produce convincingly;
 *      there's no photographic detail (creases, wear, brand embossing)
 *      that would actually require a captured photo/scan to look right.
 *
 * Used as BOTH `bumpMap` and `roughnessMap` on CricketBall's material —
 * one texture object, two material inputs, keeping total texture count
 * at 1 for the whole ball.
 */
const SIZE = 512
// Mid-grey (128) is THREE's bumpMap "no displacement" baseline — values
// above/below it read as raised/recessed once lit.
const BASE = 128

function drawLeatherGrain(ctx) {
  ctx.fillStyle = `rgb(${BASE},${BASE},${BASE})`
  ctx.fillRect(0, 0, SIZE, SIZE)

  // A soft, larger-scale pass first: real leather has broad,
  // gentle tonal variation (hide grain, tanning irregularity) under the
  // fine speckle, not just uniform noise. Low opacity, low count — this
  // should only ever be visible through lighting, never as visible blobs.
  for (let i = 0; i < 140; i++) {
    const v = BASE - 7 + Math.random() * 14
    const r = 6 + Math.random() * 16
    ctx.fillStyle = `rgba(${v},${v},${v},0.05)`
    ctx.beginPath()
    ctx.arc(Math.random() * SIZE, Math.random() * SIZE, r, 0, Math.PI * 2)
    ctx.fill()
  }

  // Sparse, low-contrast speckle — subtle roughness variation. Deliberately
  // low density/contrast: at normal Hero viewing distance this should read
  // as "leather," not as visible noise.
  for (let i = 0; i < 5000; i++) {
    const v = BASE - 10 + Math.random() * 20
    ctx.fillStyle = `rgba(${v},${v},${v},0.35)`
    ctx.fillRect(Math.random() * SIZE, Math.random() * SIZE, 1, 1)
  }
}

function drawSeam(ctx) {
  // Sphere UV: v=0.5 is the equator — a stitched band here reads as a
  // cricket ball's primary seam circling the ball, and scrolls naturally
  // as the ball spins around its Y axis in CricketBall.jsx.
  const seamY = SIZE * 0.5
  const stitchCount = 90
  const stitchLength = SIZE * 0.032
  const spacing = SIZE / stitchCount

  // A soft shadowed channel underneath everything else: a real
  // stitched seam sits in a shallow recessed groove across the whole
  // leather panel join, not just two hairline strokes. This gradient reads
  // as gentle ambient-occlusion-style depth once lit, and is drawn first so
  // the groove/ridge/stitch lines below sit on top of it. Widened/darkened
  // from the first pass, which measured out too faint once actually seen
  // at the ball's on-page size against the new higher-contrast lighting.
  const channel = ctx.createLinearGradient(0, seamY - SIZE * 0.07, 0, seamY + SIZE * 0.07)
  channel.addColorStop(0, `rgba(${BASE - 25},${BASE - 25},${BASE - 25},0)`)
  channel.addColorStop(0.5, `rgba(${BASE - 25},${BASE - 25},${BASE - 25},0.45)`)
  channel.addColorStop(1, `rgba(${BASE - 25},${BASE - 25},${BASE - 25},0)`)
  ctx.fillStyle = channel
  ctx.fillRect(0, seamY - SIZE * 0.07, SIZE, SIZE * 0.14)

  // Two thin darker "groove" lines flanking the seam — a real seam sits
  // in a shallow channel, not just a raised line on a flat surface; this
  // pairing of dark-groove + bright-ridge is what makes a bump map read
  // as carved-in rather than a faint smudge. Deepened again — this is the
  // single highest-contrast pair in the texture, since it's what makes the
  // seam recognizable at a glance rather than requiring a close look.
  ctx.strokeStyle = `rgb(${BASE - 78},${BASE - 78},${BASE - 78})`
  ctx.lineWidth = SIZE * 0.022
  ;[-1, 1].forEach((side) => {
    ctx.beginPath()
    ctx.moveTo(0, seamY + side * SIZE * 0.024)
    ctx.lineTo(SIZE, seamY + side * SIZE * 0.024)
    ctx.stroke()
  })

  // A continuous raised ridge under the stitches.
  ctx.strokeStyle = `rgb(${BASE + 60},${BASE + 60},${BASE + 60})`
  ctx.lineWidth = SIZE * 0.015
  ctx.beginPath()
  ctx.moveTo(0, seamY)
  ctx.lineTo(SIZE, seamY)
  ctx.stroke()

  // The individual cross-stitches, alternating direction like a real
  // machine-stitched seam — the brightest element, so it reads first. Each
  // stitch gets a small random offset/length jitter so the band reads as
  // hand/machine-stitched leather rather than a perfectly uniform vector
  // pattern repeated 90 times.
  ctx.strokeStyle = `rgb(${BASE + 120},${BASE + 120},${BASE + 120})`
  ctx.lineWidth = SIZE * 0.013
  ctx.lineCap = 'round'
  for (let i = 0; i < stitchCount; i++) {
    const x = i * spacing
    const dir = i % 2 === 0 ? 1 : -1
    const jitter = (Math.random() - 0.5) * spacing * 0.2
    const length = stitchLength * (0.88 + Math.random() * 0.24)
    ctx.beginPath()
    ctx.moveTo(x + jitter, seamY - (length / 2) * dir)
    ctx.lineTo(x + spacing * 0.6 + jitter, seamY + (length / 2) * dir)
    ctx.stroke()
  }
}

export function createCricketBallSurfaceTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')

  drawLeatherGrain(ctx)
  drawSeam(ctx)

  const texture = new CanvasTexture(canvas)
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.needsUpdate = true
  return texture
}
