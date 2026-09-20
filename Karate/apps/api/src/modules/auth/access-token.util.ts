import jwt from "jsonwebtoken";
import type { UserRole } from "@karate/types";
import { loadServerEnv } from "@karate/config";

/** Short-lived, stateless JWT — unchanged design from Phase 2. Never revoked individually; it just expires. */
export function issueAccessToken(userId: string, roles: UserRole[]): string {
  const env = loadServerEnv();
  return jwt.sign({ sub: userId, roles }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL_SECONDS,
  });
}
