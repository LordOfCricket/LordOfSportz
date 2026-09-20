import { useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Card } from "./Card";
import { colors, radii, spacing, typography } from "@/theme/tokens";
import { ApiRequestError } from "@/lib/api-client";

interface ProfileFormCardProps {
  title: string;
  description: string;
  onSubmit: () => Promise<unknown>;
  onSuccess: () => void;
  children: ReactNode;
}

/** Shared shell for the "create your profile" forms across roles — one submit/loading/error pattern. */
export function ProfileFormCard({ title, description, onSubmit, onSuccess, children }: ProfileFormCardProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    setIsSubmitting(true);
    try {
      await onSubmit();
      onSuccess();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card style={{ borderColor: colors.accent }}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      {error && <Text style={styles.error}>{error}</Text>}
      <View style={styles.fields}>{children}</View>
      <Pressable style={styles.button} onPress={handleSubmit} disabled={isSubmitting}>
        {isSubmitting ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={styles.buttonText}>Create profile</Text>
        )}
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.subtitle, color: colors.textPrimary },
  description: { ...typography.caption, color: colors.textMuted, marginTop: 4, marginBottom: spacing.md },
  fields: { gap: spacing.sm },
  error: { color: colors.danger, fontSize: 13, marginBottom: spacing.sm },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    alignItems: "center",
    marginTop: spacing.md,
  },
  buttonText: { color: colors.white, fontWeight: "600" },
});
