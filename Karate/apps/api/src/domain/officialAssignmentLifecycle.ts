import { OFFICIAL_ASSIGNMENT_STATUS_TRANSITIONS, type OfficialAssignmentStatus } from "@karate/types";
import { ConflictError } from "@karate/shared";

export function assertValidOfficialAssignmentTransition(
  currentStatus: OfficialAssignmentStatus,
  nextStatus: OfficialAssignmentStatus,
): void {
  const allowedNextStatuses = OFFICIAL_ASSIGNMENT_STATUS_TRANSITIONS[currentStatus];
  if (!allowedNextStatuses.includes(nextStatus)) {
    throw new ConflictError(
      `Cannot move assignment from ${currentStatus} to ${nextStatus}. Allowed: ${
        allowedNextStatuses.length > 0 ? allowedNextStatuses.join(", ") : "none (terminal state)"
      }.`,
    );
  }
}
