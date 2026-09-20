"use client";

import { useCallback, useEffect, useState } from "react";

// Shared identity provider = LordOfCricket API (session cookie shared across local sport apps).
const isDev = process.env.NODE_ENV !== "production";
export const AUTH_API = process.env.NEXT_PUBLIC_AUTH_API_URL || (isDev ? "http://localhost:5000/api" : "");

const AUTH_CHANGED = "lordofsportz:auth-changed";

export type AuthUser = { name: string; email: string | null };

export async function loginRequest(identifier: string, password: string): Promise<string | null> {
  if (!AUTH_API) return "Sign-in is not configured.";
  try {
    const res = await fetch(`${AUTH_API}/auth/login-password`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, password }),
    });
    if (res.ok) {
      window.dispatchEvent(new Event(AUTH_CHANGED));
      return null;
    }
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    return body?.message ?? "Incorrect email/phone or password.";
  } catch {
    return "Could not reach the sign-in service.";
  }
}

export function useAuthUser() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!AUTH_API) {
      setReady(true);
      return;
    }
    const load = () =>
      fetch(`${AUTH_API}/auth/me`, { credentials: "include" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { user?: AuthUser } | null) => setUser(data?.user ?? null))
        .catch(() => setUser(null))
        .finally(() => setReady(true));
    void load();
    window.addEventListener(AUTH_CHANGED, load);
    return () => window.removeEventListener(AUTH_CHANGED, load);
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch(`${AUTH_API}/auth/logout?scope=all`, { method: "POST", credentials: "include" });
    } finally {
      setUser(null);
    }
  }, []);

  return { user, ready, logout };
}
