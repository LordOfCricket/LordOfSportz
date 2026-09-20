import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { EmptyState } from "@/components/EmptyState";
import { RegistrationsList } from "@/components/RegistrationsList";
import {
  apiClient,
  type RegistrationRow,
  type TournamentDetail,
  type TournamentSummary,
} from "@/lib/api-client";
import { colors, radii, spacing, typography } from "@/theme/tokens";

function CompetitionRow({
  competition,
  alreadyRegistered,
  onRegister,
}: {
  competition: TournamentDetail["competitions"][number];
  alreadyRegistered: boolean;
  onRegister: (competitionId: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const { category } = competition;

  async function handleRegister() {
    setBusy(true);
    try {
      await onRegister(competition.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.row}>
      <View style={styles.info}>
        <Text style={styles.name}>{competition.name}</Text>
        <Text style={styles.meta}>
          {competition.discipline} · {category.genderRestriction}
          {category.ageMin || category.ageMax
            ? ` · Age ${category.ageMin ?? "-"}-${category.ageMax ?? "-"}`
            : ""}
        </Text>
      </View>
      {alreadyRegistered ? (
        <Badge label="Registered" tone="success" />
      ) : (
        <Pressable style={styles.registerButton} onPress={handleRegister} disabled={busy}>
          {busy ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.registerText}>Register</Text>
          )}
        </Pressable>
      )}
    </View>
  );
}

export default function PlayerTournamentsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [tournaments, setTournaments] = useState<TournamentSummary[]>([]);
  const [selected, setSelected] = useState<TournamentDetail | null>(null);
  const [registrations, setRegistrations] = useState<RegistrationRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [t, r] = await Promise.all([apiClient.listOpenTournaments(), apiClient.getMyRegistrations()]);
    setTournaments(t);
    setRegistrations(r);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function openTournament(id: string) {
    setLoading(true);
    const detail = await apiClient.getTournamentDetail(id);
    setSelected(detail);
    setLoading(false);
  }

  async function handleRegister(competitionId: string) {
    setError(null);
    try {
      await apiClient.createRegistration(competitionId);
      const r = await apiClient.getMyRegistrations();
      setRegistrations(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit the registration.");
    }
  }

  async function handleWithdraw(registrationId: string) {
    setError(null);
    try {
      await apiClient.withdrawRegistration(registrationId);
      const r = await apiClient.getMyRegistrations();
      setRegistrations(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not withdraw the registration.");
    }
  }

  async function handleReevaluate(registrationId: string) {
    setError(null);
    try {
      await apiClient.reevaluateEligibility(registrationId);
      const r = await apiClient.getMyRegistrations();
      setRegistrations(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not re-check eligibility.");
    }
  }

  const registeredCompetitionIds = new Set(registrations.map((r) => r.competition.id));

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.push("/schedule/mine")}>
        <Text style={styles.backLink}>View my upcoming bout schedule →</Text>
      </Pressable>
      {error && (
        <Card>
          <Text style={styles.errorText}>{error}</Text>
        </Card>
      )}

      {selected ? (
        <Card>
          <Pressable onPress={() => setSelected(null)}>
            <Text style={styles.backLink}>← All tournaments</Text>
          </Pressable>
          <Text style={styles.title}>{selected.name}</Text>
          <Text style={styles.meta}>
            {[selected.venue, selected.countryCode].filter(Boolean).join(", ") || "Venue to be announced"}
          </Text>
          {selected.competitions.length === 0 ? (
            <EmptyState title="No categories published yet" />
          ) : (
            selected.competitions.map((c) => (
              <CompetitionRow
                key={c.id}
                competition={c}
                alreadyRegistered={registeredCompetitionIds.has(c.id)}
                onRegister={handleRegister}
              />
            ))
          )}
        </Card>
      ) : (
        <Card>
          <Text style={styles.title}>Open tournaments</Text>
          {tournaments.length === 0 ? (
            <EmptyState
              title="No tournaments open for registration"
              description="New tournaments will appear here once organizers open registration."
            />
          ) : (
            tournaments.map((t) => (
              <View key={t.id} style={styles.row}>
                <View style={styles.info}>
                  <Text style={styles.name}>{t.name}</Text>
                  <Text style={styles.meta}>
                    {[t.venue, t.countryCode].filter(Boolean).join(", ") || "Venue to be announced"}
                  </Text>
                </View>
                <Pressable style={styles.viewButton} onPress={() => openTournament(t.id)}>
                  <Text style={styles.viewText}>View</Text>
                </Pressable>
              </View>
            ))
          )}
        </Card>
      )}

      <RegistrationsList
        title="My registrations"
        registrations={registrations}
        onWithdraw={handleWithdraw}
        onReevaluate={handleReevaluate}
        emptyDescription="Register for an open tournament above to see your status here."
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  content: { padding: spacing.lg, gap: spacing.md },
  title: { ...typography.subtitle, color: colors.textPrimary, marginBottom: spacing.sm },
  backLink: { color: colors.accent, fontSize: 12, marginBottom: spacing.sm },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  info: { flex: 1, gap: 2 },
  name: { ...typography.body, fontWeight: "600", color: colors.textPrimary },
  meta: { fontSize: 12, color: colors.textMuted },
  registerButton: {
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  registerText: { color: colors.white, fontWeight: "600", fontSize: 12 },
  viewButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  viewText: { color: colors.textPrimary, fontWeight: "600", fontSize: 12 },
  errorText: { color: colors.danger, fontSize: 13 },
});
