import { BOUT_STATUS_TRANSITIONS, type BoutStatusValue } from "@karate/types";
import { ConflictError } from "@karate/shared";

export function assertValidBoutTransition(currentStatus: BoutStatusValue, nextStatus: BoutStatusValue): void {
  const allowedNextStatuses = BOUT_STATUS_TRANSITIONS[currentStatus];
  if (!allowedNextStatuses.includes(nextStatus)) {
    throw new ConflictError(
      `Cannot move bout from ${currentStatus} to ${nextStatus}. Allowed: ${
        allowedNextStatuses.length > 0 ? allowedNextStatuses.join(", ") : "none (terminal state)"
      }.`,
    );
  }
}
