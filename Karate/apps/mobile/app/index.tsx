import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link, useRouter } from "expo-router";
import type { UserRole } from "@karate/types";
import { useAuth } from "@/context/AuthContext";
import { roleHomePath } from "@/lib/role-routes";
import { colors, radii, spacing, typography } from "@/theme/tokens";

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
      <View style={styles.brand}>
        <View style={styles.dot} />
        <Text style={styles.brandText}>KARATE</Text>
        <Text style={styles.brandSub}>LORDOFSPORTZ</Text>
      </View>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>KARATE · LORDOFSPORTZ</Text>
        <Text style={styles.heading}>Karate competition, run properly.</Text>
        <Text style={styles.subheading}>Tournaments, live bouts, belt grading and academies — in one place.</Text>
        <View style={styles.actions}>
          <Link href="/login" style={styles.primaryLink}>
            Sign in
          </Link>
          <Link href="/register" style={styles.secondaryButton}>
            Create an account
          </Link>
        </View>
      </View>
      <Text style={styles.footer}>One LordOfSportz account, every sport.</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink, padding: spacing.xl, justifyContent: "space-between" },
  centered: { flex: 1, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
  brand: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
  brandText: { color: colors.white, fontSize: 16, fontWeight: "800", letterSpacing: 1 },
  brandSub: { color: colors.gold, fontSize: 10, fontWeight: "700", letterSpacing: 2.5 },
  hero: { gap: spacing.md },
  eyebrow: { color: colors.accent, fontSize: 12, fontWeight: "700", letterSpacing: 2 },
  heading: { color: colors.white, fontSize: 34, lineHeight: 38, fontWeight: "700" },
  subheading: { ...typography.body, color: "rgba(255,255,255,0.7)", lineHeight: 21 },
  actions: { marginTop: spacing.lg, gap: spacing.md },
  primaryLink: {
    backgroundColor: colors.accent,
    color: colors.white,
    textAlign: "center",
    paddingVertical: 14,
    borderRadius: radii.full,
    fontWeight: "700",
    overflow: "hidden",
  },
  secondaryButton: {
    color: colors.white,
    textAlign: "center",
    paddingVertical: 14,
    borderRadius: radii.full,
    fontWeight: "600",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    overflow: "hidden",
  },
  footer: { color: "rgba(255,255,255,0.45)", fontSize: 12, textAlign: "center" },
});
