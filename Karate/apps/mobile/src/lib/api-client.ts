import type { ApiResponse } from "@karate/types";
import type { LoginRequest, RegisterRequest } from "@karate/validation";
import { tokenStorage } from "./token-storage";

export const API_BASE_URL: string = (() => {
  const url = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (url) return url;
  if (__DEV__) return "http://localhost:4000";
  throw new Error("EXPO_PUBLIC_API_BASE_URL is required for non-development builds");
})();

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthUser {
  userId: string;
  email: string;
  fullName: string;
  roles: string[];
}

export interface CurrentUser extends AuthUser {
  status: string;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  withAuth?: boolean;
  /** Internal: set on the retry attempt so a failed refresh can't loop. Never pass this explicitly. */
  skipRefresh?: boolean;
}

/**
 * Refresh is shared across concurrent callers via one in-flight promise —
 * five screens hitting an expired access token at once triggers one
 * rotation, not five (which would otherwise race and only one could win,
 * per the backend's single-use rotation).
 */
let refreshInFlight: Promise<boolean> | null = null;

async function performRefresh(): Promise<boolean> {
  const refreshToken = await tokenStorage.getRefreshToken();
  if (!refreshToken) return false;

  try {
    const result = await request<AuthUser & AuthTokens>("/api/v1/auth/refresh", {
      method: "POST",
      body: { refreshToken },
    });
    await tokenStorage.save(result.accessToken, result.refreshToken);
    return true;
  } catch {
    // Expired, revoked, or reuse-detected — none of these are recoverable client-side.
    await tokenStorage.clear();
    return false;
  }
}

function refreshOnce(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = performRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function request<T>(path: string, init: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (init.withAuth) {
    const token = await tokenStorage.getAccessToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiRequestError("Unable to reach the server. Check your connection.", 0);
  }

  const payload = (await res.json()) as ApiResponse<T>;
  if (!payload.success) {
    if (res.status === 401 && init.withAuth && !init.skipRefresh) {
      const refreshed = await refreshOnce();
      if (refreshed) {
        return request<T>(path, { ...init, skipRefresh: true });
      }
    }
    throw new ApiRequestError(payload.error.message, res.status);
  }
  return payload.data;
}

/** Returns null on any failure (typically 404 "no profile yet") instead of throwing — a normal, renderable screen state. */
async function requestOrNull<T>(path: string, init: RequestOptions = {}): Promise<T | null> {
  try {
    return await request<T>(path, init);
  } catch {
    return null;
  }
}

export interface KarateStyleRef {
  id: string;
  name: string;
}
export interface PlayerProfile {
  id: string;
  displayName: string;
  status: string;
  primaryStyle: KarateStyleRef | null;
}
export interface CoachProfile {
  id: string;
  displayName: string;
  status: string;
  yearsActive: number | null;
}
export interface ScorerProfile {
  id: string;
  displayName: string;
  status: string;
  verificationStatus: string;
  certificationLevel: string | null;
}
export interface AcademySummary {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
}
export interface MembershipRow {
  id: string;
  status: string;
  academy: AcademySummary;
  startedAt: string | null;
}
export interface PendingRequestRow {
  id: string;
  academy: { id: string; name: string; slug: string };
  createdAt: string;
}
export interface IncomingRequestRow {
  id: string;
  targetType: "PLAYER" | "COACH";
  createdAt: string;
  applicant: { id: string; displayName: string } | null;
}
export interface AcademyDetail extends AcademySummary {
  status: string;
  playerCount: number;
  coachCount: number;
}
export interface MyAcademy extends AcademySummary {
  status: string;
  adminRole: string;
}

export interface BeltGradeRef {
  id: string;
  name: string;
  type: string;
  rankOrder: number;
}
export interface BeltHistoryEntry {
  id: string;
  beltGrade: BeltGradeRef;
  verificationStatus: string;
  awardedDate: string;
  isCurrent: boolean;
}
export interface BeltHistoryResponse {
  current: BeltHistoryEntry | null;
  history: BeltHistoryEntry[];
}
export interface StudentGrade {
  playerId: string;
  displayName: string;
  currentGrade: { name: string; verificationStatus: string } | null;
}
export interface GradingEventRow {
  id: string;
  name: string;
  status: string;
  eventDate: string;
}

export interface TournamentSummary {
  id: string;
  name: string;
  slug: string;
  venue: string | null;
  countryCode: string | null;
  status: string;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
  startDate: string | null;
  endDate: string | null;
}
export interface CategoryRef {
  id: string;
  name: string;
  genderRestriction: string;
  ageMin: number | null;
  ageMax: number | null;
  weightMinKg: string | null;
  weightMaxKg: string | null;
}
export interface CompetitionRef {
  id: string;
  discipline: string;
  name: string;
  category: CategoryRef;
}
export interface TournamentDetail extends TournamentSummary {
  description: string | null;
  competitions: CompetitionRef[];
}
export interface RegistrationRow {
  id: string;
  status: string;
  submittedAt: string;
  updatedAt: string;
  player: { id: string; displayName: string };
  representingAcademy: { id: string; name: string; slug: string } | null;
  beltGradeAtRegistration: { id: string; name: string; type: string; rankOrder: number } | null;
  eligibility: { status: string; reasonCodes: string[] };
  medical: { status: string; expiresAt: string | null; isValid: boolean };
  weighIn: { status: string; measuredWeightKg: number | null; measuredAt: string | null };
  readiness: { status: "READY" | "NOT_READY"; blockedBy: string[] };
  competition: {
    id: string;
    discipline: string;
    name: string;
    tournament: { id: string; name: string; slug: string; status: string };
    category: CategoryRef;
  };
}

export interface DrawSeedRow {
  registrationId: string;
  playerId: string;
  displayName: string;
  seedNumber: number | null;
  seedSource: string;
  position: number;
}
export interface DrawBoutRow {
  id: string;
  sequenceNumber: number;
  redPlayerId: string | null;
  redPlayerName: string | null;
  bluePlayerId: string | null;
  bluePlayerName: string | null;
  isBye: boolean;
  status: string;
}
export interface DrawRoundRow {
  id: string;
  roundNumber: number;
  name: string | null;
  bouts: DrawBoutRow[];
}
export interface DrawDetail {
  id: string;
  competitionId: string;
  version: number;
  bracketType: string;
  status: string;
  seedingStrategy: string;
  generatedAt: string;
  seeds: DrawSeedRow[];
  rounds: DrawRoundRow[];
}

export interface ScheduleEntryRow {
  id: string;
  boutId: string;
  competitionId: string;
  discipline: string;
  roundNumber: number;
  roundName: string | null;
  redPlayerId: string | null;
  redPlayerName: string | null;
  bluePlayerId: string | null;
  bluePlayerName: string | null;
  boutStatus: string;
  tatami: { id: string; label: string } | null;
  scheduledAt: string;
  estimatedDurationMinutes: number;
}

export interface OfficialAssignmentRow {
  id: string;
  tournamentId: string;
  tatamiId: string | null;
  function: string;
  status: string;
  startAt: string | null;
  endAt: string | null;
  tournament?: { id: string; name: string; slug: string };
  tatami?: { id: string; label: string } | null;
}

export interface KumiteScoreState {
  redScore: number;
  blueScore: number;
  redIppon: number;
  redWazaAri: number;
  redYuko: number;
  blueIppon: number;
  blueWazaAri: number;
  blueYuko: number;
  senshu: "RED" | "BLUE" | null;
  redPenalties: string[];
  bluePenalties: string[];
  clearLeadReached: "RED" | "BLUE" | null;
}
export interface KumiteEventRow {
  id: string;
  eventType: string;
  targetPlayerId: string | null;
  points: number | null;
  reversesEventId: string | null;
  recordedAt: string;
}
export interface VideoReviewRequestRow {
  id: string;
  requestedForPlayerId: string;
  requestedScoreType: string | null;
  status: "REQUESTED" | "UPHELD" | "REJECTED" | "UNVIEWABLE";
  decisionNotes: string | null;
  requestedAt: string;
  decidedAt: string | null;
}
export interface KumiteLiveState {
  boutId: string;
  status: string;
  redPlayerId: string | null;
  bluePlayerId: string | null;
  state: KumiteScoreState | null;
  config: { twoJudgeMode: boolean; videoReviewEnabled: boolean };
  myOfficialFunction: string | null;
  panelOfficials: { id: string; function: string; displayName: string }[];
  clock: { durationSeconds: number; elapsedSeconds: number; remainingSeconds: number; running: boolean };
  events: KumiteEventRow[];
  videoReviewRequests: VideoReviewRequestRow[];
}
export interface KataDefinitionRow {
  id: string;
  name: string;
  styleNote: string | null;
}
export interface JudgeEvaluationRow {
  id: string;
  officialAssignmentId: string;
  targetPlayerId: string | null;
  targetTeamId: string | null;
  phase: "KATA" | "BUNKAI";
  score: number | null;
  isDisqualification: boolean;
  correctionOfId: string | null;
  recordedAt: string;
}
export interface KataLiveState {
  boutId: string;
  status: string;
  redPlayerId: string | null;
  bluePlayerId: string | null;
  redTeam: { id: string; name: string } | null;
  blueTeam: { id: string; name: string } | null;
  ruleSetVersionId: string | null;
  config: { scoreMin: number; scoreMax: number; scoreIncrement: number };
  myOfficialFunction: string | null;
  myOfficialAssignmentId: string | null;
  canManage: boolean;
  panelOfficials: { id: string; displayName: string }[];
  performance: { redKata: { id: string; name: string } | null; blueKata: { id: string; name: string } | null; bunkaiRequired: boolean };
  evaluations: JudgeEvaluationRow[];
  votes: { officialAssignmentId: string; votedForPlayerId: string | null }[];
  redVotes: number;
  blueVotes: number;
}

export interface BoutDetailRow {
  id: string;
  status: string;
  redPlayer: { id: string; displayName: string } | null;
  bluePlayer: { id: string; displayName: string } | null;
  redTeam: { id: string; name: string } | null;
  blueTeam: { id: string; name: string } | null;
  tatami: { id: string; label: string } | null;
  roundName: string | null;
  roundNumber: number;
}

export interface PlayerResultRow {
  boutId: string;
  playerId: string;
  discipline: "KUMITE" | "KATA";
  opponent: { id: string; displayName: string } | null;
  tournament: { id: string; name: string };
  result: { winnerPlayerId: string | null; method: string; finalScoreRed: number | null; finalScoreBlue: number | null; decidedAt: string };
  date: string | null;
}

export interface PlayerStatsSummary {
  appearances: number; wins: number; losses: number; draws: number; winRate: number;
  pointsScored: number; pointsConceded: number; tournamentsEntered: number; kumiteBouts: number; kataBouts: number;
}

export interface RankingCategoryRow { id: string; label: string; rankingSeason: { rankingSystem: { name: string; discipline: string }; season: { name: string } } }
export interface RankingRow { rank: number; points: string; player: { id: string; displayName: string } }
export interface NotificationRow { id: string; type: string; title: string; body: string | null; isRead: boolean; createdAt: string }

/** Exposed so lib/realtime-client.ts can force a refresh before a reconnect attempt when the socket handshake itself is what discovers an expired access token (no concurrent HTTP call to trigger the usual 401 recovery path). */
export const ensureFreshAccessToken = refreshOnce;

/** Same backend contracts as web — no auth logic is reimplemented here, only transported. */
export const apiClient = {
  register: (input: RegisterRequest) =>
    request<AuthUser & AuthTokens>("/api/v1/auth/register", { method: "POST", body: input }),
  login: (input: LoginRequest) =>
    request<AuthUser & AuthTokens>("/api/v1/auth/login", { method: "POST", body: input }),
  me: () => request<CurrentUser>("/api/v1/auth/me", { withAuth: true }),
  logout: (refreshToken: string) =>
    request<{ loggedOut: true }>("/api/v1/auth/logout", { method: "POST", body: { refreshToken } }),

  getPlayerProfile: () => requestOrNull<PlayerProfile>("/api/v1/players/me", { withAuth: true }),
  createPlayerProfile: (input: { displayName: string; dateOfBirth: string; gender: "MALE" | "FEMALE" }) =>
    request<PlayerProfile>("/api/v1/players/profile", { method: "POST", body: input, withAuth: true }),
  getPlayerMemberships: () =>
    request<MembershipRow[]>("/api/v1/players/me/memberships", { withAuth: true }).catch(() => []),
  getPlayerPendingRequests: () =>
    request<PendingRequestRow[]>("/api/v1/players/me/requests", { withAuth: true }).catch(() => []),

  getCoachProfile: () => requestOrNull<CoachProfile>("/api/v1/coaches/me", { withAuth: true }),
  createCoachProfile: (input: { displayName: string }) =>
    request<CoachProfile>("/api/v1/coaches/profile", { method: "POST", body: input, withAuth: true }),
  getCoachAffiliations: () =>
    request<MembershipRow[]>("/api/v1/coaches/me/affiliations", { withAuth: true }).catch(() => []),
  getCoachPendingRequests: () =>
    request<PendingRequestRow[]>("/api/v1/coaches/me/requests", { withAuth: true }).catch(() => []),

  getScorerProfile: () => requestOrNull<ScorerProfile>("/api/v1/scorers/me", { withAuth: true }),
  createScorerProfile: (input: { displayName: string }) =>
    request<ScorerProfile>("/api/v1/scorers/profile", { method: "POST", body: input, withAuth: true }),

  getMyAcademies: () => request<MyAcademy[]>("/api/v1/academies/mine", { withAuth: true }).catch(() => []),
  getAcademyPendingRequests: (academyId: string) =>
    request<IncomingRequestRow[]>(`/api/v1/academies/${academyId}/membership-requests`, {
      withAuth: true,
    }).catch(() => []),
  getAcademyDetail: (academyId: string) => requestOrNull<AcademyDetail>(`/api/v1/academies/${academyId}`),
  createAcademy: (input: { name: string }) =>
    request<AcademySummary>("/api/v1/academies", { method: "POST", body: input, withAuth: true }),
  searchAcademies: (q: string) =>
    request<{ items: AcademySummary[] }>(`/api/v1/academies?q=${encodeURIComponent(q)}&pageSize=10`).then(
      (r) => r.items,
    ),
  requestToJoinAcademy: (academyId: string) =>
    request<{ id: string }>(`/api/v1/academies/${academyId}/membership-requests`, {
      method: "POST",
      body: {},
      withAuth: true,
    }),
  resolveMembershipRequest: (academyId: string, requestId: string, action: "ACCEPT" | "REJECT") =>
    request<{ membership: unknown }>(`/api/v1/academies/${academyId}/membership-requests/resolve`, {
      method: "POST",
      body: { requestId, action },
      withAuth: true,
    }),

  getMyBeltHistory: () =>
    requestOrNull<BeltHistoryResponse>("/api/v1/players/me/belt-history", { withAuth: true }),
  getMyStudentsGrades: () =>
    request<StudentGrade[]>("/api/v1/coaches/me/students-grades", { withAuth: true }).catch(() => []),
  getAcademyGradingEvents: (academyId: string) =>
    request<GradingEventRow[]>(`/api/v1/academies/${academyId}/grading-events`, { withAuth: true }).catch(
      () => [],
    ),

  listOpenTournaments: () =>
    request<{ items: TournamentSummary[] }>("/api/v1/tournaments?status=REGISTRATION_OPEN&pageSize=50")
      .then((r) => r.items)
      .catch(() => []),
  getMyResults: () => request<PlayerResultRow[]>("/api/v1/players/me/results", { withAuth: true }).catch(() => []),
  getMyStats: () => requestOrNull<PlayerStatsSummary>("/api/v1/players/me/stats", { withAuth: true }),
  getRankingCategories: () => request<RankingCategoryRow[]>("/api/v1/rankings/categories").catch(() => []),
  getRanking: (categoryId: string) => request<RankingRow[]>(`/api/v1/rankings/${categoryId}`).catch(() => []),
  getNotifications: () => request<NotificationRow[]>("/api/v1/notifications", { withAuth: true }).catch(() => []),
  markNotificationRead: (id: string) => request(`/api/v1/notifications/${id}/read`, { method: "POST", withAuth: true }),
  getTournamentDetail: (tournamentId: string) =>
    requestOrNull<TournamentDetail>(`/api/v1/tournaments/${tournamentId}`),
  createRegistration: (competitionId: string) =>
    request<RegistrationRow>("/api/v1/registrations", {
      method: "POST",
      body: { competitionId },
      withAuth: true,
    }),
  withdrawRegistration: (registrationId: string) =>
    request<RegistrationRow>(`/api/v1/registrations/${registrationId}/withdraw`, {
      method: "POST",
      withAuth: true,
    }),
  reevaluateEligibility: (registrationId: string) =>
    request<{ status: string; reasonCodes: string[] }>(
      `/api/v1/registrations/${registrationId}/eligibility/re-evaluate`,
      { method: "POST", withAuth: true },
    ),
  getMyRegistrations: () =>
    request<RegistrationRow[]>("/api/v1/registrations/me", { withAuth: true }).catch(() => []),
  getMyStudentsRegistrations: () =>
    request<RegistrationRow[]>("/api/v1/coaches/me/students-registrations", { withAuth: true }).catch(
      () => [],
    ),
  getAcademyRegistrations: (academyId: string) =>
    request<RegistrationRow[]>(`/api/v1/academies/${academyId}/registrations`, { withAuth: true }).catch(
      () => [],
    ),

  getDraw: (competitionId: string) => requestOrNull<DrawDetail>(`/api/v1/competitions/${competitionId}/draw`),
  generateDraw: (
    competitionId: string,
    input: {
      bracketType: "SINGLE_ELIMINATION" | "ROUND_ROBIN";
      seedingStrategy: "MANUAL" | "RANKING" | "RANDOM" | "NONE";
      force?: boolean;
    },
  ) =>
    request<DrawDetail>(`/api/v1/competitions/${competitionId}/draw`, {
      method: "POST",
      body: input,
      withAuth: true,
    }),
  publishDraw: (drawId: string) =>
    request<DrawDetail>(`/api/v1/draws/${drawId}/publish`, { method: "POST", withAuth: true }),
  lockDraw: (drawId: string) =>
    request<DrawDetail>(`/api/v1/draws/${drawId}/lock`, { method: "POST", withAuth: true }),

  getMyUpcomingBouts: () =>
    request<ScheduleEntryRow[]>("/api/v1/players/me/schedule", { withAuth: true }).catch(() => []),
  getMyStudentsUpcomingBouts: () =>
    request<ScheduleEntryRow[]>("/api/v1/coaches/me/students-schedule", { withAuth: true }).catch(() => []),
  getAcademyUpcomingBouts: (academyId: string) =>
    request<ScheduleEntryRow[]>(`/api/v1/academies/${academyId}/schedule`, { withAuth: true }).catch(
      () => [],
    ),

  getMyAssignments: () =>
    request<OfficialAssignmentRow[]>("/api/v1/scorers/me/assignments", { withAuth: true }).catch(() => []),

  getBout: (boutId: string) => requestOrNull<BoutDetailRow>(`/api/v1/bouts/${boutId}`, { withAuth: true }),
  getKumiteState: (boutId: string) =>
    requestOrNull<KumiteLiveState>(`/api/v1/bouts/${boutId}/kumite`, { withAuth: true }),
  submitKumiteScore: (
    boutId: string,
    input: { signals: { officialAssignmentId: string; targetPlayerId: string; scoreType: string }[]; clientOperationId: string },
  ) => request<KumiteLiveState>(`/api/v1/bouts/${boutId}/kumite/score`, { method: "POST", body: input, withAuth: true }),
  cancelKumiteScore: (boutId: string, input: { eventId: string; clientOperationId: string }) =>
    request<KumiteLiveState>(`/api/v1/bouts/${boutId}/kumite/score/cancel`, {
      method: "POST",
      body: input,
      withAuth: true,
    }),
  applyKumitePenalty: (
    boutId: string,
    input: { targetPlayerId: string; penaltyType: string; reasonCode: string; clientOperationId: string },
  ) => request<KumiteLiveState>(`/api/v1/bouts/${boutId}/kumite/penalty`, { method: "POST", body: input, withAuth: true }),
  submitHanteiVotes: (
    boutId: string,
    input: { votes: { officialAssignmentId: string; votedForPlayerId: string }[]; clientOperationId: string },
  ) => request<KumiteLiveState>(`/api/v1/bouts/${boutId}/kumite/hantei`, { method: "POST", body: input, withAuth: true }),
  finalizeKumiteResult: (
    boutId: string,
    input: { disqualifiedPlayerId?: string; disqualificationType?: string; allowDraw?: boolean },
  ) =>
    request<{ status: string; result: unknown }>(`/api/v1/bouts/${boutId}/kumite/finalize`, {
      method: "POST",
      body: input,
      withAuth: true,
    }),
  startKumiteClock: (boutId: string) =>
    request<KumiteLiveState>(`/api/v1/bouts/${boutId}/kumite/clock/start`, { method: "POST", withAuth: true }),
  pauseKumiteClock: (boutId: string) =>
    request<KumiteLiveState>(`/api/v1/bouts/${boutId}/kumite/clock/pause`, { method: "POST", withAuth: true }),
  resumeKumiteClock: (boutId: string) =>
    request<KumiteLiveState>(`/api/v1/bouts/${boutId}/kumite/clock/resume`, { method: "POST", withAuth: true }),
  requestVideoReview: (boutId: string, input: { requestedForPlayerId: string; requestedScoreType?: string }) =>
    request<KumiteLiveState>(`/api/v1/bouts/${boutId}/kumite/video-review`, {
      method: "POST",
      body: input,
      withAuth: true,
    }),
  decideVideoReview: (
    boutId: string,
    requestId: string,
    input: { status: string; awardedScoreType?: string; decisionNotes?: string; clientOperationId: string },
  ) =>
    request<KumiteLiveState>(`/api/v1/bouts/${boutId}/kumite/video-review/${requestId}/decide`, {
      method: "POST",
      body: input,
      withAuth: true,
    }),

  getKataState: (boutId: string) => requestOrNull<KataLiveState>(`/api/v1/bouts/${boutId}/kata`, { withAuth: true }),
  getKataDefinitions: (ruleSetVersionId: string) =>
    request<KataDefinitionRow[]>(`/api/v1/kata-definitions?ruleSetVersionId=${ruleSetVersionId}`, { withAuth: true }).catch(() => []),
  announceKata: (boutId: string, input: { performerPlayerId: string; kataDefinitionId: string }) =>
    request<KataLiveState>(`/api/v1/bouts/${boutId}/kata/announce`, { method: "POST", body: input, withAuth: true }),
  submitJudgeEvaluation: (
    boutId: string,
    input: { targetPlayerId: string; score?: number; isDisqualification?: boolean; phase?: "KATA" | "BUNKAI"; clientOperationId: string },
  ) => request<KataLiveState>(`/api/v1/bouts/${boutId}/kata/evaluations`, { method: "POST", body: input, withAuth: true }),
  correctJudgeEvaluation: (
    boutId: string,
    input: { evaluationId: string; score?: number; isDisqualification?: boolean; clientOperationId: string },
  ) =>
    request<KataLiveState>(`/api/v1/bouts/${boutId}/kata/evaluations/correct`, {
      method: "POST",
      body: input,
      withAuth: true,
    }),
  finalizeKataResult: (boutId: string, input: { kikenAgainstPlayerId?: string }) =>
    request<{ status: string; result: unknown }>(`/api/v1/bouts/${boutId}/kata/finalize`, {
      method: "POST",
      body: input,
      withAuth: true,
    }),
};
