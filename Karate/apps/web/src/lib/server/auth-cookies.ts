import type { NextResponse } from "next/server";
import { ACCESS_TOKEN_COOKIE_NAME, REFRESH_TOKEN_COOKIE_NAME } from "@karate/constants";

/**
 * Tokens live ONLY in httpOnly cookies scoped to this Next.js origin — never
 * in localStorage/sessionStorage, never returned to client-side JS. This is
 * the storage decision required by the security review (Step 9): an XSS bug
 * elsewhere in the app cannot read an httpOnly cookie.
 */
export function setAuthCookies(
  res: NextResponse,
  tokens: { accessToken: string; refreshToken: string },
): void {
  const isProduction = process.env.NODE_ENV === "production";
  const common = {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax" as const,
    path: "/",
  };

  res.cookies.set(ACCESS_TOKEN_COOKIE_NAME, tokens.accessToken, { ...common, maxAge: 15 * 60 });
  res.cookies.set(REFRESH_TOKEN_COOKIE_NAME, tokens.refreshToken, { ...common, maxAge: 30 * 24 * 60 * 60 });
}

export function clearAuthCookies(res: NextResponse): void {
  res.cookies.delete(ACCESS_TOKEN_COOKIE_NAME);
  res.cookies.delete(REFRESH_TOKEN_COOKIE_NAME);
}

export const CRICKET_SESSION_COOKIE = "loc_session";
export const SSO_MARKER_COOKIE = "karate_sso";

/** Marks a session as federated from LordOfCricket so it dies when the shared session does. */
export function setSsoMarker(res: NextResponse): void {
  res.cookies.set(SSO_MARKER_COOKIE, "1", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
}

export function clearSharedSession(res: NextResponse): void {
  res.cookies.delete(SSO_MARKER_COOKIE);
  res.cookies.delete(CRICKET_SESSION_COOKIE);
}

/** Re-issues the LordOfCricket session cookie (raw Set-Cookie string) so the browser shares it across apps. */
export function setCricketSessionFromHeader(res: NextResponse, rawSetCookie: string): void {
  const [pair = "", ...attrs] = rawSetCookie.split(";").map((part) => part.trim());
  const eq = pair.indexOf("=");
  if (eq === -1) return;
  const expires = attrs.find((a) => a.toLowerCase().startsWith("expires="))?.slice(8);
  res.cookies.set(pair.slice(0, eq), decodeURIComponent(pair.slice(eq + 1)), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    ...(expires ? { expires: new Date(expires) } : {}),
  });
}
