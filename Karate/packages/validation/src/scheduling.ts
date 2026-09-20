import { z } from "zod";
import { uuidSchema } from "./academy";

export const scheduleIdParamsSchema = z.object({
  scheduleId: uuidSchema,
});
export type ScheduleIdParams = z.infer<typeof scheduleIdParamsSchema>;

const blockedPeriodSchema = z
  .object({ startAt: z.coerce.date(), endAt: z.coerce.date() })
  .refine((p) => p.endAt > p.startAt, { message: "endAt must be after startAt" });

export const generateScheduleSchema = z.object({
  startAt: z.coerce.date(),
  breakMinutesBetweenRounds: z.number().int().min(0).max(120).optional(),
  blockedPeriods: z.array(blockedPeriodSchema).max(20).optional(),
  force: z.boolean().optional(),
});
export type GenerateScheduleRequest = z.infer<typeof generateScheduleSchema>;

export const recordDelaySchema = z.object({
  tatamiId: uuidSchema,
  delayMinutes: z.number().int().min(1).max(480),
  reason: z.string().trim().max(500).optional(),
});
export type RecordDelayRequest = z.infer<typeof recordDelaySchema>;
