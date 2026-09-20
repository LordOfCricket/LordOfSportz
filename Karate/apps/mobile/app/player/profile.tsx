import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { EmptyState } from "@/components/EmptyState";
import { useAuth } from "@/context/AuthContext";
import { apiClient, type BeltHistoryResponse } from "@/lib/api-client";
import { openCricketApp, ssoEnabled } from "@/lib/sso";
import { colors, radii, spacing, typography } from "@/theme/tokens";

export default function PlayerProfileScreen() {
  const { user, logout } = useAuth();
  const [history, setHistory] = useState<BeltHistoryResponse | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (user) void apiClient.getMyBeltHistory().then(setHistory).catch(() => undefined).finally(() => setLoaded(true));
  }, [user]);

  if (!user || !loaded) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const entries = history?.history ?? [];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card style={styles.identity}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{user.fullName.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.identityText}>
          <Text style={styles.name} numberOfLines={1}>{user.fullName}</Text>
          <Text style={styles.email} numberOfLines={1}>{user.email}</Text>
        </View>
        <Badge tone="neutral" label="Player" />
      </Card>

      <Text style={styles.sectionTitle}>Belt history</Text>
      {entries.length === 0 ? (
        <EmptyState title="No belts recorded yet" description="Verified gradings will appear here." />
      ) : (
        <Card style={styles.list}>
          {entries.map((entry, index) => (
            <View key={entry.id} style={[styles.row, index > 0 && styles.rowDivider]}>
              <Text style={styles.rowTitle}>{entry.beltGrade.name}</Text>
              <Badge tone={entry.verificationStatus === "VERIFIED" ? "success" : "neutral"} label={entry.verificationStatus} />
            </View>
          ))}
        </Card>
      )}

      <Text style={styles.sectionTitle}>Account</Text>
      <View style={styles.actions}>
        {ssoEnabled ? (
          <Pressable accessibilityRole="button" onPress={() => void openCricketApp()} style={[styles.button, styles.secondary]}>
            <Text style={styles.secondaryText}>Open LordOfCricket</Text>
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" onPress={() => void logout()} style={[styles.button, styles.danger]}>
          <Text style={styles.dangerText}>Sign out</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.lg, gap: spacing.md },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  identity: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.white, fontSize: 18, fontWeight: "700" },
  identityText: { flex: 1 },
  name: { ...typography.subtitle, color: colors.textPrimary, fontSize: 16 },
  email: { ...typography.body, color: colors.textMuted },
  sectionTitle: { ...typography.caption, color: colors.textMuted, letterSpacing: 1.5, textTransform: "uppercase", marginTop: spacing.md },
  list: { padding: 0 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  rowTitle: { ...typography.body, color: colors.textPrimary, fontWeight: "600" },
  actions: { gap: spacing.md },
  button: { paddingVertical: 14, borderRadius: radii.full, alignItems: "center", borderWidth: 1 },
  secondary: { borderColor: colors.border, backgroundColor: colors.surfaceRaised },
  secondaryText: { ...typography.subtitle, color: colors.textPrimary },
  danger: { borderColor: colors.accent },
  dangerText: { ...typography.subtitle, color: colors.accent },
});
