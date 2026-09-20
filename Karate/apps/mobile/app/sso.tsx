import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { apiClient } from "@/lib/api-client";
import { roleHomePath } from "@/lib/role-routes";
import { colors, spacing, typography } from "@/theme/tokens";
import type { UserRole } from "@karate/types";

/** Deep-link target (karateplatform://sso?code=...): redeems a one-time code from another app. */
export default function SsoScreen() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const { ssoLogin } = useAuth();
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!code) throw new Error("missing code");
        await ssoLogin(code);
        const me = await apiClient.me();
        if (!cancelled) router.replace(me.roles[0] ? roleHomePath(me.roles[0] as UserRole) : "/");
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, ssoLogin, router]);

  return (
    <SafeAreaView style={styles.container}>
      {failed ? <Text style={styles.text}>Sign-in link expired. Please sign in again.</Text> : <ActivityIndicator color={colors.accent} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  text: { ...typography.body, color: colors.textPrimary },
});
