import { useCallback, useEffect, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { EmptyState } from "@/components/EmptyState";
import { ConnectionIndicator } from "@/components/ConnectionIndicator";
import { useAuth } from "@/context/AuthContext";
import { apiClient, type BoutDetailRow, type KumiteLiveState } from "@/lib/api-client";
import { connectToBoutRealtime } from "@/lib/realtime-client";
import { colors, spacing, typography } from "@/theme/tokens";

function uuid(): string {
  // RFC4122-ish v4, good enough for a client idempotency key (server is the source of truth for uniqueness).
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const SCORE_TYPES = ["YUKO", "WAZA_ARI", "IPPON"] as const;
const PENALTY_TYPES = ["CHUI", "HANSOKU_CHUI", "HANSOKU", "SHIKKAKU"] as const;

/**
 * Mobile scorer screen — designed for speed, not a shrunk copy of the Web
 * scorer panel (per product spec section 23). A Referee taps one big
 * AKA/AO x YUKO/WAZA-ARI/IPPON button; the panel's already-agreed signal is
 * submitted from the first eligible Judges (+ Referee in Two-Judge mode),
 * matching how a physical scoring tablet works. No scoring math happens here
 * — the server is authoritative for every score/penalty/winner/timer value.
 */
export default function KumiteMobileScreen() {
  const { boutId } = useLocalSearchParams<{ boutId: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [bout, setBout] = useState<BoutDetailRow | null>(null);
  const [live, setLive] = useState<KumiteLiveState | null>(null);
  const [displaySeconds, setDisplaySeconds] = useState(0);
  const [connection, setConnection] = useState<"CONNECTED" | "RECONNECTING" | "OFFLINE">("CONNECTED");
  const [busy, setBusy] = useState(false);
  const runningRef = useRef(false);

  const load = useCallback(async () => {
    if (!boutId) return;
    const [b, k] = await Promise.all([apiClient.getBout(boutId), apiClient.getKumiteState(boutId)]);
    setBout(b);
    if (k) {
      setLive(k);
      setDisplaySeconds(k.clock.remainingSeconds);
      runningRef.current = k.clock.running;
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
    const poll = setInterval(load, 3000);
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

  useEffect(() => {
    const tick = setInterval(() => {
      if (runningRef.current) setDisplaySeconds((s) => Math.max(s - 1, 0));
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  async function runAction<T>(action: () => Promise<T>) {
    setBusy(true);
    try {
      const result = await action();
      if (result && typeof result === "object" && "clock" in (result as object)) {
        const state = result as unknown as KumiteLiveState;
        setLive(state);
        setDisplaySeconds(state.clock.remainingSeconds);
        runningRef.current = state.clock.running;
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
    Alert.alert(title, "Are you sure? This is a corrective/finalizing action.", [
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

  if (!bout || !live || !bout.redPlayer || !bout.bluePlayer) {
    return (
      <View style={styles.screen}>
        <EmptyState title="Bout unavailable" description="This bout could not be loaded, or has a bye slot." />
      </View>
    );
  }

  if (live.status === "FINISHED" || live.status === "FINALIZED") {
    return (
      <View style={styles.screen}>
        <Card>
          <Text style={styles.title}>Bout finalized</Text>
          <Text style={styles.score}>
            {live.state?.redScore ?? 0} — {live.state?.blueScore ?? 0}
          </Text>
          <Badge label={live.status} tone="success" />
        </Card>
      </View>
    );
  }

  const isReferee = live.myOfficialFunction === "REFEREE";
  const isTimekeeper = live.myOfficialFunction === "TIMEKEEPER" || isReferee;
  const judgeIds = live.panelOfficials
    .filter((o) => o.function === "JUDGE" || (live.config.twoJudgeMode && o.function === "REFEREE"))
    .map((o) => o.id);

  async function quickScore(color: "RED" | "BLUE", scoreType: (typeof SCORE_TYPES)[number]) {
    if (judgeIds.length < 2) {
      Alert.alert("Not enough judges", "This bout needs at least 2 eligible officials assigned to score.");
      return;
    }
    const targetPlayerId = color === "RED" ? live!.redPlayerId! : live!.bluePlayerId!;
    const signals = judgeIds.slice(0, 2).map((officialAssignmentId) => ({ officialAssignmentId, targetPlayerId, scoreType }));
    await runAction(() => apiClient.submitKumiteScore(boutId!, { signals, clientOperationId: uuid() }));
  }

  async function quickPenalty(color: "RED" | "BLUE", penaltyType: (typeof PENALTY_TYPES)[number]) {
    const targetPlayerId = color === "RED" ? live!.redPlayerId! : live!.bluePlayerId!;
    await runAction(() =>
      apiClient.applyKumitePenalty(boutId!, {
        targetPlayerId,
        penaltyType,
        reasonCode: "MISCONDUCT_OR_ETIQUETTE",
        clientOperationId: uuid(),
      }),
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <ConnectionIndicator state={connection} />

      <Card>
        <Text style={styles.title}>
          {bout.redPlayer.displayName} vs {bout.bluePlayer.displayName}
        </Text>
        <View style={styles.scoreRow}>
          <View style={styles.scoreCol}>
            <Text style={styles.playerLabel}>AKA</Text>
            <Text style={[styles.score, { color: colors.danger }]}>{live.state?.redScore ?? 0}</Text>
            {live.state?.senshu === "RED" && <Badge label="SENSHU" tone="warning" />}
          </View>
          <Text style={styles.clock}>{formatClock(displaySeconds)}</Text>
          <View style={styles.scoreCol}>
            <Text style={styles.playerLabel}>AO</Text>
            <Text style={[styles.score, { color: colors.accent }]}>{live.state?.blueScore ?? 0}</Text>
            {live.state?.senshu === "BLUE" && <Badge label="SENSHU" tone="warning" />}
          </View>
        </View>
        <Text style={styles.meta}>
          {live.status} · Your function: {live.myOfficialFunction ?? "Spectator"}
        </Text>
      </Card>

      {isTimekeeper && (
        <Card>
          <Text style={styles.cardTitle}>Timer</Text>
          <View style={styles.buttonRow}>
            <BigButton label="Start" disabled={busy || live.clock.running} onPress={() => runAction(() => apiClient.startKumiteClock(boutId!))} />
            <BigButton label="Pause" disabled={busy || !live.clock.running} onPress={() => runAction(() => apiClient.pauseKumiteClock(boutId!))} />
            <BigButton label="Resume" disabled={busy || live.clock.running} onPress={() => runAction(() => apiClient.resumeKumiteClock(boutId!))} />
          </View>
        </Card>
      )}

      {isReferee && (
        <>
          <Card>
            <Text style={styles.cardTitle}>AKA score</Text>
            <View style={styles.buttonRow}>
              {SCORE_TYPES.map((t) => (
                <BigButton key={t} label={t} disabled={busy} onPress={() => quickScore("RED", t)} />
              ))}
            </View>
          </Card>
          <Card>
            <Text style={styles.cardTitle}>AO score</Text>
            <View style={styles.buttonRow}>
              {SCORE_TYPES.map((t) => (
                <BigButton key={t} label={t} disabled={busy} onPress={() => quickScore("BLUE", t)} />
              ))}
            </View>
          </Card>
          <Card>
            <Text style={styles.cardTitle}>Penalties</Text>
            <Text style={styles.meta}>AKA</Text>
            <View style={styles.buttonRow}>
              {PENALTY_TYPES.map((p) => (
                <BigButton key={`r${p}`} label={p} small disabled={busy} onPress={() => quickPenalty("RED", p)} />
              ))}
            </View>
            <Text style={styles.meta}>AO</Text>
            <View style={styles.buttonRow}>
              {PENALTY_TYPES.map((p) => (
                <BigButton key={`b${p}`} label={p} small disabled={busy} onPress={() => quickPenalty("BLUE", p)} />
              ))}
            </View>
          </Card>
          <Card>
            <Text style={styles.cardTitle}>Finalize</Text>
            <BigButton
              label="Finalize result"
              disabled={busy}
              onPress={() => confirmAndRun("Finalize bout", () => apiClient.finalizeKumiteResult(boutId!, {}))}
            />
          </Card>
        </>
      )}

      {live.myOfficialFunction === "VIDEO_REVIEW_JUDGE" && (
        <Card>
          <Text style={styles.cardTitle}>Video review requests</Text>
          {live.videoReviewRequests.filter((r) => r.status === "REQUESTED").length === 0 ? (
            <EmptyState title="No pending requests" />
          ) : (
            live.videoReviewRequests
              .filter((r) => r.status === "REQUESTED")
              .map((r) => (
                <View key={r.id} style={{ gap: spacing.sm, marginTop: spacing.sm }}>
                  <Text style={styles.meta}>
                    {r.requestedForPlayerId === live.redPlayerId ? "AKA" : "AO"} · {r.requestedScoreType ?? "unspecified"}
                  </Text>
                  <View style={styles.buttonRow}>
                    {SCORE_TYPES.map((t) => (
                      <BigButton
                        key={t}
                        label={`Uphold ${t}`}
                        small
                        disabled={busy}
                        onPress={() =>
                          runAction(() =>
                            apiClient.decideVideoReview(boutId!, r.id, { status: "UPHELD", awardedScoreType: t, clientOperationId: uuid() }),
                          )
                        }
                      />
                    ))}
                    <BigButton
                      label="Reject"
                      small
                      disabled={busy}
                      onPress={() => runAction(() => apiClient.decideVideoReview(boutId!, r.id, { status: "REJECTED", clientOperationId: uuid() }))}
                    />
                  </View>
                </View>
              ))
          )}
        </Card>
      )}
    </ScrollView>
  );
}

function BigButton({
  label,
  onPress,
  disabled,
  small,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  small?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.bigButton, small && styles.smallButton, disabled && styles.disabledButton]}
    >
      <Text style={[styles.bigButtonLabel, small && styles.smallButtonLabel]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  content: { padding: spacing.lg, gap: spacing.md },
  title: { ...typography.subtitle, color: colors.textPrimary, textAlign: "center" },
  cardTitle: { ...typography.subtitle, color: colors.textPrimary, marginBottom: spacing.sm },
  scoreRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-around", marginVertical: spacing.md },
  scoreCol: { alignItems: "center", gap: spacing.xs },
  playerLabel: { fontSize: 12, color: colors.textMuted },
  score: { fontSize: 40, fontWeight: "700" },
  clock: { fontSize: 24, fontWeight: "600", fontVariant: ["tabular-nums"], color: colors.textPrimary },
  meta: { fontSize: 12, color: colors.textMuted, textAlign: "center" },
  buttonRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.xs },
  bigButton: {
    minWidth: 96,
    minHeight: 56,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  smallButton: { minWidth: 72, minHeight: 44 },
  disabledButton: { opacity: 0.5 },
  bigButtonLabel: { color: "#fff", fontWeight: "700", fontSize: 16 },
  smallButtonLabel: { fontSize: 12 },
});
