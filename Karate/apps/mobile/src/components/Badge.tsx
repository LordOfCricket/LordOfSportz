import { StyleSheet, Text, View } from "react-native";
import { colors, radii, spacing } from "@/theme/tokens";

type Tone = "neutral" | "success" | "warning" | "danger" | "info";

const TONE_COLORS: Record<Tone, string> = {
  neutral: colors.textSecondary,
  success: colors.success,
  warning: colors.warning,
  danger: colors.danger,
  info: colors.info,
};

export function Badge({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  const tint = TONE_COLORS[tone];
  return (
    <View style={[styles.badge, { borderColor: tint }]}>
      <Text style={[styles.label, { color: tint }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderWidth: 1,
    borderRadius: radii.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
  label: { fontSize: 12, fontWeight: "600" },
});
