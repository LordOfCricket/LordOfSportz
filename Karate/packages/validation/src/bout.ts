import { z } from "zod";
import { BOUT_RESULT_METHODS } from "@karate/types";
import { uuidSchema } from "./academy";

export const recordBoutResultSchema = z.object({
  method: z.enum(BOUT_RESULT_METHODS),
  winnerPlayerId: uuidSchema.optional(),
  finalScoreRed: z.number().int().min(0).optional(),
  finalScoreBlue: z.number().int().min(0).optional(),
  reason: z.string().trim().max(500).optional(),
});
export type RecordBoutResultRequest = z.infer<typeof recordBoutResultSchema>;

export const correctBoutResultSchema = z.object({
  winnerPlayerId: uuidSchema.nullable().optional(),
  winnerTeamId: uuidSchema.nullable().optional(),
  method: z.enum(BOUT_RESULT_METHODS).optional(),
  finalScoreRed: z.number().int().min(0).nullable().optional(),
  finalScoreBlue: z.number().int().min(0).nullable().optional(),
  reason: z.string().trim().max(500).optional(),
  correctionReason: z.string().trim().min(1).max(500),
});

export const cancelBoutSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});
export type CancelBoutRequest = z.infer<typeof cancelBoutSchema>;

export const pauseBoutSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});
export type PauseBoutRequest = z.infer<typeof pauseBoutSchema>;
