import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { apiClient, type RankingCategoryRow, type RankingRow } from "@/lib/api-client";
import { colors, spacing, typography } from "@/theme/tokens";

export default function PlayerRankingsScreen() {
  const [category, setCategory] = useState<RankingCategoryRow | null>(null);
  const [rows, setRows] = useState<RankingRow[]>([]);
  useEffect(() => { void apiClient.getRankingCategories().then(async (categories) => { const first = categories[0] ?? null; setCategory(first); if (first) setRows(await apiClient.getRanking(first.id)); }); }, []);
  if (!category) return <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>;
  return <FlatList data={rows} keyExtractor={(row) => row.player.id} contentContainerStyle={styles.content} ListHeaderComponent={<View><Text style={styles.title}>Rankings</Text><Text style={styles.muted}>{category.rankingSeason.rankingSystem.name} · {category.rankingSeason.season.name}</Text></View>} renderItem={({ item }) => <View style={styles.row}><Text style={styles.name}>{item.rank}. {item.player.displayName}</Text><Text style={styles.points}>{item.points} pts</Text></View>} ListEmptyComponent={<Text style={styles.muted}>No ranking entries available.</Text>} />;
}
const styles = StyleSheet.create({ center: { flex: 1, alignItems: "center", justifyContent: "center" }, content: { padding: spacing.lg, gap: spacing.md }, title: { ...typography.title, color: colors.textPrimary }, muted: { ...typography.caption, color: colors.textMuted }, row: { paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: "row", justifyContent: "space-between" }, name: { ...typography.body, color: colors.textPrimary }, points: { ...typography.subtitle, color: colors.accent } });