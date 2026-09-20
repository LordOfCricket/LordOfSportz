import { z } from "zod";

export const createScorerProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(200),
  photoUrl: z.string().url().max(2048).optional(),
  certificationLevel: z.string().trim().max(200).optional(),
});
export type CreateScorerProfileRequest = z.infer<typeof createScorerProfileSchema>;

export const updateScorerProfileSchema = createScorerProfileSchema.partial();
export type UpdateScorerProfileRequest = z.infer<typeof updateScorerProfileSchema>;
