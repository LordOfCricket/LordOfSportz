import { randomBytes, createHash } from "node:crypto";

const RAW_TOKEN_BYTES = 40;

/**
 * Opaque, cryptographically random refresh tokens — not JWTs. Only the
 * SHA-256 hash is ever persisted; the raw value exists solely in the
 * response body at issuance and in client-side secure storage. Never log
 * either value.
 */
export function generateOpaqueToken(): { rawToken: string; tokenHash: string } {
  const rawToken = randomBytes(RAW_TOKEN_BYTES).toString("base64url");
  return { rawToken, tokenHash: hashOpaqueToken(rawToken) };
}

export function hashOpaqueToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}
