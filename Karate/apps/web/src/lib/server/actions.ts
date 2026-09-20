"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ACCESS_TOKEN_COOKIE_NAME } from "@karate/constants";
import { callBackend } from "./backend-client";

export interface ActionResult {
  success: boolean;
  message?: string;
}

function getAccessToken(): string | undefined {
  return cookies().get(ACCESS_TOKEN_COOKIE_NAME)?.value;
}

async function postAuthed(path: string, body: unknown): Promise<ActionResult> {
  const accessToken = getAccessToken();
  if (!accessToken) {
    return { success: false, message: "Your session has expired. Please sign in again." };
  }
  const result = await callBackend(path, { method: "POST", body, accessToken });
  return result.body.success ? { success: true } : { success: false, message: result.body.error.message };
}

export async function createPlayerProfileAction(input: {
  displayName: string;
  dateOfBirth: string;
  gender: "MALE" | "FEMALE";
}): Promise<ActionResult> {
  const result = await postAuthed("/api/v1/players/profile", input);
  if (result.success) revalidatePath("/dashboard/player");
  return result;
}

export async function createCoachProfileAction(input: { displayName: string }): Promise<ActionResult> {
  const result = await postAuthed("/api/v1/coaches/profile", input);
  if (result.success) revalidatePath("/dashboard/coach");
  return result;
}

export async function createScorerProfileAction(input: { displayName: string }): Promise<ActionResult> {
  const result = await postAuthed("/api/v1/scorers/profile", input);
  if (result.success) revalidatePath("/dashboard/scorer");
  return result;
}

export async function createAcademyAction(input: { name: string }): Promise<ActionResult> {
  const result = await postAuthed("/api/v1/academies", input);
  if (result.success) revalidatePath("/dashboard/academy");
  return result;
}

export async function requestToJoinAcademyAction(academyId: string): Promise<ActionResult> {
  const result = await postAuthed(`/api/v1/academies/${academyId}/membership-requests`, {});
  if (result.success) {
    revalidatePath("/dashboard/player");
    revalidatePath("/dashboard/coach");
  }
  return result;
}

export async function resolveMembershipRequestAction(
  academyId: string,
  requestId: string,
  action: "ACCEPT" | "REJECT",
): Promise<ActionResult> {
  const result = await postAuthed(`/api/v1/academies/${academyId}/membership-requests/resolve`, {
    requestId,
    action,
  });
  if (result.success) revalidatePath("/dashboard/academy");
  return result;
}

// ---- Belt & grading domain ----

export async function createGradingEventAction(
  academyId: string,
  input: { name: string; beltSystemId: string; eventDate: string },
): Promise<ActionResult> {
  const result = await postAuthed(`/api/v1/academies/${academyId}/grading-events`, input);
  if (result.success) revalidatePath("/dashboard/academy");
  return result;
}

export async function transitionGradingEventStatusAction(
  academyId: string,
  eventId: string,
  status: string,
): Promise<ActionResult> {
  const result = await postAuthed(`/api/v1/academies/${academyId}/grading-events/${eventId}/status`, {
    status,
  });
  if (result.success) revalidatePath("/dashboard/academy");
  return result;
}

export async function addGradingParticipantAction(
  academyId: string,
  eventId: string,
  input: { playerId: string; targetGradeId: string },
): Promise<ActionResult> {
  const result = await postAuthed(
    `/api/v1/academies/${academyId}/grading-events/${eventId}/participants`,
    input,
  );
  if (result.success) revalidatePath("/dashboard/academy");
  return result;
}

export async function recordGradingResultAction(
  academyId: string,
  eventId: string,
  participantId: string,
  result_: "PASS" | "FAIL" | "ABSENT" | "WITHHELD",
): Promise<ActionResult> {
  const result = await postAuthed(
    `/api/v1/academies/${academyId}/grading-events/${eventId}/participants/${participantId}/result`,
    { result: result_ },
  );
  if (result.success) revalidatePath("/dashboard/academy");
  return result;
}

// ---- Tournament registration ----

export async function createRegistrationAction(competitionId: string): Promise<ActionResult> {
  const result = await postAuthed("/api/v1/registrations", { competitionId });
  if (result.success) {
    revalidatePath("/dashboard/player/tournaments");
    revalidatePath("/dashboard/coach/tournaments");
    revalidatePath("/dashboard/academy/tournaments");
  }
  return result;
}

export async function withdrawRegistrationAction(registrationId: string): Promise<ActionResult> {
  const result = await postAuthed(`/api/v1/registrations/${registrationId}/withdraw`, {});
  if (result.success) {
    revalidatePath("/dashboard/player/tournaments");
    revalidatePath("/dashboard/coach/tournaments");
    revalidatePath("/dashboard/academy/tournaments");
  }
  return result;
}

export async function reevaluateEligibilityAction(registrationId: string): Promise<ActionResult> {
  const result = await postAuthed(`/api/v1/registrations/${registrationId}/eligibility/re-evaluate`, {});
  if (result.success) {
    revalidatePath("/dashboard/player/tournaments");
    revalidatePath("/dashboard/coach/tournaments");
    revalidatePath("/dashboard/academy/tournaments");
  }
  return result;
}

export async function verifyBeltHistoryAction(
  historyId: string,
  verificationStatus: "VERIFIED" | "REJECTED",
): Promise<ActionResult> {
  const result = await postAuthed(`/api/v1/grading/belt-history/${historyId}/verify`, { verificationStatus });
  if (result.success) revalidatePath("/dashboard/academy");
  return result;
}

// ---- Draw / bracket ----

export async function generateDrawAction(
  competitionId: string,
  input: {
    bracketType: "SINGLE_ELIMINATION" | "ROUND_ROBIN";
    seedingStrategy: "MANUAL" | "RANKING" | "RANDOM" | "NONE";
    force?: boolean;
  },
): Promise<ActionResult> {
  const result = await postAuthed(`/api/v1/competitions/${competitionId}/draw`, input);
  if (result.success) revalidatePath(`/dashboard/academy/bracket/${competitionId}`);
  return result;
}

export async function publishDrawAction(drawId: string, competitionId: string): Promise<ActionResult> {
  const result = await postAuthed(`/api/v1/draws/${drawId}/publish`, {});
  if (result.success) revalidatePath(`/dashboard/academy/bracket/${competitionId}`);
  return result;
}

export async function lockDrawAction(drawId: string, competitionId: string): Promise<ActionResult> {
  const result = await postAuthed(`/api/v1/draws/${drawId}/lock`, {});
  if (result.success) revalidatePath(`/dashboard/academy/bracket/${competitionId}`);
  return result;
}

// ---- Scheduling ----

export async function generateScheduleAction(
  tournamentId: string,
  input: { startAt: string; force?: boolean },
): Promise<ActionResult> {
  const result = await postAuthed(`/api/v1/tournaments/${tournamentId}/schedule`, input);
  if (result.success) revalidatePath(`/dashboard/academy/schedule/${tournamentId}`);
  return result;
}

export async function publishScheduleAction(scheduleId: string, tournamentId: string): Promise<ActionResult> {
  const result = await postAuthed(`/api/v1/schedules/${scheduleId}/publish`, {});
  if (result.success) revalidatePath(`/dashboard/academy/schedule/${tournamentId}`);
  return result;
}

export async function delayScheduleAction(
  scheduleId: string,
  tournamentId: string,
  input: { tatamiId: string; delayMinutes: number; reason?: string },
): Promise<ActionResult> {
  const result = await postAuthed(`/api/v1/schedules/${scheduleId}/delay`, input);
  if (result.success) revalidatePath(`/dashboard/academy/schedule/${tournamentId}`);
  return result;
}

// ---- Tatamis ----

export async function createTatamiAction(tournamentId: string, label: string): Promise<ActionResult> {
  const result = await postAuthed(`/api/v1/tournaments/${tournamentId}/tatamis`, { label });
  if (result.success) revalidatePath(`/dashboard/academy/schedule/${tournamentId}`);
  return result;
}

export async function transitionTatamiStatusAction(
  tatamiId: string,
  tournamentId: string,
  status: string,
): Promise<ActionResult> {
  const result = await postAuthed(`/api/v1/tatamis/${tatamiId}/status`, { status });
  if (result.success) revalidatePath(`/dashboard/academy/schedule/${tournamentId}`);
  return result;
}

// ---- Official assignments ----

export async function assignOfficialAction(
  tournamentId: string,
  input: { scorerProfileId: string; function: string; tatamiId?: string },
): Promise<ActionResult> {
  const result = await postAuthed(`/api/v1/tournaments/${tournamentId}/officials`, input);
  if (result.success) revalidatePath(`/dashboard/academy/schedule/${tournamentId}`);
  return result;
}

export async function transitionAssignmentStatusAction(
  assignmentId: string,
  tournamentId: string,
  status: string,
): Promise<ActionResult> {
  const result = await postAuthed(`/api/v1/official-assignments/${assignmentId}/status`, { status });
  if (result.success) revalidatePath(`/dashboard/academy/schedule/${tournamentId}`);
  return result;
}

// ---- Kumite (Phase 15) ----
// No revalidatePath here: the live bout page is client-polled (see KumiteLivePanel), not
// server-list-rendered, so results are returned directly to the caller instead.

interface ActionDataResult<T> extends ActionResult {
  data?: T;
}

async function postAuthedData<T>(path: string, body: unknown): Promise<ActionDataResult<T>> {
  const accessToken = getAccessToken();
  if (!accessToken) {
    return { success: false, message: "Your session has expired. Please sign in again." };
  }
  const result = await callBackend<T>(path, { method: "POST", body, accessToken });
  return result.body.success
    ? { success: true, data: result.body.data }
    : { success: false, message: result.body.error.message };
}

export async function submitKumiteScoreAction(boutId: string, input: unknown) {
  return postAuthedData(`/api/v1/bouts/${boutId}/kumite/score`, input);
}
export async function cancelKumiteScoreAction(boutId: string, input: unknown) {
  return postAuthedData(`/api/v1/bouts/${boutId}/kumite/score/cancel`, input);
}
export async function applyKumitePenaltyAction(boutId: string, input: unknown) {
  return postAuthedData(`/api/v1/bouts/${boutId}/kumite/penalty`, input);
}
export async function submitHanteiVotesAction(boutId: string, input: unknown) {
  return postAuthedData(`/api/v1/bouts/${boutId}/kumite/hantei`, input);
}
export async function finalizeKumiteResultAction(boutId: string, input: unknown) {
  return postAuthedData(`/api/v1/bouts/${boutId}/kumite/finalize`, input);
}
export async function startKumiteClockAction(boutId: string) {
  return postAuthedData(`/api/v1/bouts/${boutId}/kumite/clock/start`, {});
}
export async function pauseKumiteClockAction(boutId: string) {
  return postAuthedData(`/api/v1/bouts/${boutId}/kumite/clock/pause`, {});
}
export async function resumeKumiteClockAction(boutId: string) {
  return postAuthedData(`/api/v1/bouts/${boutId}/kumite/clock/resume`, {});
}
export async function requestVideoReviewAction(boutId: string, input: unknown) {
  return postAuthedData(`/api/v1/bouts/${boutId}/kumite/video-review`, input);
}
export async function decideVideoReviewAction(boutId: string, requestId: string, input: unknown) {
  return postAuthedData(`/api/v1/bouts/${boutId}/kumite/video-review/${requestId}/decide`, input);
}

// ---- Kata (Phase 16) ----

export async function announceKataAction(boutId: string, input: unknown) {
  return postAuthedData(`/api/v1/bouts/${boutId}/kata/announce`, input);
}
export async function submitJudgeEvaluationAction(boutId: string, input: unknown) {
  return postAuthedData(`/api/v1/bouts/${boutId}/kata/evaluations`, input);
}
export async function correctJudgeEvaluationAction(boutId: string, input: unknown) {
  return postAuthedData(`/api/v1/bouts/${boutId}/kata/evaluations/correct`, input);
}
export async function finalizeKataResultAction(boutId: string, input: unknown) {
  return postAuthedData(`/api/v1/bouts/${boutId}/kata/finalize`, input);
}

export async function createKataTeamAction(input: unknown): Promise<ActionResult> {
  const result = await postAuthed("/api/v1/kata-teams", input);
  if (result.success) revalidatePath("/dashboard/academy");
  return result;
}
export async function addKataTeamMemberAction(teamId: string, playerId: string): Promise<ActionResult> {
  const result = await postAuthed(`/api/v1/kata-teams/${teamId}/members`, { playerId });
  if (result.success) revalidatePath("/dashboard/academy");
  return result;
}
export async function removeKataTeamMemberAction(teamId: string, playerId: string): Promise<ActionResult> {
  const result = await postAuthed(`/api/v1/kata-teams/${teamId}/members/remove`, { playerId });
  if (result.success) revalidatePath("/dashboard/academy");
  return result;
}
export async function createTeamBoutAction(competitionId: string, input: unknown): Promise<ActionResult> {
  const result = await postAuthed(`/api/v1/competitions/${competitionId}/kata/team-bouts`, input);
  return result;
}
