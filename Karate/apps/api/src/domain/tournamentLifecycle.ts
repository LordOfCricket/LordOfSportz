import { TOURNAMENT_STATUS_TRANSITIONS, type TournamentStatus } from "@karate/types";
import { ConflictError } from "@karate/shared";

/**
 * The only place a tournament's status is allowed to change. Never let a
 * controller set `status` directly from client input — always route through
 * this function so every transition is validated against the state machine
 * and recorded in TournamentStatusHistory by the caller.
 */
export function assertValidTournamentTransition(
  currentStatus: TournamentStatus,
  nextStatus: TournamentStatus,
): void {
  const allowedNextStatuses = TOURNAMENT_STATUS_TRANSITIONS[currentStatus];
  if (!allowedNextStatuses.includes(nextStatus)) {
    throw new ConflictError(
      `Cannot move tournament from ${currentStatus} to ${nextStatus}. Allowed: ${
        allowedNextStatuses.length > 0 ? allowedNextStatuses.join(", ") : "none (terminal state)"
      }.`,
    );
  }
}
