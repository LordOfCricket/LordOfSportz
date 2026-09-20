import { z } from "zod";

export const createCoachProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(200),
  photoUrl: z.string().url().max(2048).optional(),
  bio: z.string().trim().max(2000).optional(),
  yearsActive: z.number().int().min(0).max(80).optional(),
  styleIds: z.array(z.string().uuid()).max(10).optional(),
});
export type CreateCoachProfileRequest = z.infer<typeof createCoachProfileSchema>;

export const updateCoachProfileSchema = createCoachProfileSchema.partial();
export type UpdateCoachProfileRequest = z.infer<typeof updateCoachProfileSchema>;
