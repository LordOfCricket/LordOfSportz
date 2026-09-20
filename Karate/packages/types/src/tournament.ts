export const TOURNAMENT_STATUSES = [
  "DRAFT",
  "PUBLISHED",
  "REGISTRATION_OPEN",
  "REGISTRATION_CLOSED",
  "VERIFICATION",
  "WEIGH_IN",
  "DRAW_GENERATED",
  "SCHEDULED",
  "LIVE",
  "COMPLETED",
  "RESULTS_FINALIZED",
  "ARCHIVED",
] as const;
export type TournamentStatus = (typeof TOURNAMENT_STATUSES)[number];

/**
 * Valid forward transitions. Enforced in apps/api's tournament domain
 * service — never trust a status value sent directly by a client.
 * Mirrors docs/architecture/tournament-lifecycle.md.
 */
export const TOURNAMENT_STATUS_TRANSITIONS: Record<TournamentStatus, TournamentStatus[]> = {
  DRAFT: ["PUBLISHED"],
  PUBLISHED: ["REGISTRATION_OPEN"],
  REGISTRATION_OPEN: ["REGISTRATION_CLOSED"],
  REGISTRATION_CLOSED: ["VERIFICATION"],
  VERIFICATION: ["WEIGH_IN"],
  WEIGH_IN: ["DRAW_GENERATED"],
  DRAW_GENERATED: ["SCHEDULED"],
  SCHEDULED: ["LIVE"],
  LIVE: ["COMPLETED"],
  COMPLETED: ["RESULTS_FINALIZED"],
  RESULTS_FINALIZED: ["ARCHIVED"],
  ARCHIVED: [],
};

export const DISCIPLINES = ["KUMITE", "KATA"] as const;
export type Discipline = (typeof DISCIPLINES)[number];

export const ORGANIZER_TYPES = ["ACADEMY", "FEDERATION", "ASSOCIATION", "OTHER"] as const;
export type OrganizerType = (typeof ORGANIZER_TYPES)[number];
