import { StyleSheet, Text, View } from "react-native";
import { Card } from "./Card";
import { Badge } from "./Badge";
import { EmptyState } from "./EmptyState";
import { colors, spacing, typography } from "@/theme/tokens";
import type { BeltHistoryResponse } from "@/lib/api-client";

const VERIFICATION_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  VERIFIED: "success",
  PENDING: "warning",
  UNVERIFIED: "neutral",
  REJECTED: "danger",
};

export function BeltHistoryCard({ data }: { data: BeltHistoryResponse | null }) {
  if (!data || !data.current) {
    return (
      <Card>
        <Text style={styles.title}>Belt & grade</Text>
        <EmptyState title="No grade on record" description="Awarded grades will appear here." />
      </Card>
    );
  }

  return (
    <Card>
      <View style={styles.row}>
        <Text style={styles.title}>Current grade</Text>
        <Badge
          label={data.current.verificationStatus}
          tone={VERIFICATION_TONE[data.current.verificationStatus] ?? "neutral"}
        />
      </View>
      <Text style={styles.grade}>{data.current.beltGrade.name}</Text>
      <Text style={styles.muted}>Awarded {new Date(data.current.awardedDate).toLocaleDateString()}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  title: { ...typography.subtitle, color: colors.textPrimary },
  grade: { ...typography.body, fontWeight: "600", color: colors.textPrimary, marginTop: 4 },
  muted: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
});
