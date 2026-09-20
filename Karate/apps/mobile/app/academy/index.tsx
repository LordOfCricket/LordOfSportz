import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { StatTile } from "@/components/StatTile";
import { EmptyState } from "@/components/EmptyState";
import { TextField } from "@/components/TextField";
import { ProfileFormCard } from "@/components/ProfileFormCard";
import {
  apiClient,
  type AcademyDetail,
  type GradingEventRow,
  type IncomingRequestRow,
  type MyAcademy,
} from "@/lib/api-client";
import { colors, radii, spacing, typography } from "@/theme/tokens";

function RequestRow({
  academyId,
  request,
  onResolved,
}: {
  academyId: string;
  request: IncomingRequestRow;
  onResolved: () => void;
}) {
  const [pending, setPending] = useState<"ACCEPT" | "REJECT" | null>(null);

  async function resolve(action: "ACCEPT" | "REJECT") {
    setPending(action);
    try {
      await apiClient.resolveMembershipRequest(academyId, request.id, action);
      onResolved();
    } finally {
      setPending(null);
    }
  }

  return (
    <View style={styles.requestRow}>
      <View>
        <Text style={styles.requestName}>{request.applicant?.displayName ?? "Unknown"}</Text>
        <Badge label={request.targetType} tone="neutral" />
      </View>
      <View style={{ flexDirection: "row", gap: spacing.xs }}>
        <Pressable style={styles.acceptButton} onPress={() => resolve("ACCEPT")} disabled={pending !== null}>
          {pending === "ACCEPT" ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.acceptText}>Accept</Text>
          )}
        </Pressable>
        <Pressable style={styles.rejectButton} onPress={() => resolve("REJECT")} disabled={pending !== null}>
          {pending === "REJECT" ? (
            <ActivityIndicator color={colors.textPrimary} />
          ) : (
            <Text style={styles.rejectText}>Reject</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

export default function AcademyOverviewScreen() {
  const [loading, setLoading] = useState(true);
  const [academy, setAcademy] = useState<MyAcademy | null>(null);
  const [detail, setDetail] = useState<AcademyDetail | null>(null);
  const [requests, setRequests] = useState<IncomingRequestRow[]>([]);
  const [gradingEvents, setGradingEvents] = useState<GradingEventRow[]>([]);
  const [name, setName] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const mine = await apiClient.getMyAcademies();
    const primary = mine[0] ?? null;
    setAcademy(primary);
    if (primary) {
      const [d, r, g] = await Promise.all([
        apiClient.getAcademyDetail(primary.id),
        apiClient.getAcademyPendingRequests(primary.id),
        apiClient.getAcademyGradingEvents(primary.id),
      ]);
      setDetail(d);
      setRequests(r);
      setGradingEvents(g);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!academy) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <ProfileFormCard
          title="Set up your academy"
          description="Create your academy's organization profile."
          onSubmit={() => apiClient.createAcademy({ name })}
          onSuccess={load}
        >
          <TextField label="Academy name" value={name} onChangeText={setName} />
        </ProfileFormCard>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card>
        <Text style={styles.cardTitle}>{academy.name}</Text>
        <Badge label={academy.status} tone={academy.status === "ACTIVE" ? "success" : "neutral"} />
      </Card>

      <View style={styles.statsGrid}>
        <StatTile label="Players" value={detail?.playerCount ?? 0} />
        <StatTile label="Coaches" value={detail?.coachCount ?? 0} />
        <StatTile label="Pending" value={requests.length} />
      </View>

      <Card>
        <Text style={styles.cardTitle}>Pending requests</Text>
        {requests.length === 0 ? (
          <EmptyState title="No pending requests" description="Coach and player requests appear here." />
        ) : (
          requests.map((r) => <RequestRow key={r.id} academyId={academy.id} request={r} onResolved={load} />)
        )}
      </Card>

      <Card>
        <Text style={styles.cardTitle}>Grading events</Text>
        {gradingEvents.length === 0 ? (
          <EmptyState title="No grading events yet" description="Create one from the web dashboard." />
        ) : (
          gradingEvents.map((e) => (
            <View key={e.id} style={styles.requestRow}>
              <Text style={styles.requestName}>{e.name}</Text>
              <Badge label={e.status} tone="neutral" />
            </View>
          ))
        )}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  content: { padding: spacing.lg, gap: spacing.md },
  cardTitle: { ...typography.subtitle, color: colors.textPrimary, marginBottom: spacing.sm },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  requestRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  requestName: { ...typography.body, fontWeight: "600", color: colors.textPrimary, marginBottom: 4 },
  acceptButton: {
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  acceptText: { color: colors.white, fontWeight: "600", fontSize: 12 },
  rejectButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  rejectText: { color: colors.textPrimary, fontWeight: "600", fontSize: 12 },
});
