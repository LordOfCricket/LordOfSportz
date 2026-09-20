import { randomBytes } from "node:crypto";

/** Human-shareable serial + an unguessable verification code, for the public verify-by-code lookup. */
export function generateCertificateCodes(): { serialNumber: string; verificationCode: string } {
  const serialNumber = `BG-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
  const verificationCode = randomBytes(16).toString("base64url");
  return { serialNumber, verificationCode };
}
