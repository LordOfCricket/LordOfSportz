import { useCallback, useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { EmptyState } from "@/components/EmptyState";
import { ConnectionIndicator } from "@/components/ConnectionIndicator";
import { useAuth } from "@/context/AuthContext";
import { apiClient, type BoutDetailRow, type KataLiveState } from "@/lib/api-client";
import { connectToBoutRealtime } from "@/lib/realtime-client";
import { colors, spacing, typography } from "@/theme/tokens";

function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const SCORE_STEPS = [5.0, 5.5, 6.0, 6.5, 7.0, 7.5, 8.0, 8.5, 9.0, 9.5, 10.0];

/**
 * Kata's mobile screen is performance-first (spec section 19/23): a Judge
 * enters one score per athlete after each performance ends — there is no
 * clock or point ledger to watch, unlike the Kumite scorer screen. Large
 * tap-to-pick score buttons, not a keyboard, for touch reliability.
 */
export default function KataMobileScreen() {
  const { boutId } = useLocalSearchParams<{ boutId: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [bout, setBout] = useState<BoutDetailRow | null>(null);
  const [live, setLive] = useState<KataLiveState | null>(null);
  const [connection, setConnection] = useState<"CONNECTED" | "RECONNECTING" | "OFFLINE">("CONNECTED");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!boutId) return;
    const [b, k] = await Promise.all([apiClient.getBout(boutId), apiClient.getKataState(boutId)]);
    setBout(b);
    if (k) {
      setLive(k);
      setConnection("CONNECTED");
    } else {
      setConnection("RECONNECTING");
    }
    setLoading(false);
  }, [boutId]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    load();
  }, [authLoading, user, load, router]);

  useEffect(() => {
    const poll = setInterval(load, 4000);
    return () => clearInterval(poll);
  }, [load]);

  useEffect(() => {
    if (!boutId || authLoading || !user) return;
    let cancelled = false;
    let disconnect: () => void = () => undefined;
    void connectToBoutRealtime(boutId, {
      onEvent: load,
      onState: (state) => {
        if (!cancelled) setConnection(state);
      },
    }).then((cleanup) => {
      if (cancelled) cleanup();
      else disconnect = cleanup;
    });
    return () => {
      cancelled = true;
      disconnect();
    };
  }, [authLoading, boutId, load, user]);

  async function runAction<T>(action: () => Promise<T>) {
    setBusy(true);
    try {
      const result = await action();
      if (result && typeof result === "object" && "evaluations" in (result as object)) {
        setLive(result as unknown as KataLiveState);
      } else {
        await load();
      }
    } catch (err) {
      Alert.alert("Action failed", err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  function confirmAndRun(title: string, action: () => Promise<unknown>) {
    Alert.alert(title, "Are you sure? This finalizes the performance.", [
      { text: "Cancel", style: "cancel" },
      { text: "Confirm", style: "destructive", onPress: () => runAction(action) },
    ]);
  }

  if (authLoading || loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const redName = bout?.redPlayer?.displayName ?? bout?.redTeam?.name ?? null;
  const blueName = bout?.bluePlayer?.displayName ?? bout?.blueTeam?.name ?? null;

  if (!bout || !live || !redName || !blueName) {
    return (
      <View style={styles.screen}>
        <EmptyState title="Performance unavailable" description="This bout could not be loaded, or has a bye slot." />
      </View>
    );
  }

  if (live.status === "FINISHED" || live.status === "FINALIZED") {
    return (
      <View style={styles.screen}>
        <Card>
          <Text style={styles.title}>Performance finalized</Text>
          <Text style={styles.meta}>
            {live.redVotes} votes — {live.blueVotes} votes
          </Text>
          <Badge label={live.status} tone="success" />
        </Card>
      </View>
    );
  }

  const isJudge = live.myOfficialFunction === "JUDGE";
  const redId = live.redPlayerId ?? live.redTeam?.id ?? null;
  const blueId = live.bluePlayerId ?? live.blueTeam?.id ?? null;
  const bunkai = live.performance.bunkaiRequired;

  async function submitScore(targetId: string | null, score: number, phase: "KATA" | "BUNKAI" = "KATA") {
    if (!targetId) return;
    const myEval = live!.evaluations.find(
      (e) =>
        (e.targetPlayerId === targetId || e.targetTeamId === targetId) &&
        e.phase === phase &&
        e.officialAssignmentId === live!.myOfficialAssignmentId &&
        !live!.evaluations.some((c) => c.correctionOfId === e.id),
    );
    if (myEval) {
      await runAction(() =>
        apiClient.correctJudgeEvaluation(boutId!, { evaluationId: myEval.id, score, isDisqualification: false, clientOperationId: uuid() }),
      );
    } else {
      await runAction(() => apiClient.submitJudgeEvaluation(boutId!, { targetPlayerId: targetId, score, isDisqualification: false, phase, clientOperationId: uuid() }));
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <ConnectionIndicator state={connection} />
      <Card>
        <Text style={styles.title}>
          {redName} vs {blueName}
        </Text>
        <Text style={styles.meta}>AKA Kata: {live.performance.redKata?.name ?? "Not yet announced"}</Text>
        <Text style={styles.meta}>AO Kata: {live.performance.blueKata?.name ?? "Not yet announced"}</Text>
        {bunkai && <Badge label="Bunkai required" tone="info" />}
        <Text style={styles.meta}>
          {live.status} · Your function: {live.myOfficialFunction ?? "Spectator"}
        </Text>
        <Text style={styles.meta}>
          Votes — AKA {live.redVotes} · AO {live.blueVotes} (of {live.panelOfficials.length} Judges)
        </Text>
      </Card>

      {isJudge && (
        <>
          <Card>
            <Text style={styles.cardTitle}>Score AKA (Kata)</Text>
            <View style={styles.scoreGrid}>
              {SCORE_STEPS.map((s) => (
                <BigButton key={s} label={s.toFixed(1)} disabled={busy} onPress={() => submitScore(redId, s, "KATA")} />
              ))}
            </View>
          </Card>
          <Card>
            <Text style={styles.cardTitle}>Score AO (Kata)</Text>
            <View style={styles.scoreGrid}>
              {SCORE_STEPS.map((s) => (
                <BigButton key={s} label={s.toFixed(1)} disabled={busy} onPress={() => submitScore(blueId, s, "KATA")} />
              ))}
            </View>
          </Card>
          {bunkai && (
            <>
              <Card>
                <Text style={styles.cardTitle}>Score AKA (Bunkai)</Text>
                <View style={styles.scoreGrid}>
                  {SCORE_STEPS.map((s) => (
                    <BigButton key={s} label={s.toFixed(1)} disabled={busy} onPress={() => submitScore(redId, s, "BUNKAI")} />
                  ))}
                </View>
              </Card>
              <Card>
                <Text style={styles.cardTitle}>Score AO (Bunkai)</Text>
                <View style={styles.scoreGrid}>
                  {SCORE_STEPS.map((s) => (
                    <BigButton key={s} label={s.toFixed(1)} disabled={busy} onPress={() => submitScore(blueId, s, "BUNKAI")} />
                  ))}
                </View>
              </Card>
            </>
          )}
        </>
      )}

      {live.canManage && (
        <Card>
          <Text style={styles.cardTitle}>Finalize</Text>
          <View style={styles.buttonRow}>
            <BigButton label="By judge majority" disabled={busy} onPress={() => confirmAndRun("Finalize", () => apiClient.finalizeKataResult(boutId!, {}))} />
          </View>
        </Card>
      )}
    </ScrollView>
  );
}

function BigButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.bigButton, disabled && styles.disabledButton]}>
      <Text style={styles.bigButtonLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  content: { padding: spacing.lg, gap: spacing.md },
  title: { ...typography.subtitle, color: colors.textPrimary, textAlign: "center" },
  cardTitle: { ...typography.subtitle, color: colors.textPrimary, marginBottom: spacing.sm },
  meta: { fontSize: 12, color: colors.textMuted, textAlign: "center" },
  buttonRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  scoreGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  bigButton: {
    minWidth: 64,
    minHeight: 56,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  disabledButton: { opacity: 0.5 },
  bigButtonLabel: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
