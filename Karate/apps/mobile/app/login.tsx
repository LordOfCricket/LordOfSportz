import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link, useRouter } from "expo-router";
import { loginRequestSchema } from "@karate/validation";
import { useAuth } from "@/context/AuthContext";
import { ApiRequestError } from "@/lib/api-client";
import { colors, radii, spacing, typography } from "@/theme/tokens";

/**
 * FOUNDATION: functional but visually minimal — the polished, fully
 * designed mobile auth experience is explicitly out of scope for this
 * phase (see docs/architecture/12-mobile-architecture.md). This proves the
 * same backend contracts and secure-storage auth flow work end-to-end from
 * a native client.
 */
export default function LoginScreen() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    const parsed = loginRequestSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input.");
      return;
    }

    setIsSubmitting(true);
    try {
      await login(parsed.data);
      router.replace("/");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.brand}>
        <View style={styles.brandDot} />
        <Text style={styles.brandText}>KARATE</Text>
        <Text style={styles.brandSub}>LORDOFSPORTZ</Text>
      </View>
      <Text style={styles.title}>Sign in</Text>
      <Text style={styles.subtitle}>Use your LordOfSportz account — one login for every sport.</Text>

      {error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.field}>
        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Password</Text>
        <TextInput style={styles.input} secureTextEntry value={password} onChangeText={setPassword} />
      </View>

      <Pressable style={styles.button} onPress={handleSubmit} disabled={isSubmitting}>
        {isSubmitting ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={styles.buttonText}>Sign in</Text>
        )}
      </Pressable>

      <Link href="/register" style={styles.link}>
        New here? Create an account
      </Link>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  brand: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.xl },
  brandDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
  brandText: { fontSize: 16, fontWeight: "800", letterSpacing: 1, color: colors.textPrimary },
  brandSub: { fontSize: 10, fontWeight: "700", letterSpacing: 2.5, color: colors.gold },
  screen: { flex: 1, backgroundColor: colors.surface, padding: spacing.xl, justifyContent: "center" },
  title: { ...typography.title, color: colors.textPrimary },
  subtitle: { ...typography.body, color: colors.textMuted, marginTop: spacing.xs, marginBottom: spacing.lg },
  field: { marginBottom: spacing.md },
  label: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.xs },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    backgroundColor: colors.surfaceRaised,
    color: colors.textPrimary,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  buttonText: { color: colors.white, fontWeight: "600" },
  error: { color: colors.danger, marginBottom: spacing.md, fontSize: 13 },
  link: { color: colors.accent, textAlign: "center", marginTop: spacing.lg, fontSize: 13 },
});
