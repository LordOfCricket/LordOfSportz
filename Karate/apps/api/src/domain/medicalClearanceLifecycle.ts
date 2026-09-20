import { MEDICAL_CLEARANCE_STATUS_TRANSITIONS, type MedicalClearanceStatusValue } from "@karate/types";
import { ConflictError } from "@karate/shared";

/** The only place a medical clearance's status is allowed to change. Mirrors tournamentLifecycle.ts / registrationLifecycle.ts. */
export function assertValidMedicalClearanceTransition(
  currentStatus: MedicalClearanceStatusValue,
  nextStatus: MedicalClearanceStatusValue,
): void {
  const allowedNextStatuses = MEDICAL_CLEARANCE_STATUS_TRANSITIONS[currentStatus];
  if (!allowedNextStatuses.includes(nextStatus)) {
    throw new ConflictError(
      `Cannot move medical clearance from ${currentStatus} to ${nextStatus}. Allowed: ${
        allowedNextStatuses.length > 0 ? allowedNextStatuses.join(", ") : "none (terminal state)"
      }.`,
    );
  }
}
