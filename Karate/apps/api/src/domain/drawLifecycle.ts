import { DRAW_STATUS_TRANSITIONS, type DrawStatus } from "@karate/types";
import { ConflictError } from "@karate/shared";

export function assertValidDrawTransition(currentStatus: DrawStatus, nextStatus: DrawStatus): void {
  const allowedNextStatuses = DRAW_STATUS_TRANSITIONS[currentStatus];
  if (!allowedNextStatuses.includes(nextStatus)) {
    throw new ConflictError(
      `Cannot move draw from ${currentStatus} to ${nextStatus}. Allowed: ${
        allowedNextStatuses.length > 0 ? allowedNextStatuses.join(", ") : "none (terminal state)"
      }.`,
    );
  }
}
