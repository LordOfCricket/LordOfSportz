import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/context/AuthContext";
import { apiClient, type BeltHistoryResponse } from "@/lib/api-client";
import { colors, spacing, typography } from "@/theme/tokens";

export default function PlayerProfileScreen() {
  const { user } = useAuth(); const [history, setHistory] = useState<BeltHistoryResponse | null>(null);
  useEffect(() => { if (user) void apiClient.getMyBeltHistory().then(setHistory); }, [user]);
  if (!user || !history) return <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>;
  return <ScrollView contentContainerStyle={styles.content}><Text style={styles.title}>Profile</Text>{history.history.map((entry) => <View key={entry.id} style={styles.row}><Text style={styles.name}>{entry.beltGrade.name}</Text><Text style={styles.muted}>{entry.verificationStatus}</Text></View>)}</ScrollView>;
}
const styles = StyleSheet.create({ center: { flex: 1, alignItems: "center", justifyContent: "center" }, content: { padding: spacing.lg, gap: spacing.md }, title: { ...typography.title, color: colors.textPrimary }, row: { paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }, name: { ...typography.body, color: colors.textPrimary }, muted: { ...typography.caption, color: colors.textMuted } });
