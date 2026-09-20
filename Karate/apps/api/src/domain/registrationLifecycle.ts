import { REGISTRATION_STATUS_TRANSITIONS, type RegistrationStatus } from "@karate/types";
import { ConflictError } from "@karate/shared";

/**
 * The only place a registration's status is allowed to change, mirroring
 * tournamentLifecycle.ts. Never let a controller set `status` directly from
 * client input.
 */
export function assertValidRegistrationTransition(
  currentStatus: RegistrationStatus,
  nextStatus: RegistrationStatus,
): void {
  const allowedNextStatuses = REGISTRATION_STATUS_TRANSITIONS[currentStatus];
  if (!allowedNextStatuses.includes(nextStatus)) {
    throw new ConflictError(
      `Cannot move registration from ${currentStatus} to ${nextStatus}. Allowed: ${
        allowedNextStatuses.length > 0 ? allowedNextStatuses.join(", ") : "none (terminal state)"
      }.`,
    );
  }
}
