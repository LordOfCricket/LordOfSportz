/**
 * Fetch wrapper for CLIENT COMPONENTS calling same-origin, cookie-authenticated
 * routes (the `/api/auth/*` proxies, or any future protected client-side
 * endpoint). Not currently called anywhere — Phase 2/3 dashboards fetch
 * their data server-side (see lib/server/current-user.ts), which never
 * needs this. It exists as the designated mechanism for the next client
 * component that DOES need authenticated client-side fetching, so that
 * logic isn't reinvented per call site.
 *
 * On a 401: attempts exactly one refresh, shared across concurrent callers
 * via a single in-flight promise (so five simultaneous 401s trigger one
 * refresh, not five), then retries the original request exactly once.
 * Non-idempotent methods are only retried when the caller explicitly opts
 * in via `idempotent: true` — blindly re-submitting a POST after a refresh
 * risks double-applying a mutation that may have already gone through.
 */

let refreshInFlight: Promise<boolean> | null = null;

async function refreshSessionOnce(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = fetch("/api/auth/refresh", { method: "POST", credentials: "include" })
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

function redirectToLogin(): void {
  if (typeof window === "undefined") return;
  const redirect = encodeURIComponent(window.location.pathname);
  window.location.href = `/login?redirect=${redirect}&sessionExpired=1`;
}

export async function apiFetch(
  path: string,
  init: RequestInit & { idempotent?: boolean } = {},
): Promise<Response> {
  const { idempotent, ...requestInit } = init;
  const method = (requestInit.method ?? "GET").toUpperCase();
  const canRetry = idempotent ?? (method === "GET" || method === "HEAD");

  const response = await fetch(path, { ...requestInit, credentials: "include" });
  if (response.status !== 401 || !canRetry) {
    return response;
  }

  const refreshed = await refreshSessionOnce();
  if (!refreshed) {
    redirectToLogin();
    return response;
  }

  return fetch(path, { ...requestInit, credentials: "include" });
}
