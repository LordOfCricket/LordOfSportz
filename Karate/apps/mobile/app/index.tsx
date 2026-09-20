import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link, useRouter } from "expo-router";
import type { UserRole } from "@karate/types";
import { useAuth } from "@/context/AuthContext";
import { roleHomePath } from "@/lib/role-routes";
import { colors, spacing, typography } from "@/theme/tokens";

/**
 * Entry screen. Redirects an authenticated user straight into their real
 * role's shell (from the backend-verified user, not a self-selected demo
 * role); otherwise shows sign-in/sign-up entry points.
 */
export default function EntryScreen() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && user?.roles[0]) {
      router.replace(roleHomePath(user.roles[0] as UserRole));
    }
  }, [isLoading, user, router]);

  if (isLoading || user) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.heading}>Karate Platform</Text>
      <Text style={styles.subheading}>Sign in to continue.</Text>
      <View style={styles.actions}>
        <Link href="/login" style={styles.primaryLink}>
          Sign in
        </Link>
        <Link href="/register" style={styles.secondaryLink}>
          Create an account
        </Link>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink, padding: spacing.xl, justifyContent: "center" },
  centered: { flex: 1, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
  heading: { ...typography.title, color: colors.white },
  subheading: { ...typography.body, color: "rgba(255,255,255,0.7)", marginTop: spacing.xs },
  actions: { marginTop: spacing.xl, gap: spacing.md },
  primaryLink: {
    backgroundColor: colors.accent,
    color: colors.white,
    textAlign: "center",
    paddingVertical: spacing.md,
    borderRadius: 8,
    fontWeight: "600",
    overflow: "hidden",
  },
  secondaryLink: { color: "rgba(255,255,255,0.8)", textAlign: "center", fontSize: 13 },
});
