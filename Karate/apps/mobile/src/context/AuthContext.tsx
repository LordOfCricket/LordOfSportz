import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { LoginRequest, RegisterRequest } from "@karate/validation";
import { apiClient, type AuthUser } from "@/lib/api-client";
import { tokenStorage } from "@/lib/token-storage";

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (input: LoginRequest) => Promise<void>;
  register: (input: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Single source of client-side auth state for the app. Hydrates from
 * SecureStore on launch by calling the real /auth/me endpoint — the same
 * contract the web app uses — rather than trusting a locally cached user
 * object that could go stale relative to the server.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const token = await tokenStorage.getAccessToken();
      if (!token) {
        setIsLoading(false);
        return;
      }
      try {
        const me = await apiClient.me();
        setUser(me);
      } catch {
        await tokenStorage.clear();
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (input: LoginRequest) => {
    const result = await apiClient.login(input);
    await tokenStorage.save(result.accessToken, result.refreshToken);
    setUser(result);
  }, []);

  const register = useCallback(async (input: RegisterRequest) => {
    const result = await apiClient.register(input);
    await tokenStorage.save(result.accessToken, result.refreshToken);
    setUser(result);
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = await tokenStorage.getRefreshToken();
    if (refreshToken) {
      try {
        await apiClient.logout(refreshToken);
      } catch {
        // Best-effort server-side revocation — local credentials are cleared regardless below.
      }
    }
    await tokenStorage.clear();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, isLoading, login, register, logout }),
    [user, isLoading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
