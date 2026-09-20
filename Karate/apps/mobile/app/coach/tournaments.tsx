import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { RegistrationsList } from "@/components/RegistrationsList";
import { ProfileFormCard } from "@/components/ProfileFormCard";
import { TextField } from "@/components/TextField";
import { apiClient, type CoachProfile, type RegistrationRow } from "@/lib/api-client";
import { colors, spacing } from "@/theme/tokens";

export default function CoachTournamentsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<CoachProfile | null>(null);
  const [registrations, setRegistrations] = useState<RegistrationRow[]>([]);
  const [displayName, setDisplayName] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const p = await apiClient.getCoachProfile();
    setProfile(p);
    if (p) {
      setRegistrations(await apiClient.getMyStudentsRegistrations());
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
          description="Create your profile before viewing student registrations."
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
      <Pressable onPress={() => router.push("/schedule/mine")}>
        <Text style={styles.scheduleLink}>View students&apos; upcoming bout schedule →</Text>
      </Pressable>
      <RegistrationsList
        title="Students' tournament registrations"
        registrations={registrations}
        showPlayer
        emptyDescription="Registrations submitted for players at academies you're affiliated with will appear here."
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  content: { padding: spacing.lg, gap: spacing.md },
  scheduleLink: { color: colors.accent, fontSize: 13, fontWeight: "600" },
});
