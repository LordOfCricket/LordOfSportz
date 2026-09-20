// ============================================================================
// LEGACY MIGRATION TOOLING ONLY — NOT USED BY RUNTIME APPLICATION
// ============================================================================
import mongoose from 'mongoose'

// RETIRED from the live request path (MongoDB cleanup, Phase 1 — see
// docs/ARCHITECTURE.md / the Phase 0 audit report). galleryImage.service.js
// now reads/writes PostgreSQL's `gallery_images` table via
// models/galleryImage.model.js instead. This file is kept, unchanged, ONLY
// so server/src/scripts/migrateGalleryToPostgres.js can read the original
// MongoDB documents, and as a rollback reference (MongoDB's GalleryImage
// data itself is never deleted by the migration). Do not import this from
// any new code — the canonical `GalleryImage` model going forward is the
// PostgreSQL one.
//
// Cloudinary + MongoDB is the storage pair for gallery photography — never a
// second source of cricket truth (that stays PostgreSQL), just media
// metadata. `image.publicId` is what every future transform/delete call
// keys on; `image.url` is the plain Cloudinary secure_url as uploaded
// (delivery-optimized URLs are derived on read via getOptimizedImageUrl,
// not stored, so the optimization strategy can change without a migration).
export const GALLERY_CATEGORIES = ['ground', 'match', 'tournament', 'event']

const galleryImageSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    category: { type: String, enum: GALLERY_CATEGORIES, default: 'ground', required: true },
    image: {
      url: { type: String, required: true },
      publicId: { type: String, required: true },
      width: { type: Number },
      height: { type: Number },
      format: { type: String },
      bytes: { type: Number },
    },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    // Postgres users.id (integer) — Mongo has no User collection of its own,
    // same convention as CanteenOrder.userId.
    createdBy: { type: Number, default: null },
  },
  { timestamps: true },
)

// The one real query pattern this collection serves: "active images in a
// category, in display order" (public gallery reads + the homepage
// carousel). Not adding speculative indexes beyond it.
galleryImageSchema.index({ category: 1, isActive: 1, order: 1 })

export default mongoose.model('GalleryImage', galleryImageSchema)
