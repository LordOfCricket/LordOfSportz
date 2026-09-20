import { prisma } from '../../config/prisma.js'

// Phase 2A repository foundation — Prisma-backed mirror of
// models/staffRole.model.js. See ground.prisma-repository.js's header
// comment for the adoption policy (not wired into any live route yet).

export async function findStaffRoleByName(name) {
  return prisma.staff_roles.findUnique({ where: { name } })
}
