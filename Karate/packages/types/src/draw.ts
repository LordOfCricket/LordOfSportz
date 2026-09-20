export const BRACKET_TYPES = ["SINGLE_ELIMINATION", "ROUND_ROBIN", "POOL"] as const;
export type BracketType = (typeof BRACKET_TYPES)[number];

export const DRAW_STATUSES = ["DRAFT", "PUBLISHED", "LOCKED", "SUPERSEDED"] as const;
export type DrawStatus = (typeof DRAW_STATUSES)[number];

/** Enforced by apps/api/src/domain/drawLifecycle.ts. Re-drawing a LOCKED draw never transitions it in place — it goes to SUPERSEDED only via the explicit authorized re-draw path, which creates a brand new Draw version. */
export const DRAW_STATUS_TRANSITIONS: Record<DrawStatus, DrawStatus[]> = {
  DRAFT: ["PUBLISHED", "SUPERSEDED"],
  PUBLISHED: ["LOCKED", "SUPERSEDED"],
  LOCKED: ["SUPERSEDED"],
  SUPERSEDED: [],
};

export const SEED_SOURCES = ["MANUAL", "RANKING", "RANDOM", "NONE"] as const;
export type SeedSourceValue = (typeof SEED_SOURCES)[number];

export const BOUT_RESULT_METHODS = [
  "POINTS",
  "IPPON",
  "DECISION",
  "DISQUALIFICATION",
  "WITHDRAWAL",
  "WALKOVER",
  "DRAW",
  "NO_SHOW",
  "INJURY",
] as const;
export type BoutResultMethodValue = (typeof BOUT_RESULT_METHODS)[number];

/** RESUMED is not a persisted status — resuming returns a bout to IN_PROGRESS; see the Bout schema comment. */
export const BOUT_STATUSES = [
  "SCHEDULED",
  "CALLED",
  "READY",
  "IN_PROGRESS",
  "PAUSED",
  "FINISHED",
  "UNDER_REVIEW",
  "FINALIZED",
  "CANCELLED",
] as const;
export type BoutStatusValue = (typeof BOUT_STATUSES)[number];

/**
 * Enforced by apps/api/src/domain/boutLifecycle.ts. SCHEDULED->IN_PROGRESS is
 * kept as a direct shortcut (skipping the call/ready ceremony) alongside the
 * fuller path. FINISHED is reachable from every pre-finish state, not just
 * IN_PROGRESS, because walkover/no-show/injury/DQ/withdrawal outcomes can
 * legitimately end a bout before it was ever called, made ready, or started.
 */
export const BOUT_STATUS_TRANSITIONS: Record<BoutStatusValue, BoutStatusValue[]> = {
  SCHEDULED: ["CALLED", "IN_PROGRESS", "FINISHED", "CANCELLED"],
  CALLED: ["READY", "FINISHED", "CANCELLED"],
  READY: ["IN_PROGRESS", "FINISHED", "CANCELLED"],
  IN_PROGRESS: ["PAUSED", "FINISHED", "CANCELLED"],
  PAUSED: ["IN_PROGRESS", "FINISHED", "CANCELLED"],
  FINISHED: ["UNDER_REVIEW", "FINALIZED"],
  UNDER_REVIEW: ["FINALIZED", "FINISHED"],
  FINALIZED: [],
  CANCELLED: [],
};
