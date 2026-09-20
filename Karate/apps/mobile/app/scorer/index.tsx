import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { EmptyState } from "@/components/EmptyState";
import { TextField } from "@/components/TextField";
import { ProfileFormCard } from "@/components/ProfileFormCard";
import { apiClient, type OfficialAssignmentRow, type ScorerProfile } from "@/lib/api-client";
import { colors, spacing, typography } from "@/theme/tokens";

const VERIFICATION_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  VERIFIED: "success",
  PENDING: "warning",
  UNVERIFIED: "neutral",
  REJECTED: "danger",
};

const ASSIGNMENT_TONE: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = {
  ASSIGNED: "warning",
  CONFIRMED: "success",
  DECLINED: "danger",
  COMPLETED: "info",
  REVOKED: "danger",
};

export default function ScorerOverviewScreen() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ScorerProfile | null>(null);
  const [assignments, setAssignments] = useState<OfficialAssignmentRow[]>([]);
  const [displayName, setDisplayName] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const p = await apiClient.getScorerProfile();
    setProfile(p);
    if (p) {
      setAssignments(await apiClient.getMyAssignments());
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

  if (!profile) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <ProfileFormCard
          title="Complete your scorer profile"
          description="Create your profile to become eligible for tournament officiating assignments."
          onSubmit={() => apiClient.createScorerProfile({ displayName })}
          onSuccess={load}
        >
          <TextField label="Display name" value={displayName} onChangeText={setDisplayName} />
        </ProfileFormCard>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card>
        <Text style={styles.cardTitle}>Scorer profile</Text>
        <Text style={styles.bold}>{profile.displayName}</Text>
        <Badge label={profile.status} tone={profile.status === "ACTIVE" ? "success" : "neutral"} />
      </Card>

      <Card>
        <Text style={styles.cardTitle}>Verification status</Text>
        <View style={{ marginTop: spacing.sm }}>
          <Badge
            label={profile.verificationStatus}
            tone={VERIFICATION_TONE[profile.verificationStatus] ?? "neutral"}
          />
        </View>
        <Text style={styles.muted}>Tournament assignments unlock once your credentials are verified.</Text>
      </Card>

      <Card>
        <Text style={styles.cardTitle}>My assignments</Text>
        {assignments.length === 0 ? (
          <EmptyState
            title="No assignments yet"
            description="Tournament organizers will assign you an official function here."
          />
        ) : (
          assignments.map((a) => (
            <View key={a.id} style={styles.assignmentRow}>
              <View>
                <Text style={styles.bold}>
                  {a.tournament?.name ?? "Tournament"} · {a.function}
                </Text>
                <Text style={styles.muted}>
                  {a.tatami ? `${a.tatami.label} · ` : ""}
                  {a.startAt ? new Date(a.startAt).toLocaleString() : "No fixed window"}
                </Text>
              </View>
              <Badge label={a.status} tone={ASSIGNMENT_TONE[a.status] ?? "neutral"} />
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
  cardTitle: { ...typography.subtitle, color: colors.textPrimary },
  bold: {
    ...typography.body,
    fontWeight: "600",
    color: colors.textPrimary,
    marginTop: 4,
    marginBottom: spacing.sm,
  },
  muted: { ...typography.caption, color: colors.textMuted, marginTop: spacing.sm },
  assignmentRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
