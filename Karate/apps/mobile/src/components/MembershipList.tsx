import { StyleSheet, Text, View } from "react-native";
import { Card } from "./Card";
import { Badge } from "./Badge";
import { EmptyState } from "./EmptyState";
import { colors, spacing, typography } from "@/theme/tokens";
import type { MembershipRow, PendingRequestRow } from "@/lib/api-client";

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  ACTIVE: "success",
  PENDING: "warning",
  INVITED: "warning",
  LEFT: "neutral",
  TRANSFERRED: "neutral",
  SUSPENDED: "danger",
  REJECTED: "danger",
};

export function MembershipList({
  memberships,
  pendingRequests,
}: {
  memberships: MembershipRow[];
  pendingRequests: PendingRequestRow[];
}) {
  return (
    <Card>
      <Text style={styles.title}>Academy relationship</Text>
      {memberships.length === 0 && pendingRequests.length === 0 && (
        <EmptyState
          title="No academy relationship yet"
          description="Search for an academy below to request to join."
        />
      )}
      {pendingRequests.map((r) => (
        <View key={r.id} style={styles.row}>
          <Text style={styles.name}>{r.academy.name}</Text>
          <Badge label="PENDING" tone="warning" />
        </View>
      ))}
      {memberships.map((m) => (
        <View key={m.id} style={styles.row}>
          <Text style={styles.name}>{m.academy.name}</Text>
          <Badge label={m.status} tone={STATUS_TONE[m.status] ?? "neutral"} />
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.subtitle, color: colors.textPrimary, marginBottom: spacing.sm },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  name: { ...typography.body, fontWeight: "600", color: colors.textPrimary },
});
