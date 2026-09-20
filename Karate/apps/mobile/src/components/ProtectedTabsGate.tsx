import type { ReactNode } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import type { UserRole } from "@karate/types";
import { useProtectedRoute } from "@/hooks/useProtectedRoute";
import { colors } from "@/theme/tokens";

/** Wraps a role's Tabs layout: blocks render until auth/role is confirmed, redirecting otherwise. */
export function ProtectedTabsGate({
  requiredRole,
  children,
}: {
  requiredRole: UserRole;
  children: ReactNode;
}) {
  const { isChecking } = useProtectedRoute(requiredRole);

  if (isChecking) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
});
