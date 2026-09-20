import type { ApiResponse } from "@karate/types";
import type { LoginRequest, RegisterRequest } from "@karate/validation";
import { friendlyErrorMessage } from "./error-messages";

export interface AuthUser {
  userId: string;
  email: string;
  fullName: string;
  roles: string[];
}

export class AuthRequestError extends Error {
  constructor(
    message: string,
    public readonly fieldIssues?: { path: string; message: string }[],
  ) {
    super(message);
    this.name = "AuthRequestError";
  }
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
  } catch {
    throw new AuthRequestError("Unable to reach the server. Check your connection and try again.");
  }

  const payload = (await res.json()) as ApiResponse<T>;
  if (!payload.success) {
    const issues = payload.error.details?.["issues"] as { path: string; message: string }[] | undefined;
    throw new AuthRequestError(friendlyErrorMessage(payload.error.code, payload.error.message), issues);
  }
  return payload.data;
}

export function registerUser(input: RegisterRequest): Promise<AuthUser> {
  return postJson<AuthUser>("/api/auth/register", input);
}

export function loginUser(input: LoginRequest): Promise<AuthUser> {
  return postJson<AuthUser>("/api/auth/login", input);
}

export async function logoutUser(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
}
