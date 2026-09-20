import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { TextField } from "@/components/TextField";
import { ProfileFormCard } from "@/components/ProfileFormCard";
import { MembershipList } from "@/components/MembershipList";
import { AcademySearchBox } from "@/components/AcademySearchBox";
import { StudentsGradesList } from "@/components/StudentsGradesList";
import {
  apiClient,
  type CoachProfile,
  type MembershipRow,
  type PendingRequestRow,
  type StudentGrade,
} from "@/lib/api-client";
import { colors, spacing, typography } from "@/theme/tokens";

export default function CoachOverviewScreen() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<CoachProfile | null>(null);
  const [affiliations, setAffiliations] = useState<MembershipRow[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequestRow[]>([]);
  const [students, setStudents] = useState<StudentGrade[]>([]);
  const [displayName, setDisplayName] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const p = await apiClient.getCoachProfile();
    setProfile(p);
    if (p) {
      const [a, r, s] = await Promise.all([
        apiClient.getCoachAffiliations(),
        apiClient.getCoachPendingRequests(),
        apiClient.getMyStudentsGrades(),
      ]);
      setAffiliations(a);
      setPendingRequests(r);
      setStudents(s);
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
          title="Complete your coach profile"
          description="Create your profile before affiliating with an academy."
          onSubmit={() => apiClient.createCoachProfile({ displayName })}
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
        <Text style={styles.cardTitle}>Coach profile</Text>
        <Text style={styles.bold}>{profile.displayName}</Text>
        <Badge label={profile.status} tone={profile.status === "ACTIVE" ? "success" : "neutral"} />
      </Card>

      <StudentsGradesList students={students} />

      <MembershipList memberships={affiliations} pendingRequests={pendingRequests} />
      {affiliations.length === 0 && pendingRequests.length === 0 && <AcademySearchBox onJoined={load} />}
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
});
