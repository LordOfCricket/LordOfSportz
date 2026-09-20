"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GRADING_EVENT_STATUS_TRANSITIONS, type GradingEventStatus } from "@karate/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  addGradingParticipantAction,
  recordGradingResultAction,
  transitionGradingEventStatusAction,
} from "@/lib/server/actions";
import type { BeltGradeRef, GradingEventDetail } from "@/lib/server/domain";

const RESULT_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  PENDING: "neutral",
  PASS: "success",
  FAIL: "danger",
  ABSENT: "warning",
  WITHHELD: "warning",
};

interface Props {
  academyId: string;
  event: GradingEventDetail;
  grades: BeltGradeRef[];
  activePlayers: { id: string; displayName: string }[];
}

export function GradingEventManager({ academyId, event, grades, activePlayers }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [playerId, setPlayerId] = useState(activePlayers[0]?.id ?? "");
  const [targetGradeId, setTargetGradeId] = useState(grades[0]?.id ?? "");

  const nextStatuses = GRADING_EVENT_STATUS_TRANSITIONS[event.status as GradingEventStatus] ?? [];
  const availablePlayers = activePlayers.filter(
    (p) => !event.participants.some((part) => part.player.id === p.id),
  );

  async function withBusy(fn: () => Promise<{ success: boolean; message?: string }>) {
    setBusy(true);
    setError(null);
    try {
      const result = await fn();
      if (!result.success) {
        setError(result.message ?? "Action failed.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 border-t border-border pt-4">
      {error && <Alert tone="danger" title={error} />}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-text-muted">Advance status:</span>
        {nextStatuses.length === 0 ? (
          <span className="text-xs text-text-muted">Terminal state</span>
        ) : (
          nextStatuses.map((status) => (
            <Button
              key={status}
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => withBusy(() => transitionGradingEventStatusAction(academyId, event.id, status))}
            >
              {status}
            </Button>
          ))
        )}
      </div>

      {availablePlayers.length > 0 && grades.length > 0 && (
        <div className="flex flex-wrap items-end gap-2 rounded-md border border-border p-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-text-secondary">Player</label>
            <select
              value={playerId}
              onChange={(e) => setPlayerId(e.target.value)}
              className="h-9 rounded-md border border-border bg-surface-raised px-2 text-sm"
            >
              {availablePlayers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-text-secondary">Target grade</label>
            <select
              value={targetGradeId}
              onChange={(e) => setTargetGradeId(e.target.value)}
              className="h-9 rounded-md border border-border bg-surface-raised px-2 text-sm"
            >
              {grades.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              withBusy(() => addGradingParticipantAction(academyId, event.id, { playerId, targetGradeId }))
            }
          >
            Add participant
          </Button>
        </div>
      )}

      {event.participants.length === 0 ? (
        <EmptyState title="No participants yet" />
      ) : (
        <ul className="flex flex-col gap-2">
          {event.participants.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
              <div>
                <p className="font-medium text-text-primary">{p.player.displayName}</p>
                <p className="text-xs text-text-muted">
                  {p.previousGrade?.name ?? "No prior grade"} &rarr; {p.targetGrade.name}
                </p>
              </div>
              {p.result === "PENDING" ? (
                <div className="flex gap-1">
                  {(["PASS", "FAIL", "ABSENT", "WITHHELD"] as const).map((r) => (
                    <Button
                      key={r}
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => withBusy(() => recordGradingResultAction(academyId, event.id, p.id, r))}
                    >
                      {r}
                    </Button>
                  ))}
                </div>
              ) : (
                <Badge tone={RESULT_TONE[p.result] ?? "neutral"}>{p.result}</Badge>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
