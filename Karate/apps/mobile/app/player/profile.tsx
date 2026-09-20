import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/context/AuthContext";
import { apiClient, type BeltHistoryResponse } from "@/lib/api-client";
import { colors, spacing, typography } from "@/theme/tokens";

export default function PlayerProfileScreen() {
  const { user, logout } = useAuth(); const [history, setHistory] = useState<BeltHistoryResponse | null>(null); const [loaded, setLoaded] = useState(false);
  useEffect(() => { if (user) void apiClient.getMyBeltHistory().then(setHistory).catch(() => undefined).finally(() => setLoaded(true)); }, [user]);
  if (!user || !loaded) return <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>;
  return <ScrollView contentContainerStyle={styles.content}><Text style={styles.title}>Profile</Text>{(history?.history ?? []).map((entry) => <View key={entry.id} style={styles.row}><Text style={styles.name}>{entry.beltGrade.name}</Text><Text style={styles.muted}>{entry.verificationStatus}</Text></View>)}<Pressable accessibilityRole="button" onPress={() => void logout()} style={styles.signOut}><Text style={styles.signOutText}>Sign out</Text></Pressable></ScrollView>;
}
const styles = StyleSheet.create({ center: { flex: 1, alignItems: "center", justifyContent: "center" }, content: { padding: spacing.lg, gap: spacing.md }, title: { ...typography.title, color: colors.textPrimary }, row: { paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }, name: { ...typography.body, color: colors.textPrimary }, muted: { ...typography.caption, color: colors.textMuted }, signOut: { marginTop: spacing.lg, paddingVertical: spacing.md, alignItems: "center", borderRadius: 8, borderWidth: 1, borderColor: colors.accent }, signOutText: { ...typography.body, color: colors.accent } });
