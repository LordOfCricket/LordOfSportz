import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useState } from "react";
import { useRouter } from "expo-router";
import { Card } from "./Card";
import { Badge } from "./Badge";
import { EmptyState } from "./EmptyState";
import { colors, radii, spacing, typography } from "@/theme/tokens";
import type { RegistrationRow } from "@/lib/api-client";

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = {
  SUBMITTED: "warning",
  VERIFIED: "info",
  REJECTED: "danger",
  WITHDRAWN: "neutral",
  CONFIRMED: "success",
};

const ELIGIBILITY_TONE: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = {
  NOT_CHECKED: "neutral",
  PENDING: "warning",
  ELIGIBLE: "success",
  INELIGIBLE: "danger",
  MANUAL_REVIEW: "info",
};

const MEDICAL_TONE: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = {
  PENDING: "warning",
  CLEARED: "success",
  NOT_CLEARED: "danger",
  EXPIRED: "danger",
};

const WEIGH_IN_TONE: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = {
  PENDING: "warning",
  PASSED: "success",
  FAILED: "danger",
  REWEIGH_REQUIRED: "info",
};

const REASON_CODE_LABELS: Record<string, string> = {
  AGE_OUTSIDE_RANGE: "Age outside category range",
  GENDER_NOT_ELIGIBLE: "Gender not eligible for this category",
  WEIGHT_OUTSIDE_RANGE: "Weight outside category range",
  WEIGHT_NOT_YET_MEASURED: "Official weight not yet measured",
  BELT_NOT_ELIGIBLE: "Belt grade outside category range",
  BELT_NOT_VERIFIED: "No verified belt grade on file",
  STYLE_NOT_ELIGIBLE: "Style not eligible for this category",
  DISCIPLINE_NOT_ELIGIBLE: "Style not eligible for this discipline",
  MISSING_INFORMATION: "Missing required information",
  MANUAL_REVIEW_REQUIRED: "Manual review required",
};

/** Shared read (+ optional withdraw/re-check) view — mirrors the web RegistrationsList so the rules never diverge per platform. */
export function RegistrationsList({
  title,
  registrations,
  showPlayer = false,
  onWithdraw,
  onReevaluate,
  emptyTitle = "No registrations yet",
  emptyDescription,
}: {
  title: string;
  registrations: RegistrationRow[];
  showPlayer?: boolean;
  onWithdraw?: (registrationId: string) => Promise<void>;
  onReevaluate?: (registrationId: string) => Promise<void>;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const [reevaluatingId, setReevaluatingId] = useState<string | null>(null);
  const router = useRouter();

  async function handleWithdraw(id: string) {
    if (!onWithdraw) return;
    setWithdrawingId(id);
    try {
      await onWithdraw(id);
    } finally {
      setWithdrawingId(null);
    }
  }

  async function handleReevaluate(id: string) {
    if (!onReevaluate) return;
    setReevaluatingId(id);
    try {
      await onReevaluate(id);
    } finally {
      setReevaluatingId(null);
    }
  }

  return (
    <Card>
      <Text style={styles.title}>{title}</Text>
      {registrations.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      ) : (
        registrations.map((r) => (
          <View key={r.id} style={styles.row}>
            <View style={styles.info}>
              <Text style={styles.name}>
                {r.competition.tournament.name} · {r.competition.name}
              </Text>
              <Text style={styles.meta}>
                {showPlayer ? `${r.player.displayName} · ` : ""}
                {r.representingAcademy ? `${r.representingAcademy.name} · ` : ""}
                Submitted {new Date(r.submittedAt).toLocaleDateString()}
              </Text>
              {r.beltGradeAtRegistration && (
                <Text style={styles.meta}>Belt at registration: {r.beltGradeAtRegistration.name}</Text>
              )}
              {r.eligibility.reasonCodes.map((code) => (
                <Text key={code} style={styles.meta}>
                  • {REASON_CODE_LABELS[code] ?? code}
                </Text>
              ))}
              <View style={styles.badges}>
                <Badge label={r.status} tone={STATUS_TONE[r.status] ?? "neutral"} />
                <Badge
                  label={`Eligibility: ${r.eligibility.status}`}
                  tone={ELIGIBILITY_TONE[r.eligibility.status] ?? "neutral"}
                />
                <Badge
                  label={`Medical: ${r.medical.status}`}
                  tone={MEDICAL_TONE[r.medical.status] ?? "neutral"}
                />
                <Badge
                  label={`Weigh-in: ${r.weighIn.status}`}
                  tone={WEIGH_IN_TONE[r.weighIn.status] ?? "neutral"}
                />
                <Badge
                  label={r.readiness.status === "READY" ? "Competition ready" : "Not yet ready"}
                  tone={r.readiness.status === "READY" ? "success" : "neutral"}
                />
              </View>
            </View>
            <View style={{ gap: spacing.xs, alignItems: "flex-end" }}>
              {onWithdraw && r.status === "SUBMITTED" && (
                <Pressable
                  style={styles.withdrawButton}
                  onPress={() => handleWithdraw(r.id)}
                  disabled={withdrawingId !== null}
                >
                  {withdrawingId === r.id ? (
                    <ActivityIndicator color={colors.white} />
                  ) : (
                    <Text style={styles.withdrawText}>Withdraw</Text>
                  )}
                </Pressable>
              )}
              {onReevaluate && (
                <Pressable
                  style={styles.recheckButton}
                  onPress={() => handleReevaluate(r.id)}
                  disabled={reevaluatingId !== null}
                >
                  {reevaluatingId === r.id ? (
                    <ActivityIndicator color={colors.textPrimary} />
                  ) : (
                    <Text style={styles.recheckText}>Re-check</Text>
                  )}
                </Pressable>
              )}
              <Pressable onPress={() => router.push(`/bracket/${r.competition.id}`)}>
                <Text style={styles.bracketLink}>View bracket</Text>
              </Pressable>
            </View>
          </View>
        ))
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.subtitle, color: colors.textPrimary, marginBottom: spacing.sm },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  info: { flex: 1, gap: 2 },
  name: { ...typography.body, fontWeight: "600", color: colors.textPrimary },
  meta: { fontSize: 12, color: colors.textMuted },
  badges: { flexDirection: "row", gap: spacing.xs, marginTop: 4 },
  withdrawButton: {
    backgroundColor: colors.danger,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  withdrawText: { color: colors.white, fontWeight: "600", fontSize: 12 },
  recheckButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  recheckText: { color: colors.textPrimary, fontWeight: "600", fontSize: 12 },
  bracketLink: { color: colors.accent, fontSize: 12, fontWeight: "600" },
});
