import { z } from "zod";
import { uuidSchema } from "./academy";

/**
 * `playerId` is optional and only meaningful when the actor is a coach or
 * academy admin submitting on a player's behalf — a player submitting for
 * themselves never needs to (and is rejected if they name a different
 * player). See registrations.service#resolveRegistrationTarget.
 */
export const createRegistrationSchema = z.object({
  competitionId: uuidSchema,
  playerId: uuidSchema.optional(),
});
export type CreateRegistrationRequest = z.infer<typeof createRegistrationSchema>;

export const registrationIdParamsSchema = z.object({
  registrationId: uuidSchema,
});
export type RegistrationIdParams = z.infer<typeof registrationIdParamsSchema>;

/** Only these three are ever settable by a human override — NOT_CHECKED/PENDING only ever come from the automatic engine. */
export const eligibilityOverrideSchema = z.object({
  status: z.enum(["ELIGIBLE", "INELIGIBLE", "MANUAL_REVIEW"]),
  notes: z.string().trim().max(1000).optional(),
});
export type EligibilityOverrideRequest = z.infer<typeof eligibilityOverrideSchema>;

/** `notes` is an administrative note only — never raw medical content — and is never echoed back through any read endpoint. */
export const medicalDecisionSchema = z.object({
  status: z.enum(["CLEARED", "NOT_CLEARED"]),
  notes: z.string().trim().max(500).optional(),
  expiresAt: z.coerce.date().optional(),
});
export type MedicalDecisionRequest = z.infer<typeof medicalDecisionSchema>;

/** `measuredWeightKg` is the actual value regardless of `unit` — normalized to kilograms server-side before storage. Status is never accepted from the client; the server always computes it. */
export const recordWeighInSchema = z.object({
  measuredWeight: z.number().positive().max(500),
  unit: z.enum(["KG", "LB"]).default("KG"),
});
export type RecordWeighInRequest = z.infer<typeof recordWeighInSchema>;

export const requestReweighSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});
export type RequestReweighRequest = z.infer<typeof requestReweighSchema>;
