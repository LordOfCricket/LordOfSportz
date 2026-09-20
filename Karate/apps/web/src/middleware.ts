import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { ACCESS_TOKEN_COOKIE_NAME, REFRESH_TOKEN_COOKIE_NAME } from "@karate/constants";
import type { UserRole } from "@karate/types";
import { roleDashboardPath, roleRequiredForPath } from "@/lib/client/role-routes";
import { getWebServerEnv } from "@/lib/server/env";

const CRICKET_SESSION_COOKIE = "loc_session";
const SSO_MARKER_COOKIE = "karate_sso";
// Accounts are created once, with the shared LordOfCricket identity (dev fallback: local Cricket web).
const CRICKET_WEB_URL =
  process.env["NEXT_PUBLIC_CRICKET_WEB_URL"] || (process.env.NODE_ENV !== "production" ? "http://localhost:5173" : "");

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/register"],
};

interface AccessTokenPayload {
  sub: string;
  roles: UserRole[];
}

/**
 * Route gating for UX only — the source of truth for authorization is
 * always apps/api (every route re-checks role/organization server-side).
 * This exists purely so an unauthenticated or wrong-role visit redirects
 * cleanly instead of rendering a page that will fail its data fetch.
 */
async function verifyAccessToken(token: string): Promise<AccessTokenPayload | null> {
  try {
    const env = getWebServerEnv();
    const secret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    if (typeof payload["sub"] !== "string" || !Array.isArray(payload["roles"])) {
      return null;
    }
    return { sub: payload["sub"], roles: payload["roles"] as UserRole[] };
  } catch {
    return null;
  }
}

/**
 * Dashboard pages are server-rendered, so there is no client-side fetch to
 * intercept a 401 on navigation — this is the actual place "access expires
 * -> client refreshes" happens for the working app. Calls this app's own
 * /api/auth/refresh route (not apps/api directly) so cookie-setting logic
 * stays in exactly one place. Never recurses into this middleware: the
 * refresh route isn't in `config.matcher`.
 */
async function attemptSilentRefresh(
  request: NextRequest,
): Promise<{ payload: AccessTokenPayload; setCookieHeaders: string[] } | null> {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;

  let refreshRes: Response;
  try {
    refreshRes = await fetch(new URL("/api/auth/refresh", request.url), {
      method: "POST",
      headers: { cookie: cookieHeader },
    });
  } catch {
    return null;
  }
  if (!refreshRes.ok) return null;

  const setCookieHeaders = refreshRes.headers.getSetCookie?.() ?? [];
  const accessCookie = setCookieHeaders.find((c) => c.startsWith(`${ACCESS_TOKEN_COOKIE_NAME}=`));
  const newAccessToken = accessCookie?.split(";")[0]?.split("=")[1];
  if (!newAccessToken) return null;

  const payload = await verifyAccessToken(newAccessToken);
  if (!payload) return null;

  return { payload, setCookieHeaders };
}

/**
 * `NextResponse.next()` alone only updates cookies for the BROWSER's next
 * request — it does not change what `cookies()` sees in the Server
 * Component rendering for THIS request. Rewriting the outgoing request's
 * `cookie` header is what makes the freshly-refreshed token visible
 * immediately, so the page doesn't render once with the stale token and
 * bounce to /login despite the refresh having just succeeded.
 */
function mergeCookieHeader(originalCookieHeader: string | null, setCookieHeaders: string[]): string {
  const cookieMap = new Map<string, string>();
  for (const pair of (originalCookieHeader ?? "").split(";")) {
    const trimmed = pair.trim();
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    cookieMap.set(trimmed.slice(0, eq), trimmed.slice(eq + 1));
  }
  for (const setCookie of setCookieHeaders) {
    const firstPair = (setCookie.split(";")[0] ?? "").trim();
    const eq = firstPair.indexOf("=");
    if (eq === -1) continue;
    cookieMap.set(firstPair.slice(0, eq), firstPair.slice(eq + 1));
  }
  return Array.from(cookieMap.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(ACCESS_TOKEN_COOKIE_NAME)?.value;
  const payload = token ? await verifyAccessToken(token) : null;

  const isAuthRoute = pathname === "/login" || pathname === "/register";

  if (pathname === "/register" && CRICKET_WEB_URL) {
    return NextResponse.redirect(new URL("/signup", CRICKET_WEB_URL));
  }
  const hasSharedSession = Boolean(request.cookies.get(CRICKET_SESSION_COOKIE)?.value);

  // A federated Karate session must not outlive the shared LordOfCricket session (logout anywhere).
  if (request.cookies.get(SSO_MARKER_COOKIE) && !hasSharedSession) {
    const response = isAuthRoute
      ? NextResponse.next()
      : NextResponse.redirect(new URL("/login?sessionExpired=1", request.url));
    response.cookies.delete(ACCESS_TOKEN_COOKIE_NAME);
    response.cookies.delete(REFRESH_TOKEN_COOKIE_NAME);
    response.cookies.delete(SSO_MARKER_COOKIE);
    return response;
  }

  // Cross-device revocation: the shared cookie may still be present but revoked upstream. A definite
  // 401 from the identity provider ends this federated session (network errors fail open).
  const cricketApi = process.env["CRICKET_API_URL"]?.replace(/\/+$/, "");
  if (cricketApi && request.cookies.get(SSO_MARKER_COOKIE) && hasSharedSession && !isAuthRoute) {
    const raw = (request.headers.get("cookie") ?? "").split(";").map((p) => p.trim()).find((p) => p.startsWith(`${CRICKET_SESSION_COOKIE}=`));
    try {
      const me = await fetch(`${cricketApi}/auth/me`, { headers: { cookie: raw ?? "" } });
      if (me.status === 401) {
        const response = NextResponse.redirect(new URL("/login?sessionExpired=1", request.url));
        response.cookies.delete(ACCESS_TOKEN_COOKIE_NAME);
        response.cookies.delete(REFRESH_TOKEN_COOKIE_NAME);
        response.cookies.delete(SSO_MARKER_COOKIE);
        response.cookies.delete(CRICKET_SESSION_COOKIE);
        return response;
      }
    } catch {
      // Identity provider unreachable — keep the existing session.
    }
  }

  const ssoUrl = (target: string) => new URL(`/api/auth/sso?redirect=${encodeURIComponent(target)}`, request.url);

  if (isAuthRoute) {
    const primaryRole = payload?.roles[0];
    if (primaryRole) {
      return NextResponse.redirect(new URL(roleDashboardPath(primaryRole), request.url));
    }
    if (hasSharedSession && !request.nextUrl.searchParams.has("sso")) {
      return NextResponse.redirect(ssoUrl("/dashboard"));
    }
    return NextResponse.next();
  }

  // Everything else matched by `config.matcher` is a /dashboard/* route.
  if (!payload) {
    const hasRefreshCookie = Boolean(request.cookies.get(REFRESH_TOKEN_COOKIE_NAME)?.value);
    const refreshed = hasRefreshCookie ? await attemptSilentRefresh(request) : null;

    if (refreshed) {
      const requiredRole = roleRequiredForPath(pathname);
      if (requiredRole && !refreshed.payload.roles.includes(requiredRole)) {
        return NextResponse.redirect(new URL("/forbidden", request.url));
      }

      const requestHeaders = new Headers(request.headers);
      requestHeaders.set(
        "cookie",
        mergeCookieHeader(request.headers.get("cookie"), refreshed.setCookieHeaders),
      );

      const response = NextResponse.next({ request: { headers: requestHeaders } });
      for (const cookie of refreshed.setCookieHeaders) {
        response.headers.append("set-cookie", cookie);
      }
      return response;
    }

    if (hasSharedSession) {
      return NextResponse.redirect(ssoUrl(pathname));
    }

    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    if (token) {
      // A token was present but failed verification/refresh — distinct from "never signed in".
      loginUrl.searchParams.set("sessionExpired", "1");
    }
    return NextResponse.redirect(loginUrl);
  }

  const requiredRole = roleRequiredForPath(pathname);
  if (requiredRole && !payload.roles.includes(requiredRole)) {
    return NextResponse.redirect(new URL("/forbidden", request.url));
  }

  return NextResponse.next();
}
