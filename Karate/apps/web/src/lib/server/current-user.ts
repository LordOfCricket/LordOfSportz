import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACCESS_TOKEN_COOKIE_NAME } from "@karate/constants";
import { callBackend } from "./backend-client";

export interface CurrentUser {
  userId: string;
  email: string;
  fullName: string;
  roles: string[];
  status: string;
}

/**
 * Server-component data access for "who is signed in." The middleware
 * already redirects unauthenticated/expired visits away from /dashboard/*,
 * but this re-checks server-side (defense in depth — middleware is a UX
 * convenience, apps/api + this call are the actual authorization boundary)
 * and redirects to /login with a session-expired flag if the token that
 * passed middleware is somehow no longer valid by the time this runs.
 */
export async function getCurrentUserOrRedirect(currentPath: string): Promise<CurrentUser> {
  const accessToken = cookies().get(ACCESS_TOKEN_COOKIE_NAME)?.value;
  if (!accessToken) {
    redirect(`/login?redirect=${encodeURIComponent(currentPath)}`);
  }

  const result = await callBackend<CurrentUser>("/api/v1/auth/me", { accessToken });
  if (!result.body.success) {
    redirect(`/login?redirect=${encodeURIComponent(currentPath)}&sessionExpired=1`);
  }

  return result.body.data;
}
