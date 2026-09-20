import { z } from "zod";
import { TATAMI_STATUSES } from "@karate/types";
import { uuidSchema } from "./academy";

export const tatamiIdParamsSchema = z.object({
  tatamiId: uuidSchema,
});
export type TatamiIdParams = z.infer<typeof tatamiIdParamsSchema>;

export const boutIdParamsSchema = z.object({
  boutId: uuidSchema,
});
export type BoutIdParams = z.infer<typeof boutIdParamsSchema>;

export const createTatamiSchema = z.object({
  label: z.string().trim().min(1).max(100),
});
export type CreateTatamiRequest = z.infer<typeof createTatamiSchema>;

/** Any status value is syntactically accepted here — the actual allowed transitions are enforced server-side by tatamiLifecycle.ts, never by this schema. */
export const transitionTatamiStatusSchema = z.object({
  status: z.enum(TATAMI_STATUSES),
});
export type TransitionTatamiStatusRequest = z.infer<typeof transitionTatamiStatusSchema>;
