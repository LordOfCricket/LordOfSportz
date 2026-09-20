import { prisma, Prisma } from "@karate/database";

/**
 * Single write path to the append-only audit_logs table (schema existed
 * since Phase 1, unused until now). `actorUserId` is always the
 * authenticated caller who performed the action, never a client-supplied
 * identity. Never pass medical/health content in `metadata` — audit rows are
 * readable by more people than the underlying record.
 */
export async function recordAudit(
  actorUserId: string,
  action: string,
  entityType: string,
  entityId: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await prisma.auditLog.create({
    data: { actorUserId, action, entityType, entityId, metadata: metadata as Prisma.InputJsonValue },
  });
}
