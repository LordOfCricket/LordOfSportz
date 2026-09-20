import { z } from "zod";
import { KUMITE_SCORE_TYPES, KUMITE_PENALTY_TYPES, PROHIBITED_BEHAVIOUR_CODES } from "@karate/types";
import { uuidSchema } from "./academy";

const judgeSignalSchema = z.object({
  officialAssignmentId: uuidSchema,
  targetPlayerId: uuidSchema,
  scoreType: z.enum(KUMITE_SCORE_TYPES),
});

export const submitKumiteScoreSchema = z.object({
  signals: z.array(judgeSignalSchema).min(2).max(8),
  clientOperationId: uuidSchema,
});
export type SubmitKumiteScoreRequest = z.infer<typeof submitKumiteScoreSchema>;

export const cancelKumiteScoreSchema = z.object({
  eventId: uuidSchema,
  clientOperationId: uuidSchema,
});
export type CancelKumiteScoreRequest = z.infer<typeof cancelKumiteScoreSchema>;

export const applyKumitePenaltySchema = z.object({
  targetPlayerId: uuidSchema,
  penaltyType: z.enum(KUMITE_PENALTY_TYPES),
  reasonCode: z.enum(PROHIBITED_BEHAVIOUR_CODES),
  clientOperationId: uuidSchema,
});
export type ApplyKumitePenaltyRequest = z.infer<typeof applyKumitePenaltySchema>;

export const submitHanteiVotesSchema = z.object({
  votes: z
    .array(
      z.object({
        officialAssignmentId: uuidSchema,
        votedForPlayerId: uuidSchema,
      }),
    )
    .min(1)
    .max(5),
  clientOperationId: uuidSchema,
});
export type SubmitHanteiVotesRequest = z.infer<typeof submitHanteiVotesSchema>;

export const requestVideoReviewSchema = z.object({
  requestedForPlayerId: uuidSchema,
  requestedScoreType: z.enum(KUMITE_SCORE_TYPES).optional(),
});
export type RequestVideoReviewRequest = z.infer<typeof requestVideoReviewSchema>;

export const decideVideoReviewSchema = z.object({
  status: z.enum(["UPHELD", "REJECTED", "UNVIEWABLE"]),
  awardedScoreType: z.enum(KUMITE_SCORE_TYPES).optional(),
  decisionNotes: z.string().trim().max(500).optional(),
  clientOperationId: uuidSchema,
});
export type DecideVideoReviewRequest = z.infer<typeof decideVideoReviewSchema>;

export const videoReviewIdParamsSchema = z.object({
  boutId: uuidSchema,
  requestId: uuidSchema,
});

export const finalizeKumiteResultSchema = z.object({
  disqualifiedPlayerId: uuidSchema.optional(),
  disqualificationType: z.enum(["HANSOKU", "SHIKKAKU", "KIKEN"]).optional(),
  allowDraw: z.boolean().optional().default(false),
});
export type FinalizeKumiteResultRequest = z.infer<typeof finalizeKumiteResultSchema>;
