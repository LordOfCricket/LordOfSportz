import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/context/AuthContext";
import { apiClient, type PlayerResultRow } from "@/lib/api-client";
import { colors, spacing, typography } from "@/theme/tokens";

export default function PlayerResultsScreen() {
  const { user } = useAuth();
  const [rows, setRows] = useState<PlayerResultRow[]>([]);
  useEffect(() => { if (user) void apiClient.getMyResults().then(setRows); }, [user]);
  if (!user) return <View style={styles.center}><Text>Sign in to view results.</Text></View>;
  return <FlatList data={rows} keyExtractor={(row) => row.boutId} contentContainerStyle={styles.content} ListHeaderComponent={<Text style={styles.title}>Results history</Text>} ListEmptyComponent={<Text style={styles.muted}>No finalized results yet.</Text>} renderItem={({ item }) => <View style={styles.row}><View><Text style={styles.name}>{item.tournament.name}</Text><Text style={styles.muted}>{item.discipline} · vs {item.opponent?.displayName ?? "Team"}</Text></View><Text style={item.result.winnerPlayerId === item.playerId ? styles.win : styles.loss}>{item.result.method}</Text></View>} />;
}

const styles = StyleSheet.create({ center: { flex: 1, alignItems: "center", justifyContent: "center" }, content: { padding: spacing.lg, gap: spacing.md }, title: { ...typography.title, color: colors.textPrimary }, row: { borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: spacing.md, flexDirection: "row", justifyContent: "space-between" }, name: { ...typography.body, color: colors.textPrimary }, muted: { ...typography.caption, color: colors.textMuted }, win: { color: colors.success, fontWeight: "700" }, loss: { color: colors.danger, fontWeight: "700" } });
