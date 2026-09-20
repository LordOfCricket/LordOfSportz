import { z } from "zod";
import { GRADING_EVENT_STATUSES } from "@karate/types";
import { uuidSchema } from "./academy";

export const createBeltSystemSchema = z.object({
  karateStyleId: uuidSchema,
  name: z.string().trim().min(2).max(200),
  description: z.string().trim().max(2000).optional(),
});
export type CreateBeltSystemRequest = z.infer<typeof createBeltSystemSchema>;

export const createBeltGradeSchema = z.object({
  name: z.string().trim().min(1).max(100),
  type: z.enum(["KYU", "DAN"]),
  rankOrder: z.number().int().min(1).max(100),
  colorName: z.string().trim().max(50).optional(),
  colorHex: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});
export type CreateBeltGradeRequest = z.infer<typeof createBeltGradeSchema>;

export const createGradingEventSchema = z.object({
  name: z.string().trim().min(2).max(200),
  beltSystemId: uuidSchema,
  eventDate: z.coerce.date(),
  location: z.string().trim().max(300).optional(),
  notes: z.string().trim().max(2000).optional(),
  examinerUserId: uuidSchema.optional(),
});
export type CreateGradingEventRequest = z.infer<typeof createGradingEventSchema>;

export const transitionGradingEventStatusSchema = z.object({
  status: z.enum(GRADING_EVENT_STATUSES),
});
export type TransitionGradingEventStatusRequest = z.infer<typeof transitionGradingEventStatusSchema>;

export const addGradingParticipantSchema = z.object({
  playerId: uuidSchema,
  targetGradeId: uuidSchema,
  examinerUserId: uuidSchema.optional(),
});
export type AddGradingParticipantRequest = z.infer<typeof addGradingParticipantSchema>;

export const recordGradingResultSchema = z.object({
  result: z.enum(["PASS", "FAIL", "ABSENT", "WITHHELD"]),
  remarks: z.string().trim().max(1000).optional(),
});
export type RecordGradingResultRequest = z.infer<typeof recordGradingResultSchema>;

export const verifyBeltHistorySchema = z.object({
  verificationStatus: z.enum(["VERIFIED", "REJECTED"]),
});
export type VerifyBeltHistoryRequest = z.infer<typeof verifyBeltHistorySchema>;

export const beltSystemIdParamsSchema = z.object({
  beltSystemId: uuidSchema,
});
export type BeltSystemIdParams = z.infer<typeof beltSystemIdParamsSchema>;

export const gradingEventIdParamsSchema = z.object({
  academyId: uuidSchema,
  eventId: uuidSchema,
});
export type GradingEventIdParams = z.infer<typeof gradingEventIdParamsSchema>;

export const participantIdParamsSchema = gradingEventIdParamsSchema.extend({
  participantId: uuidSchema,
});
export type ParticipantIdParams = z.infer<typeof participantIdParamsSchema>;

export const historyIdParamsSchema = z.object({
  historyId: uuidSchema,
});
export type HistoryIdParams = z.infer<typeof historyIdParamsSchema>;

export const verificationCodeParamsSchema = z.object({
  code: z.string().trim().min(1).max(512),
});
export type VerificationCodeParams = z.infer<typeof verificationCodeParamsSchema>;
