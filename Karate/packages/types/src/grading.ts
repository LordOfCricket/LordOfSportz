export const GRADING_EVENT_STATUSES = [
  "DRAFT",
  "SCHEDULED",
  "OPEN",
  "IN_PROGRESS",
  "COMPLETED",
  "FINALIZED",
  "CANCELLED",
] as const;
export type GradingEventStatus = (typeof GRADING_EVENT_STATUSES)[number];

/** Mirrors docs/architecture tournament-lifecycle pattern: strictly linear, enforced server-side only. */
export const GRADING_EVENT_STATUS_TRANSITIONS: Record<GradingEventStatus, GradingEventStatus[]> = {
  DRAFT: ["SCHEDULED", "CANCELLED"],
  SCHEDULED: ["OPEN", "CANCELLED"],
  OPEN: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: ["FINALIZED"],
  FINALIZED: [],
  CANCELLED: [],
};

export const GRADING_RESULTS = ["PENDING", "PASS", "FAIL", "ABSENT", "WITHHELD"] as const;
export type GradingResult = (typeof GRADING_RESULTS)[number];
