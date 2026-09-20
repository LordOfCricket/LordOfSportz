import { cookies } from "next/headers";
import { ACCESS_TOKEN_COOKIE_NAME } from "@karate/constants";
import { callBackend } from "./backend-client";

interface AcademySummary {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
}

export interface CoachProfile {
  id: string;
  displayName: string;
  bio: string | null;
  yearsActive: number | null;
  status: string;
  styles: { id: string; name: string }[];
}

export interface PlayerProfile {
  id: string;
  displayName: string;
  status: string;
  primaryStyle: { id: string; name: string } | null;
}

export interface ScorerProfile {
  id: string;
  displayName: string;
  certificationLevel: string | null;
  status: string;
  verificationStatus: string;
}

export interface MembershipRow {
  id: string;
  status: string;
  academy: AcademySummary;
  startedAt: string | null;
  endedAt: string | null;
}

export interface PendingRequestRow {
  id: string;
  academy: { id: string; name: string; slug: string };
  message: string | null;
  createdAt: string;
}

export interface MyAcademy {
  id: string;
  name: string;
  slug: string;
  status: string;
  adminRole: string;
  playerCount?: number;
  coachCount?: number;
}

export interface IncomingRequestRow {
  id: string;
  targetType: "PLAYER" | "COACH";
  message: string | null;
  createdAt: string;
  applicant: { id: string; displayName: string } | null;
}

function getAccessToken(): string | undefined {
  return cookies().get(ACCESS_TOKEN_COOKIE_NAME)?.value;
}

/** Every fetcher here fails soft (null/empty) rather than throwing — a missing profile or
 * empty list is a normal, renderable dashboard state, not an error. Auth failures are already
 * handled upstream by middleware + getCurrentUserOrRedirect. */
async function fetchOrNull<T>(path: string): Promise<T | null> {
  const accessToken = getAccessToken();
  if (!accessToken) return null;
  const result = await callBackend<T>(path, { accessToken });
  return result.body.success ? result.body.data : null;
}

async function fetchOrEmpty<T>(path: string): Promise<T[]> {
  return (await fetchOrNull<T[]>(path)) ?? [];
}

export const getCoachProfile = () => fetchOrNull<CoachProfile>("/api/v1/coaches/me");
export const getCoachAffiliations = () => fetchOrEmpty<MembershipRow>("/api/v1/coaches/me/affiliations");
export const getCoachPendingRequests = () => fetchOrEmpty<PendingRequestRow>("/api/v1/coaches/me/requests");

export const getPlayerProfile = () => fetchOrNull<PlayerProfile>("/api/v1/players/me");
export const getPlayerMemberships = () => fetchOrEmpty<MembershipRow>("/api/v1/players/me/memberships");
export const getPlayerPendingRequests = () => fetchOrEmpty<PendingRequestRow>("/api/v1/players/me/requests");

export const getScorerProfile = () => fetchOrNull<ScorerProfile>("/api/v1/scorers/me");

export const getMyAcademies = () => fetchOrEmpty<MyAcademy>("/api/v1/academies/mine");
export const getAcademyPendingRequests = (academyId: string) =>
  fetchOrEmpty<IncomingRequestRow>(`/api/v1/academies/${academyId}/membership-requests`);

export interface AcademySearchResult {
  id: string;
  name: string;
  city: string | null;
  countryCode: string | null;
}

export interface AcademyDetail {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  city: string | null;
  countryCode: string | null;
  status: string;
  playerCount: number;
  coachCount: number;
}

/** Public detail lookup — no access token required. */
export async function getAcademyById(academyId: string): Promise<AcademyDetail | null> {
  const result = await callBackend<AcademyDetail>(`/api/v1/academies/${academyId}`);
  return result.body.success ? result.body.data : null;
}

/** Public search — no access token required, matches the backend's unauthenticated GET /academies. */
export async function searchAcademies(query: string): Promise<AcademySearchResult[]> {
  if (!query.trim()) return [];
  const result = await callBackend<{ items: AcademySearchResult[] }>(
    `/api/v1/academies?q=${encodeURIComponent(query)}&pageSize=10`,
  );
  return result.body.success ? result.body.data.items : [];
}

// ---- Belt & grading domain ----

export interface BeltGradeRef {
  id: string;
  name: string;
  type: string;
  rankOrder: number;
  colorName: string | null;
  colorHex: string | null;
}

export interface CertificateRef {
  id: string;
  serialNumber: string;
  verificationCode: string;
  verificationStatus: string;
  issuedAt: string;
}

export interface BeltHistoryEntry {
  id: string;
  beltGrade: BeltGradeRef;
  verificationStatus: string;
  awardedDate: string;
  isCurrent: boolean;
  certificate: CertificateRef | null;
}

export interface BeltHistoryResponse {
  current: BeltHistoryEntry | null;
  history: BeltHistoryEntry[];
}

export const getMyBeltHistory = () => fetchOrNull<BeltHistoryResponse>("/api/v1/players/me/belt-history");

export interface PlayerResultRow {
  boutId: string;
  playerId: string;
  discipline: "KUMITE" | "KATA";
  opponent: { id: string; displayName: string } | null;
  side: "RED" | "BLUE";
  tournament: { id: string; name: string };
  result: { winnerPlayerId: string | null; method: string; finalScoreRed: number | null; finalScoreBlue: number | null; decidedAt: string };
  date: string | null;
}
export interface CoachResultRow {
  boutId: string;
  discipline: "KUMITE" | "KATA";
  redPlayer: { id: string; displayName: string } | null;
  bluePlayer: { id: string; displayName: string } | null;
  tournament: { id: string; name: string };
  result: { winnerPlayerId: string | null; method: string };
  date: string | null;
}

export interface PlayerStatsSummary {
  appearances: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  pointsScored: number;
  pointsConceded: number;
  tournamentsEntered: number;
  kumiteBouts: number;
  kataBouts: number;
  resultMethods: Record<string, number>;
}

export const getMyResults = () => fetchOrEmpty<PlayerResultRow>("/api/v1/players/me/results");
export const getMyStats = () => fetchOrNull<PlayerStatsSummary>("/api/v1/players/me/stats");
export const getCoachResults = () => fetchOrEmpty<CoachResultRow>("/api/v1/coaches/me/results");
export const getAcademyStats = (academyId: string) => fetchOrNull<{ playerCount: number; tournamentsParticipated: number; wins: number; losses: number; medalsWon: number }>(`/api/v1/academies/${academyId}/stats`);
export const getRankingCategories = () => fetchOrEmpty<{ id: string; label: string; rankingSeason: { rankingSystem: { name: string; discipline: string }; season: { name: string } } }>("/api/v1/rankings/categories");
export const getRanking = (categoryId: string) => fetchOrEmpty<{ rank: number; points: string; player: { displayName: string } }>(`/api/v1/rankings/${categoryId}`);
export const getTournamentResults = (tournamentId: string) => fetchOrEmpty<CoachResultRow>(`/api/v1/tournaments/${tournamentId}/results`);
export interface NotificationRow { id: string; type: string; title: string; body: string | null; isRead: boolean; createdAt: string; }
export const getNotifications = () => fetchOrEmpty<NotificationRow>("/api/v1/notifications");


export interface StudentGrade {
  playerId: string;
  displayName: string;
  currentGrade: { name: string; verificationStatus: string } | null;
}

export const getMyStudentsGrades = () => fetchOrEmpty<StudentGrade>("/api/v1/coaches/me/students-grades");

export interface BeltSystemRef {
  id: string;
  karateStyleId: string;
  name: string;
  description: string | null;
}

export async function getBeltSystems(): Promise<BeltSystemRef[]> {
  const result = await callBackend<BeltSystemRef[]>("/api/v1/grading/belt-systems");
  return result.body.success ? result.body.data : [];
}

export const getBeltGrades = async (beltSystemId: string): Promise<BeltGradeRef[]> => {
  const result = await callBackend<BeltGradeRef[]>(`/api/v1/grading/belt-systems/${beltSystemId}/grades`);
  return result.body.success ? result.body.data : [];
};

export interface GradingEventRow {
  id: string;
  name: string;
  beltSystemId: string;
  status: string;
  eventDate: string;
  location: string | null;
}

export const getAcademyGradingEvents = (academyId: string) =>
  fetchOrEmpty<GradingEventRow>(`/api/v1/academies/${academyId}/grading-events`);

export interface GradingParticipantRow {
  id: string;
  result: string;
  remarks: string | null;
  player: { id: string; displayName: string };
  previousGrade: { id: string; name: string; rankOrder: number } | null;
  targetGrade: { id: string; name: string; rankOrder: number };
}

export interface GradingEventDetail extends GradingEventRow {
  participants: GradingParticipantRow[];
}

export const getGradingEventDetail = (eventId: string) =>
  fetchOrNull<GradingEventDetail>(`/api/v1/grading-events/${eventId}`);

export const getAcademyActivePlayers = (academyId: string) =>
  fetchOrEmpty<{ id: string; displayName: string }>(`/api/v1/academies/${academyId}/players`);

export interface PendingVerificationRow {
  id: string;
  awardedDate: string;
  beltGrade: { name: string };
  player: { id: string; displayName: string };
}

export const getAcademyPendingVerifications = (academyId: string) =>
  fetchOrEmpty<PendingVerificationRow>(`/api/v1/academies/${academyId}/pending-verifications`);

// ---- Tournament registration domain ----

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

/** Public browse — no access token required, matches the backend's unauthenticated GET /tournaments. */
export async function listOpenTournaments(): Promise<TournamentSummary[]> {
  const result = await callBackend<{ items: TournamentSummary[] }>(
    "/api/v1/tournaments?status=REGISTRATION_OPEN&pageSize=50",
  );
  return result.body.success ? result.body.data.items : [];
}

export async function getTournamentDetail(tournamentId: string): Promise<TournamentDetail | null> {
  const result = await callBackend<TournamentDetail>(`/api/v1/tournaments/${tournamentId}`);
  return result.body.success ? result.body.data : null;
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

export interface WeighInAttemptRow {
  id: string;
  attemptNumber: number;
  measuredWeightKg: number | null;
  unit: string;
  status: string;
  reason: string | null;
  measuredAt: string;
}

export const getWeighInHistory = (registrationId: string) =>
  fetchOrEmpty<WeighInAttemptRow>(`/api/v1/registrations/${registrationId}/weigh-in`);

export const getMyRegistrations = () => fetchOrEmpty<RegistrationRow>("/api/v1/registrations/me");
export const getRegistration = (registrationId: string) =>
  fetchOrNull<RegistrationRow>(`/api/v1/registrations/${registrationId}`);
export const getMyStudentsRegistrations = () =>
  fetchOrEmpty<RegistrationRow>("/api/v1/coaches/me/students-registrations");
export const getAcademyRegistrations = (academyId: string) =>
  fetchOrEmpty<RegistrationRow>(`/api/v1/academies/${academyId}/registrations`);

// ---- Draw / bracket domain ----

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

export const getDraw = (competitionId: string) =>
  fetchOrNull<DrawDetail>(`/api/v1/competitions/${competitionId}/draw`);

// ---- Scheduling domain ----

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
  sequenceOrder?: number;
}
export interface ScheduleDetail {
  id: string;
  tournamentId: string;
  version: number;
  status: string;
  delayMinutes: number;
  generatedAt: string;
  entries: ScheduleEntryRow[];
}

export const getSchedule = (tournamentId: string) =>
  fetchOrNull<ScheduleDetail>(`/api/v1/tournaments/${tournamentId}/schedule`);
export const getMyUpcomingBouts = () => fetchOrEmpty<ScheduleEntryRow>("/api/v1/players/me/schedule");
export const getMyStudentsUpcomingBouts = () =>
  fetchOrEmpty<ScheduleEntryRow>("/api/v1/coaches/me/students-schedule");
export const getAcademyUpcomingBouts = (academyId: string) =>
  fetchOrEmpty<ScheduleEntryRow>(`/api/v1/academies/${academyId}/schedule`);

// ---- Tatami domain ----

export interface TatamiRow {
  id: string;
  tournamentId: string;
  label: string;
  status: string;
}

export const getTatamis = (tournamentId: string) =>
  fetchOrEmpty<TatamiRow>(`/api/v1/tournaments/${tournamentId}/tatamis`);

// ---- Official assignment domain ----

export interface OfficialAssignmentRow {
  id: string;
  tournamentId: string;
  competitionId: string | null;
  tatamiId: string | null;
  scorerProfileId: string;
  function: string;
  status: string;
  startAt: string | null;
  endAt: string | null;
  assignedAt: string;
  tournament?: { id: string; name: string; slug: string };
  tatami?: { id: string; label: string } | null;
  scorerProfile?: { id: string; displayName: string };
}

export const getMyAssignments = () => fetchOrEmpty<OfficialAssignmentRow>("/api/v1/scorers/me/assignments");
export const getTournamentAssignments = (tournamentId: string) =>
  fetchOrEmpty<OfficialAssignmentRow>(`/api/v1/tournaments/${tournamentId}/officials`);

// ---- Kumite live state (Phase 15) ----

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

export const getKumiteState = (boutId: string) => fetchOrNull<KumiteLiveState>(`/api/v1/bouts/${boutId}/kumite`);

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

export const getBout = (boutId: string) => fetchOrNull<BoutDetailRow>(`/api/v1/bouts/${boutId}`);

// ---- Kata live state (Phase 16) ----

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
  performance: {
    redKata: { id: string; name: string } | null;
    blueKata: { id: string; name: string } | null;
    bunkaiRequired: boolean;
  };
  evaluations: JudgeEvaluationRow[];
  votes: { officialAssignmentId: string; votedForPlayerId: string | null }[];
  redVotes: number;
  blueVotes: number;
}

export const getKataState = (boutId: string) => fetchOrNull<KataLiveState>(`/api/v1/bouts/${boutId}/kata`);
export const getKataDefinitions = (ruleSetVersionId: string) =>
  fetchOrEmpty<KataDefinitionRow>(`/api/v1/kata-definitions?ruleSetVersionId=${ruleSetVersionId}`);

// ---- Round-robin standings / Team Kata (Phase 16 closure) ----

export interface StandingRow {
  playerId: string;
  playerName?: string;
  victoryPoints: number;
  wins: number;
  totalVotesFor: number;
  totalVotesAgainst: number;
  rank: number;
  tieUnresolved: boolean;
}

export const getRoundRobinStandings = (drawId: string) =>
  fetchOrNull<{ drawId: string; standings: StandingRow[] }>(`/api/v1/draws/${drawId}/kata-standings`);

export interface KataTeamRow {
  id: string;
  name: string;
  status: string;
  academyId: string;
  competitionId: string;
  members: { player: { id: string; displayName: string } }[];
}

export const getKataTeams = (competitionId: string) =>
  fetchOrEmpty<KataTeamRow>(`/api/v1/kata-teams?competitionId=${competitionId}`);
