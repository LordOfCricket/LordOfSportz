import type { ApiResponse } from "@karate/types";
import { getWebServerEnv } from "./env";

export interface BackendCallResult<T> {
  status: number;
  body: ApiResponse<T>;
}

/**
 * Thin fetch wrapper around apps/api. Never used from client components —
 * this either runs in a Route Handler or a Server Component, both of which
 * can hold the access token server-side without exposing it to browser JS.
 * The backend's response envelope (ApiResponse<T>) is forwarded as-is: it
 * is already safe for clients (see docs/architecture/09-error-handling-strategy.md).
 */
export async function callBackend<T>(
  path: string,
  init: { method?: string; body?: unknown; accessToken?: string } = {},
): Promise<BackendCallResult<T>> {
  const env = getWebServerEnv();

  let res: Response;
  try {
    res = await fetch(`${env.API_BASE_URL}${path}`, {
      method: init.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        ...(init.accessToken ? { Authorization: `Bearer ${init.accessToken}` } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
  } catch {
    return {
      status: 503,
      body: {
        success: false,
        error: {
          code: "INFRASTRUCTURE_ERROR",
          message: "Unable to reach the server. Check your connection and try again.",
          requestId: "network-error",
          timestamp: new Date().toISOString(),
        },
      },
    };
  }

  const body = (await res.json()) as ApiResponse<T>;
  return { status: res.status, body };
}
