import { z } from "zod";
import { uuidSchema } from "./academy";

export const createKataDefinitionSchema = z.object({
  name: z.string().trim().min(1).max(200),
  styleNote: z.string().trim().max(200).optional(),
});
export type CreateKataDefinitionRequest = z.infer<typeof createKataDefinitionSchema>;

export const announceKataSchema = z.object({
  performerPlayerId: uuidSchema,
  kataDefinitionId: uuidSchema,
});
export type AnnounceKataRequest = z.infer<typeof announceKataSchema>;

export const submitJudgeEvaluationSchema = z.object({
  targetPlayerId: uuidSchema,
  score: z.number().min(0).max(10).optional(),
  isDisqualification: z.boolean().optional().default(false),
  /** Art. 3.5.4/5.4.3 — only valid for a Team medal performance's KataPerformance.bunkaiRequired; validated server-side. */
  phase: z.enum(["KATA", "BUNKAI"]).optional(),
  clientOperationId: uuidSchema,
});
export type SubmitJudgeEvaluationRequest = z.infer<typeof submitJudgeEvaluationSchema>;

export const correctJudgeEvaluationSchema = z.object({
  evaluationId: uuidSchema,
  score: z.number().min(0).max(10).optional(),
  isDisqualification: z.boolean().optional().default(false),
  clientOperationId: uuidSchema,
});
export type CorrectJudgeEvaluationRequest = z.infer<typeof correctJudgeEvaluationSchema>;

export const createKataTeamSchema = z.object({
  academyId: uuidSchema,
  competitionId: uuidSchema,
  name: z.string().trim().min(1).max(200),
});
export type CreateKataTeamRequest = z.infer<typeof createKataTeamSchema>;

export const teamIdParamsSchema = z.object({
  teamId: uuidSchema,
});

export const kataTeamMemberSchema = z.object({
  playerId: uuidSchema,
});
export type KataTeamMemberRequest = z.infer<typeof kataTeamMemberSchema>;

export const createTeamBoutSchema = z.object({
  redTeamId: uuidSchema,
  blueTeamId: uuidSchema,
  bunkaiRequired: z.boolean().optional().default(false),
});
export type CreateTeamBoutRequest = z.infer<typeof createTeamBoutSchema>;

export const seedOfficialKataListSchema = z.object({
  ruleSetVersionId: uuidSchema,
});
export type SeedOfficialKataListRequest = z.infer<typeof seedOfficialKataListSchema>;

export const finalizeKataResultSchema = z.object({
  kikenAgainstPlayerId: uuidSchema.optional(),
});
export type FinalizeKataResultRequest = z.infer<typeof finalizeKataResultSchema>;
