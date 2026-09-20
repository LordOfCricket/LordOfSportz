import { TATAMI_STATUS_TRANSITIONS, type TatamiStatusValue } from "@karate/types";
import { ConflictError } from "@karate/shared";

export function assertValidTatamiTransition(
  currentStatus: TatamiStatusValue,
  nextStatus: TatamiStatusValue,
): void {
  const allowedNextStatuses = TATAMI_STATUS_TRANSITIONS[currentStatus];
  if (!allowedNextStatuses.includes(nextStatus)) {
    throw new ConflictError(
      `Cannot move tatami from ${currentStatus} to ${nextStatus}. Allowed: ${
        allowedNextStatuses.length > 0 ? allowedNextStatuses.join(", ") : "none (terminal state)"
      }.`,
    );
  }
}
