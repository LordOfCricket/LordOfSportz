import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { WithdrawButton } from "./WithdrawButton";
import { ReevaluateButton } from "./ReevaluateButton";
import type { RegistrationRow } from "@/lib/server/domain";

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

/** Shared read (+ optional withdraw) view of registrations — reused by the player, coach, and academy tournament pages so the rules never diverge per role. */
export function RegistrationsList({
  title,
  registrations,
  canWithdraw = false,
  canReevaluate = canWithdraw,
  showPlayer = false,
  bracketBasePath,
  emptyTitle = "No registrations yet",
  emptyDescription,
}: {
  title: string;
  registrations: RegistrationRow[];
  canWithdraw?: boolean;
  /** Defaults to the same authorization as withdrawal — the backend accepts re-evaluation from the same set of actors (owner player, representing academy admin, submitting coach). */
  canReevaluate?: boolean;
  showPlayer?: boolean;
  /** e.g. "/dashboard/player" — when set, each row links to its competition's bracket at `${bracketBasePath}/bracket/${competitionId}`. */
  bracketBasePath?: string;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {registrations.length === 0 ? (
          <EmptyState title={emptyTitle} description={emptyDescription} />
        ) : (
          registrations.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
            >
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium text-text-primary">
                  {r.competition.tournament.name} · {r.competition.name}
                </p>
                <p className="text-xs text-text-muted">
                  {showPlayer ? `${r.player.displayName} · ` : ""}
                  {r.representingAcademy ? `${r.representingAcademy.name} · ` : ""}
                  Submitted {new Date(r.submittedAt).toLocaleDateString()}
                </p>
                {r.beltGradeAtRegistration && (
                  <p className="text-xs text-text-muted">
                    Belt at registration: {r.beltGradeAtRegistration.name}
                  </p>
                )}
                {r.eligibility.reasonCodes.length > 0 && (
                  <ul className="mt-1 list-inside list-disc text-xs text-text-muted">
                    {r.eligibility.reasonCodes.map((code) => (
                      <li key={code}>{REASON_CODE_LABELS[code] ?? code}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="flex flex-wrap justify-end gap-2">
                  <Badge tone={STATUS_TONE[r.status] ?? "neutral"}>{r.status}</Badge>
                  <Badge tone={ELIGIBILITY_TONE[r.eligibility.status] ?? "neutral"}>
                    Eligibility: {r.eligibility.status}
                  </Badge>
                  <Badge tone={MEDICAL_TONE[r.medical.status] ?? "neutral"}>
                    Medical: {r.medical.status}
                  </Badge>
                  <Badge tone={WEIGH_IN_TONE[r.weighIn.status] ?? "neutral"}>
                    Weigh-in: {r.weighIn.status}
                  </Badge>
                  <Badge tone={r.readiness.status === "READY" ? "success" : "neutral"}>
                    {r.readiness.status === "READY" ? "Competition ready" : "Not yet ready"}
                  </Badge>
                </div>
                {canWithdraw && r.status === "SUBMITTED" && <WithdrawButton registrationId={r.id} />}
                {canReevaluate && <ReevaluateButton registrationId={r.id} />}
                {bracketBasePath && (
                  <Link
                    href={`${bracketBasePath}/bracket/${r.competition.id}`}
                    className="text-xs text-accent hover:underline"
                  >
                    View bracket
                  </Link>
                )}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
