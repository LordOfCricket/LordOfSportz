import { z } from "zod";
import { USER_ROLES } from "@karate/types";

export const registerRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  password: z
    .string()
    .min(12, "Password must be at least 12 characters")
    .max(128)
    .regex(/[a-z]/, "Password must contain a lowercase letter")
    .regex(/[A-Z]/, "Password must contain an uppercase letter")
    .regex(/[0-9]/, "Password must contain a number"),
  fullName: z.string().trim().min(1).max(200),
  role: z.enum(USER_ROLES),
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const loginRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  password: z.string().min(1).max(128),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

/** Opaque refresh token (see packages/database/prisma/schema/sessions.prisma) — not a JWT, so no JWT-shape check. */
export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(20).max(512),
});
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;

/** Deliberately lenient: logout must succeed even for a garbage/already-used token (idempotent no-op). */
export const logoutRequestSchema = z.object({
  refreshToken: z.string().min(1).max(512),
});
export type LogoutRequest = z.infer<typeof logoutRequestSchema>;
