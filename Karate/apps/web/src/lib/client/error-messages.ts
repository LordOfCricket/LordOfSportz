import type { ApiErrorCode } from "@karate/types";

/**
 * Maps backend error codes to human-friendly copy. Never render
 * `error.message` from an unexpected/internal failure directly — always go
 * through this map so wording stays controlled and never leaks internals.
 */
const MESSAGES: Partial<Record<ApiErrorCode, string>> = {
  AUTHENTICATION_ERROR: "Invalid email or password.",
  AUTHORIZATION_ERROR: "You don't have permission to do that.",
  CONFLICT: "An account with this email already exists.",
  NOT_FOUND: "We couldn't find what you're looking for.",
  RATE_LIMITED: "Too many attempts. Please wait a moment and try again.",
  INFRASTRUCTURE_ERROR: "Unable to reach the server. Check your connection and try again.",
  INTERNAL_ERROR: "Something went wrong on our end. Please try again.",
};

const FALLBACK_MESSAGE = "Something went wrong. Please try again.";

export function friendlyErrorMessage(code: ApiErrorCode, backendMessage?: string): string {
  if (code === "VALIDATION_ERROR" && backendMessage) {
    // Validation messages are our own copy (from @karate/validation), safe to show as-is.
    return backendMessage;
  }
  return MESSAGES[code] ?? FALLBACK_MESSAGE;
}
