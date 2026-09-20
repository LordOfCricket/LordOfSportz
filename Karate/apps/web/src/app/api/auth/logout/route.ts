import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { REFRESH_TOKEN_COOKIE_NAME } from "@karate/constants";
import { callBackend } from "@/lib/server/backend-client";
import { clearAuthCookies } from "@/lib/server/auth-cookies";

/**
 * Revokes the server-side refresh session (Phase 3), then always clears the
 * local cookies — even if the backend call fails (network error, token
 * already invalid, etc.). Logout must never leave the browser looking
 * "logged in" just because revocation didn't succeed; the cookie clear is
 * unconditional and this route always returns success.
 */
export async function POST() {
  const refreshToken = cookies().get(REFRESH_TOKEN_COOKIE_NAME)?.value;

  if (refreshToken) {
    try {
      await callBackend("/api/v1/auth/logout", { method: "POST", body: { refreshToken } });
    } catch {
      // Best-effort revocation — local cookie clear below still proceeds.
    }
  }

  const response = NextResponse.json({ success: true, data: { loggedOut: true } });
  clearAuthCookies(response);
  return response;
}
