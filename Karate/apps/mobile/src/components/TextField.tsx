import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { colors, radii, spacing, typography } from "@/theme/tokens";

export function TextField({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} placeholderTextColor={colors.textMuted} {...props} />
    </View>
  );
}

const styles = StyleSheet.create({
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
});
