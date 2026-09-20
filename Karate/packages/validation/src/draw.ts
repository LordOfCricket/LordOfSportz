import { z } from "zod";
import { uuidSchema } from "./academy";

export const competitionIdParamsSchema = z.object({
  competitionId: uuidSchema,
});
export type CompetitionIdParams = z.infer<typeof competitionIdParamsSchema>;

export const drawIdParamsSchema = z.object({
  drawId: uuidSchema,
});
export type DrawIdParams = z.infer<typeof drawIdParamsSchema>;

const manualSeedSchema = z.object({
  registrationId: uuidSchema,
  seedNumber: z.number().int().min(1),
});

/** Only the two currently-implemented bracket types are accepted — POOL is reserved in the schema/type layer for later. */
export const generateDrawSchema = z.object({
  bracketType: z.enum(["SINGLE_ELIMINATION", "ROUND_ROBIN"]),
  seedingStrategy: z.enum(["MANUAL", "RANKING", "RANDOM", "NONE"]),
  manualSeeds: z.array(manualSeedSchema).max(256).optional(),
  force: z.boolean().optional(),
});
export type GenerateDrawRequest = z.infer<typeof generateDrawSchema>;
