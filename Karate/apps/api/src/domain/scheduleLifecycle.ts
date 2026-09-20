import { SCHEDULE_STATUS_TRANSITIONS, type ScheduleStatus } from "@karate/types";
import { ConflictError } from "@karate/shared";

export function assertValidScheduleTransition(
  currentStatus: ScheduleStatus,
  nextStatus: ScheduleStatus,
): void {
  const allowedNextStatuses = SCHEDULE_STATUS_TRANSITIONS[currentStatus];
  if (!allowedNextStatuses.includes(nextStatus)) {
    throw new ConflictError(
      `Cannot move schedule from ${currentStatus} to ${nextStatus}. Allowed: ${
        allowedNextStatuses.length > 0 ? allowedNextStatuses.join(", ") : "none (terminal state)"
      }.`,
    );
  }
}
