export const SCHEDULE_STATUSES = [
  "DRAFT",
  "PUBLISHED",
  "IN_PROGRESS",
  "DELAYED",
  "COMPLETED",
  "CANCELLED",
] as const;
export type ScheduleStatus = (typeof SCHEDULE_STATUSES)[number];

/** Enforced by apps/api/src/domain/scheduleLifecycle.ts. */
export const SCHEDULE_STATUS_TRANSITIONS: Record<ScheduleStatus, ScheduleStatus[]> = {
  DRAFT: ["PUBLISHED", "CANCELLED"],
  PUBLISHED: ["IN_PROGRESS", "DELAYED", "CANCELLED"],
  IN_PROGRESS: ["DELAYED", "COMPLETED", "CANCELLED"],
  DELAYED: ["IN_PROGRESS", "COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export const DEFAULT_BOUT_DURATION_MINUTES = 5;
