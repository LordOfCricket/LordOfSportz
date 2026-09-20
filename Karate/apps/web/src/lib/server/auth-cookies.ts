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
