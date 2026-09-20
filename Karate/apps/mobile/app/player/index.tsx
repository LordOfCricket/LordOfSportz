import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { TextField } from "@/components/TextField";
import { ProfileFormCard } from "@/components/ProfileFormCard";
import { MembershipList } from "@/components/MembershipList";
import { AcademySearchBox } from "@/components/AcademySearchBox";
import { BeltHistoryCard } from "@/components/BeltHistoryCard";
import {
  apiClient,
  type BeltHistoryResponse,
  type MembershipRow,
  type PendingRequestRow,
  type PlayerProfile,
} from "@/lib/api-client";
import { useAuth } from "@/context/AuthContext";
import { colors, spacing, typography } from "@/theme/tokens";

export default function PlayerOverviewScreen() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [memberships, setMemberships] = useState<MembershipRow[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequestRow[]>([]);
  const [beltHistory, setBeltHistory] = useState<BeltHistoryResponse | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const p = await apiClient.getPlayerProfile();
    setProfile(p);
    if (p) {
      const [m, r, h] = await Promise.all([
        apiClient.getPlayerMemberships(),
        apiClient.getPlayerPendingRequests(),
        apiClient.getMyBeltHistory(),
      ]);
      setMemberships(m);
      setPendingRequests(r);
      setBeltHistory(h);
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
          title="Complete your player profile"
          description="Tell us who you are so academies and coaches can find you."
          onSubmit={() => apiClient.createPlayerProfile({ displayName, dateOfBirth, gender: "MALE" })}
          onSuccess={load}
        >
          <TextField label="Display name" value={displayName} onChangeText={setDisplayName} />
          <TextField
            label="Date of birth (YYYY-MM-DD)"
            value={dateOfBirth}
            onChangeText={setDateOfBirth}
            placeholder="2005-06-15"
          />
        </ProfileFormCard>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card>
        <Text style={styles.cardTitle}>Player profile</Text>
        <Text style={styles.bold}>{profile.displayName}</Text>
        <Text style={styles.muted}>{user?.email}</Text>
        <Badge label={profile.status} tone={profile.status === "ACTIVE" ? "success" : "neutral"} />
      </Card>

      <BeltHistoryCard data={beltHistory} />

      <MembershipList memberships={memberships} pendingRequests={pendingRequests} />
      {memberships.length === 0 && pendingRequests.length === 0 && <AcademySearchBox onJoined={load} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  content: { padding: spacing.lg, gap: spacing.md },
  cardTitle: { ...typography.subtitle, color: colors.textPrimary },
  bold: { ...typography.body, fontWeight: "600", color: colors.textPrimary, marginTop: 4 },
  muted: { ...typography.caption, color: colors.textMuted, marginTop: 2, marginBottom: spacing.sm },
});
