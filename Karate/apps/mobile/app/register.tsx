import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link, useRouter } from "expo-router";
import { registerRequestSchema } from "@karate/validation";
import { USER_ROLES, type UserRole } from "@karate/types";
import { useAuth } from "@/context/AuthContext";
import { ApiRequestError } from "@/lib/api-client";
import { colors, radii, spacing, typography } from "@/theme/tokens";

/** FOUNDATION: see login.tsx for scope note. */
export default function RegisterScreen() {
  const router = useRouter();
  const { register } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("PLAYER");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    const parsed = registerRequestSchema.safeParse({ email, password, fullName, role });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input.");
      return;
    }

    setIsSubmitting(true);
    try {
      await register(parsed.data);
      router.replace("/");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.title}>Create account</Text>

      {error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.roleRow}>
        {USER_ROLES.map((r) => (
          <Pressable
            key={r}
            onPress={() => setRole(r)}
            style={[styles.rolePill, role === r && styles.rolePillActive]}
          >
            <Text style={[styles.rolePillText, role === r && styles.rolePillTextActive]}>{r}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Full name</Text>
        <TextInput style={styles.input} value={fullName} onChangeText={setFullName} />
      </View>
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
          <Text style={styles.buttonText}>Create account</Text>
        )}
      </Pressable>

      <Link href="/login" style={styles.link}>
        Already have an account? Sign in
      </Link>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface, padding: spacing.xl, justifyContent: "center" },
  title: { ...typography.title, color: colors.textPrimary, marginBottom: spacing.lg },
  roleRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginBottom: spacing.md },
  rolePill: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  rolePillActive: { borderColor: colors.accent, backgroundColor: colors.surfaceSunken },
  rolePillText: { fontSize: 12, fontWeight: "600", color: colors.textSecondary },
  rolePillTextActive: { color: colors.accent },
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
