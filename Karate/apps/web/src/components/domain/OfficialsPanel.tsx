"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { assignOfficialAction, transitionAssignmentStatusAction } from "@/lib/server/actions";
import type { OfficialAssignmentRow, TatamiRow } from "@/lib/server/domain";

const FUNCTIONS = [
  "REFEREE",
  "JUDGE",
  "KANSA",
  "SCORE_SUPERVISOR",
  "TIMEKEEPER",
  "VIDEO_REVIEW_JUDGE",
  "TATAMI_MANAGER",
];

/** Organizer-only. A scorer's own profile ID must currently be provided directly — no scorer directory/search endpoint exists yet, so this is a known rough edge. */
export function OfficialsPanel({
  tournamentId,
  assignments,
  tatamis,
}: {
  tournamentId: string;
  assignments: OfficialAssignmentRow[];
  tatamis: TatamiRow[];
}) {
  const router = useRouter();
  const [scorerProfileId, setScorerProfileId] = useState("");
  const [fn, setFn] = useState(FUNCTIONS[0]!);
  const [tatamiId, setTatamiId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleAssign() {
    if (!scorerProfileId.trim()) {
      setMessage("Enter a scorer profile ID.");
      return;
    }
    setBusy(true);
    const result = await assignOfficialAction(tournamentId, {
      scorerProfileId: scorerProfileId.trim(),
      function: fn,
      tatamiId: tatamiId || undefined,
    });
    setMessage(result.success ? "Official assigned." : (result.message ?? "Could not assign the official."));
    setBusy(false);
    router.refresh();
  }

  async function handleRevoke(assignmentId: string) {
    setBusy(true);
    const result = await transitionAssignmentStatusAction(assignmentId, tournamentId, "REVOKED");
    setMessage(
      result.success ? "Assignment revoked." : (result.message ?? "Could not revoke the assignment."),
    );
    setBusy(false);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Official assignments</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            placeholder="Scorer profile ID"
            value={scorerProfileId}
            onChange={(e) => setScorerProfileId(e.target.value)}
            className="h-10 w-64 rounded-md border border-border bg-surface-raised px-3 text-sm text-text-primary"
          />
          <select
            value={fn}
            onChange={(e) => setFn(e.target.value)}
            className="h-10 rounded-md border border-border bg-surface-raised px-3 text-sm text-text-primary"
          >
            {FUNCTIONS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <select
            value={tatamiId}
            onChange={(e) => setTatamiId(e.target.value)}
            className="h-10 rounded-md border border-border bg-surface-raised px-3 text-sm text-text-primary"
          >
            <option value="">No specific tatami</option>
            {tatamis.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <Button size="sm" onClick={handleAssign} isLoading={busy} disabled={busy}>
            Assign
          </Button>
        </div>

        {assignments.length === 0 ? (
          <EmptyState title="No officials assigned yet" />
        ) : (
          assignments.map((a) => (
            <div key={a.id} className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <p className="text-sm font-medium text-text-primary">
                  {a.scorerProfile?.displayName ?? a.scorerProfileId} · {a.function}
                </p>
                <p className="text-xs text-text-muted">{a.tatami ? a.tatami.label : "No specific tatami"}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={a.status === "REVOKED" ? "danger" : "info"}>{a.status}</Badge>
                {a.status !== "REVOKED" && a.status !== "COMPLETED" && (
                  <Button size="sm" variant="danger" onClick={() => handleRevoke(a.id)} disabled={busy}>
                    Revoke
                  </Button>
                )}
              </div>
            </div>
          ))
        )}

        {message && <p className="text-xs text-text-muted">{message}</p>}
      </CardContent>
    </Card>
  );
}
