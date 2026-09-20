import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { REFRESH_TOKEN_COOKIE_NAME } from "@karate/constants";
import { callBackend } from "@/lib/server/backend-client";
import { setAuthCookies, clearAuthCookies } from "@/lib/server/auth-cookies";

interface RefreshData {
  userId: string;
  email: string;
  fullName: string;
  roles: string[];
  accessToken: string;
  refreshToken: string;
}

/**
 * Exchanges the refresh-token cookie for a new token pair. On any failure
 * (expired, revoked, reuse detected, missing) the old cookies are cleared —
 * a failed refresh always means "the browser needs to sign in again," never
 * "keep the stale cookie around."
 */
export async function POST() {
  const refreshToken = cookies().get(REFRESH_TOKEN_COOKIE_NAME)?.value;

  if (!refreshToken) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "AUTHENTICATION_ERROR",
          message: "No active session to refresh.",
          requestId: "n/a",
          timestamp: new Date().toISOString(),
        },
      },
      { status: 401 },
    );
  }

  const result = await callBackend<RefreshData>("/api/v1/auth/refresh", {
    method: "POST",
    body: { refreshToken },
  });

  if (!result.body.success) {
    const response = NextResponse.json(result.body, { status: result.status });
    clearAuthCookies(response);
    return response;
  }

  const { accessToken, refreshToken: newRefreshToken, ...user } = result.body.data;
  const response = NextResponse.json({ success: true, data: user, meta: result.body.meta }, { status: 200 });
  setAuthCookies(response, { accessToken, refreshToken: newRefreshToken });
  return response;
}
