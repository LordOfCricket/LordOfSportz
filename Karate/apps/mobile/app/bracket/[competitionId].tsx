import { useCallback, useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { EmptyState } from "@/components/EmptyState";
import { useAuth } from "@/context/AuthContext";
import { apiClient, type DrawDetail } from "@/lib/api-client";
import { colors, spacing, typography } from "@/theme/tokens";

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = {
  DRAFT: "neutral",
  PUBLISHED: "info",
  LOCKED: "success",
  SUPERSEDED: "danger",
};

export default function BracketScreen() {
  const { competitionId } = useLocalSearchParams<{ competitionId: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [draw, setDraw] = useState<DrawDetail | null>(null);

  const load = useCallback(async () => {
    if (!competitionId) return;
    setLoading(true);
    setDraw(await apiClient.getDraw(competitionId));
    setLoading(false);
  }, [competitionId]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    load();
  }, [authLoading, user, load, router]);

  if (authLoading || loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {!draw ? (
        <Card>
          <EmptyState
            title="No draw yet"
            description="A bracket will appear here once the organizer generates one."
          />
        </Card>
      ) : (
        <Card>
          <View style={styles.header}>
            <Text style={styles.title}>
              {draw.bracketType === "SINGLE_ELIMINATION" ? "Single elimination" : "Round robin"} · v
              {draw.version}
            </Text>
            <Badge label={draw.status} tone={STATUS_TONE[draw.status] ?? "neutral"} />
          </View>
          {draw.rounds.map((round) => (
            <View key={round.id} style={styles.roundBlock}>
              <Text style={styles.roundTitle}>{round.name ?? `Round ${round.roundNumber}`}</Text>
              {round.bouts.map((bout) => (
                <View key={bout.id} style={styles.boutRow}>
                  <Text style={styles.boutText}>
                    {bout.redPlayerName ?? "BYE"} vs {bout.bluePlayerName ?? "BYE"}
                  </Text>
                  <Badge label={bout.isBye ? "BYE" : bout.status} tone={bout.isBye ? "neutral" : "info"} />
                </View>
              ))}
            </View>
          ))}
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  content: { padding: spacing.lg, gap: spacing.md },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  title: { ...typography.subtitle, color: colors.textPrimary },
  roundBlock: { marginTop: spacing.sm, gap: spacing.xs },
  roundTitle: { ...typography.body, fontWeight: "600", color: colors.textPrimary },
  boutRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  boutText: { fontSize: 13, color: colors.textSecondary },
});
