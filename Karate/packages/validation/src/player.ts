import { z } from "zod";

export const createPlayerProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(200),
  dateOfBirth: z.coerce.date(),
  gender: z.enum(["MALE", "FEMALE"]),
  photoUrl: z.string().url().max(2048).optional(),
  bio: z.string().trim().max(2000).optional(),
  primaryStyleId: z.string().uuid().optional(),
  styleIds: z.array(z.string().uuid()).max(10).optional(),
});
export type CreatePlayerProfileRequest = z.infer<typeof createPlayerProfileSchema>;

export const updatePlayerProfileSchema = createPlayerProfileSchema.partial();
export type UpdatePlayerProfileRequest = z.infer<typeof updatePlayerProfileSchema>;
