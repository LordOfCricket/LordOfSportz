import { useEffect } from "react";
import { useRouter } from "expo-router";
import type { UserRole } from "@karate/types";
import { useAuth } from "@/context/AuthContext";

/**
 * Applied identically in every role's tab `_layout.tsx`. Mirrors the web
 * middleware's redirect rules (unauthenticated -> /login, wrong role ->
 * /forbidden) but is UX-only here too — apiClient calls still hit real,
 * independently-authorized backend endpoints regardless of what this hook
 * decides to render.
 */
export function useProtectedRoute(requiredRole: UserRole) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!user.roles.includes(requiredRole)) {
      router.replace("/forbidden");
    }
  }, [isLoading, user, requiredRole, router]);

  return { isChecking: isLoading || !user || !user.roles.includes(requiredRole) };
}
