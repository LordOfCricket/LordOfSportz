import { useCallback, useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { EmptyState } from "@/components/EmptyState";
import { useAuth } from "@/context/AuthContext";
import { apiClient, type ScheduleEntryRow } from "@/lib/api-client";
import { colors, spacing, typography } from "@/theme/tokens";

const LIVE_STATUSES = new Set(["CALLED", "READY", "IN_PROGRESS", "PAUSED"]);

/** One shared screen for player/coach/academy — which backend endpoint it calls depends on the signed-in user's role, so business logic is never duplicated per role here. */
export default function MyScheduleScreen() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<ScheduleEntryRow[]>([]);
  const [title, setTitle] = useState("Upcoming bouts");

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    if (user.roles.includes("PLAYER")) {
      setTitle("My upcoming bouts");
      setEntries(await apiClient.getMyUpcomingBouts());
    } else if (user.roles.includes("COACH")) {
      setTitle("Students' upcoming bouts");
      setEntries(await apiClient.getMyStudentsUpcomingBouts());
    } else if (user.roles.includes("ACADEMY")) {
      const academies = await apiClient.getMyAcademies();
      if (academies[0]) {
        setTitle(`${academies[0].name}'s upcoming bouts`);
        setEntries(await apiClient.getAcademyUpcomingBouts(academies[0].id));
      }
    }
    setLoading(false);
  }, [user]);

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
      <Card>
        <Text style={styles.title}>{title}</Text>
        {entries.length === 0 ? (
          <EmptyState
            title="No upcoming bouts"
            description="Once a tournament publishes its schedule, bouts will appear here."
          />
        ) : (
          entries.map((e) => (
            <View key={e.id} style={styles.row}>
              <View>
                <Text style={styles.rowTitle}>
                  {e.roundName ?? `Round ${e.roundNumber}`} · {e.redPlayerName ?? "BYE"} vs{" "}
                  {e.bluePlayerName ?? "BYE"}
                </Text>
                <Text style={styles.rowMeta}>
                  {new Date(e.scheduledAt).toLocaleString()} · {e.estimatedDurationMinutes} min
                  {e.tatami ? ` · ${e.tatami.label}` : ""}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: spacing.xs }}>
                <Badge label={e.boutStatus} tone="info" />
                {LIVE_STATUSES.has(e.boutStatus) && (
                  <Pressable onPress={() => router.push(e.discipline === "KATA" ? `/kata/${e.boutId}` : `/kumite/${e.boutId}`)}>
                    <Text style={styles.liveLink}>Live →</Text>
                  </Pressable>
                )}
              </View>
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
  title: { ...typography.subtitle, color: colors.textPrimary, marginBottom: spacing.sm },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rowTitle: { ...typography.body, fontWeight: "600", color: colors.textPrimary },
  rowMeta: { fontSize: 12, color: colors.textMuted },
  liveLink: { fontSize: 12, fontWeight: "600", color: colors.accent },
});
