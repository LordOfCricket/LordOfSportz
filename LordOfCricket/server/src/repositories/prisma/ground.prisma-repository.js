import { prisma } from '../../config/prisma.js'

// Phase 2A repository foundation — Prisma-backed mirror of the read-only
// lookups in models/ground.model.js, kept as a SEPARATE, not-yet-adopted
// file (see docs/DATABASE.md). Field names match models/ground.model.js's
// raw-SQL row shape exactly (Prisma's introspected model uses the same
// snake_case column names, no camelCase mapping applied), so swapping a
// call site later is a drop-in replacement, not a shape change. No
// controller/service imports this yet — that adoption is a deliberate,
// separately-reviewed step, not part of this foundation.

export async function findGroundByPublicId(publicGroundId) {
  return prisma.grounds.findUnique({ where: { public_ground_id: publicGroundId } })
}

export async function findGroundBySlug(slug) {
  return prisma.grounds.findUnique({ where: { slug } })
}

export async function findAllGrounds() {
  return prisma.grounds.findMany({ orderBy: { id: 'asc' } })
}
