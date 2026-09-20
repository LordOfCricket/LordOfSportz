import { z } from "zod";

export const uuidSchema = z.string().uuid();

export const createAcademyRequestSchema = z.object({
  name: z.string().trim().min(2).max(200),
  description: z.string().trim().max(2000).optional(),
  countryCode: z.string().length(2).optional(),
  city: z.string().trim().max(200).optional(),
});
export type CreateAcademyRequest = z.infer<typeof createAcademyRequestSchema>;

export const membershipRequestActionSchema = z.object({
  requestId: uuidSchema,
  action: z.enum(["ACCEPT", "REJECT"]),
});
export type MembershipRequestAction = z.infer<typeof membershipRequestActionSchema>;

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const academyIdParamsSchema = z.object({
  academyId: uuidSchema,
});
export type AcademyIdParams = z.infer<typeof academyIdParamsSchema>;

export const updateAcademyRequestSchema = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  countryCode: z.string().length(2).optional(),
  city: z.string().trim().max(200).optional(),
  contactEmail: z.string().trim().email().max(255).optional(),
  contactPhone: z.string().trim().max(50).optional(),
});
export type UpdateAcademyRequest = z.infer<typeof updateAcademyRequestSchema>;

export const academySearchQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(200).optional(),
});
export type AcademySearchQuery = z.infer<typeof academySearchQuerySchema>;

/** Coach/player self-service request to join an academy — target/initiator are derived server-side from the caller's role, never client-supplied. */
export const createMembershipRequestSchema = z.object({
  message: z.string().trim().max(500).optional(),
});
export type CreateMembershipRequest = z.infer<typeof createMembershipRequestSchema>;
