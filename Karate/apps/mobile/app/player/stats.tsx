import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/context/AuthContext";
import { apiClient, type PlayerStatsSummary } from "@/lib/api-client";
import { colors, spacing, typography } from "@/theme/tokens";

export default function PlayerStatsScreen() {
  const { user } = useAuth();
  const [stats, setStats] = useState<PlayerStatsSummary | null>(null);
  useEffect(() => { if (user) void apiClient.getMyStats().then(setStats); }, [user]);
  if (!user) return <View style={styles.center}><Text>Sign in to view statistics.</Text></View>;
  if (!stats) return <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>;
  return <View style={styles.content}><Text style={styles.title}>Player statistics</Text><View style={styles.grid}>{[["Appearances", stats.appearances], ["Wins", stats.wins], ["Losses", stats.losses], ["Win rate", `${Math.round(stats.winRate * 100)}%`], ["Kumite", stats.kumiteBouts], ["Kata", stats.kataBouts], ["Scored", stats.pointsScored], ["Conceded", stats.pointsConceded]].map(([label, value]) => <View key={label} style={styles.tile}><Text style={styles.muted}>{label}</Text><Text style={styles.value}>{value}</Text></View>)}</View></View>;
}
const styles = StyleSheet.create({ center: { flex: 1, alignItems: "center", justifyContent: "center" }, content: { padding: spacing.lg, gap: spacing.lg }, title: { ...typography.title, color: colors.textPrimary }, grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md }, tile: { width: "47%", padding: spacing.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised }, muted: { ...typography.caption, color: colors.textMuted }, value: { ...typography.statValue, color: colors.textPrimary, marginTop: spacing.xs } });