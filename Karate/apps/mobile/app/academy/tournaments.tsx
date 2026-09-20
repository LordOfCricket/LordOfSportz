import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { RegistrationsList } from "@/components/RegistrationsList";
import { ProfileFormCard } from "@/components/ProfileFormCard";
import { TextField } from "@/components/TextField";
import { apiClient, type MyAcademy, type RegistrationRow } from "@/lib/api-client";
import { colors, spacing } from "@/theme/tokens";

export default function AcademyTournamentsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [academy, setAcademy] = useState<MyAcademy | null>(null);
  const [registrations, setRegistrations] = useState<RegistrationRow[]>([]);
  const [name, setName] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const mine = await apiClient.getMyAcademies();
    const primary = mine[0] ?? null;
    setAcademy(primary);
    if (primary) {
      setRegistrations(await apiClient.getAcademyRegistrations(primary.id));
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

  if (!academy) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <ProfileFormCard
          title="Set up your academy"
          description="Create your academy's organization profile."
          onSubmit={() => apiClient.createAcademy({ name })}
          onSuccess={load}
        >
          <TextField label="Academy name" value={name} onChangeText={setName} />
        </ProfileFormCard>
      </ScrollView>
    );
  }

  async function handleWithdraw(registrationId: string) {
    await apiClient.withdrawRegistration(registrationId);
    setRegistrations(await apiClient.getAcademyRegistrations(academy!.id));
  }

  async function handleReevaluate(registrationId: string) {
    await apiClient.reevaluateEligibility(registrationId);
    setRegistrations(await apiClient.getAcademyRegistrations(academy!.id));
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.push("/schedule/mine")}>
        <Text style={styles.scheduleLink}>View players&apos; upcoming bout schedule →</Text>
      </Pressable>
      <RegistrationsList
        title={`${academy.name}'s tournament registrations`}
        registrations={registrations}
        showPlayer
        onWithdraw={handleWithdraw}
        onReevaluate={handleReevaluate}
        emptyDescription="Registrations submitted for your players will appear here."
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
