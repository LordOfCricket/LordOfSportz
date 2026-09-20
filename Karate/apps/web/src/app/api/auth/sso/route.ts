import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { UserRole } from "@karate/types";
import { roleDashboardPath } from "@/lib/client/role-routes";
import { callBackend } from "@/lib/server/backend-client";
import { setAuthCookies, setSsoMarker, clearSharedSession, CRICKET_SESSION_COOKIE } from "@/lib/server/auth-cookies";

interface SsoData {
  roles: UserRole[];
  accessToken: string;
  refreshToken: string;
}

/** Exchanges the shared LordOfCricket session cookie for a Karate session. */
export async function GET(request: NextRequest) {
  const raw = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((pair) => pair.trim())
    .find((pair) => pair.startsWith(`${CRICKET_SESSION_COOKIE}=`));
  const requested = request.nextUrl.searchParams.get("redirect") ?? "/dashboard";
  const safeTarget = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/dashboard";

  const result = raw
    ? await callBackend<SsoData>("/api/v1/auth/sso", { method: "POST", body: { sessionCookie: raw } })
    : null;

  if (!result || !result.body.success) {
    const failed = NextResponse.redirect(new URL("/login?sso=failed", request.url));
    clearSharedSession(failed);
    return failed;
  }

  const primaryRole = result.body.data.roles[0];
  const target = safeTarget === "/dashboard" && primaryRole ? roleDashboardPath(primaryRole) : safeTarget;
  const response = NextResponse.redirect(new URL(target, request.url));
  setAuthCookies(response, result.body.data);
  setSsoMarker(response);
  return response;
}
