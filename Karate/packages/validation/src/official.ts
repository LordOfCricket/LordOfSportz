import { z } from "zod";
import { OFFICIAL_FUNCTIONS } from "@karate/types";
import { uuidSchema } from "./academy";

export const assignmentIdParamsSchema = z.object({
  assignmentId: uuidSchema,
});
export type AssignmentIdParams = z.infer<typeof assignmentIdParamsSchema>;

export const assignOfficialSchema = z.object({
  scorerProfileId: uuidSchema,
  function: z.enum(OFFICIAL_FUNCTIONS),
  tatamiId: uuidSchema.optional(),
  competitionId: uuidSchema.optional(),
  startAt: z.coerce.date().optional(),
  endAt: z.coerce.date().optional(),
  force: z.boolean().optional(),
});
export type AssignOfficialRequest = z.infer<typeof assignOfficialSchema>;

export const transitionAssignmentStatusSchema = z.object({
  status: z.enum(["CONFIRMED", "DECLINED", "COMPLETED", "REVOKED"]),
});
export type TransitionAssignmentStatusRequest = z.infer<typeof transitionAssignmentStatusSchema>;
