"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { KataLiveState, KataDefinitionRow } from "@/lib/server/domain";
import {
  announceKataAction,
  submitJudgeEvaluationAction,
  correctJudgeEvaluationAction,
  finalizeKataResultAction,
} from "@/lib/server/actions";

function newOperationId(): string {
  return window.crypto.randomUUID();
}

/**
 * Kata's judging UX is performance-first, not a live scoreboard: there is no
 * clock/point ledger to watch (unlike KumiteLivePanel) — a Judge sees the
 * announced Kata, enters one score after the performance ends, and is done.
 */
export function KataLivePanel({
  boutId,
  initialState,
  redPlayerName,
  bluePlayerName,
  kataDefinitions,
}: {
  boutId: string;
  initialState: KataLiveState;
  redPlayerName: string;
  bluePlayerName: string;
  kataDefinitions: KataDefinitionRow[];
}) {
  const [live, setLive] = useState<KataLiveState>(initialState);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/kata/${boutId}`, { cache: "no-store" });
      const body = await res.json();
      if (body.success) {
        setLive(body.data as KataLiveState);
        setConnected(true);
      } else {
        setConnected(false);
      }
    } catch {
      setConnected(false);
    }
  }, [boutId]);

  useEffect(() => {
    const poll = setInterval(refresh, 4000);
    return () => clearInterval(poll);
  }, [refresh]);

  async function run<T>(action: () => Promise<{ success: boolean; message?: string; data?: T }>) {
    setBusy(true);
    setError(null);
    const result = await action();
    if (result.success && result.data) {
      setLive(result.data as unknown as KataLiveState);
    } else if (!result.success) {
      setError(result.message ?? "Action failed.");
    }
    setBusy(false);
  }

  if (live.status === "FINALIZED" || live.status === "FINISHED") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Performance finalized</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <p className="text-sm text-text-secondary">
            {redPlayerName} ({live.redVotes} votes) vs {bluePlayerName} ({live.blueVotes} votes)
          </p>
          <Badge tone="success">{live.status}</Badge>
        </CardContent>
      </Card>
    );
  }

  const isJudge = live.myOfficialFunction === "JUDGE";
  const canManage = live.canManage;
  const redId = live.redPlayerId ?? live.redTeam?.id ?? null;
  const blueId = live.bluePlayerId ?? live.blueTeam?.id ?? null;

  return (
    <div className="flex flex-col gap-4">
      {!connected && (
        <div className="rounded-md border border-warning/30 bg-warning/10 p-2 text-xs text-warning">
          Connection lost — retrying automatically…
        </div>
      )}
      {error && <div className="rounded-md border border-danger/30 bg-danger/10 p-2 text-xs text-danger">{error}</div>}

      <Card>
        <CardHeader>
          <CardTitle>
            {redPlayerName} vs {bluePlayerName}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <p className="text-sm">
            AKA Kata: <span className="font-medium">{live.performance.redKata?.name ?? "Not yet announced"}</span>
          </p>
          <p className="text-sm">
            AO Kata: <span className="font-medium">{live.performance.blueKata?.name ?? "Not yet announced"}</span>
          </p>
          {live.performance.bunkaiRequired && <Badge tone="info">Bunkai required (Art. 3.5.4)</Badge>}
          <p className="text-xs text-text-muted">
            Status: {live.status} · Your function: {live.myOfficialFunction ?? "Spectator (read-only)"}
          </p>
          <p className="text-xs text-text-muted">
            Votes so far — AKA: {live.redVotes} · AO: {live.blueVotes} (of {live.panelOfficials.length} Judges)
          </p>
        </CardContent>
      </Card>

      {canManage && (
        <AnnounceKataPanel boutId={boutId} live={live} redId={redId} blueId={blueId} kataDefinitions={kataDefinitions} busy={busy} onRun={run} />
      )}

      {isJudge && <JudgeEvaluationPanel boutId={boutId} live={live} redId={redId} blueId={blueId} busy={busy} onRun={run} />}

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>Finalize</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy} onClick={() => run(() => finalizeKataResultAction(boutId, {}))}>
              Finalize by judge majority
            </Button>
            <Button size="sm" variant="danger" disabled={busy} onClick={() => run(() => finalizeKataResultAction(boutId, { kikenAgainstPlayerId: redId }))}>
              AKA KIKEN
            </Button>
            <Button size="sm" variant="danger" disabled={busy} onClick={() => run(() => finalizeKataResultAction(boutId, { kikenAgainstPlayerId: blueId }))}>
              AO KIKEN
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AnnounceKataPanel({
  boutId,
  redId,
  blueId,
  kataDefinitions,
  busy,
  onRun,
}: {
  boutId: string;
  live: KataLiveState;
  redId: string | null;
  blueId: string | null;
  kataDefinitions: KataDefinitionRow[];
  busy: boolean;
  onRun: <T>(action: () => Promise<{ success: boolean; message?: string; data?: T }>) => Promise<void>;
}) {
  const [side, setSide] = useState<"RED" | "BLUE">("RED");
  const [kataId, setKataId] = useState(kataDefinitions[0]?.id ?? "");

  if (kataDefinitions.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Announce Kata</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2">
        <select className="h-9 rounded-md border border-border bg-surface-raised px-2 text-sm" value={side} onChange={(e) => setSide(e.target.value as "RED" | "BLUE")}>
          <option value="RED">AKA</option>
          <option value="BLUE">AO</option>
        </select>
        <select className="h-9 rounded-md border border-border bg-surface-raised px-2 text-sm" value={kataId} onChange={(e) => setKataId(e.target.value)}>
          {kataDefinitions.map((k) => (
            <option key={k.id} value={k.id}>
              {k.name}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          disabled={busy}
          onClick={() =>
            onRun(() =>
              announceKataAction(boutId, {
                performerPlayerId: side === "RED" ? redId : blueId,
                kataDefinitionId: kataId,
              }),
            )
          }
        >
          Announce
        </Button>
      </CardContent>
    </Card>
  );
}

function JudgeEvaluationPanel({
  boutId,
  live,
  redId,
  blueId,
  busy,
  onRun,
}: {
  boutId: string;
  live: KataLiveState;
  redId: string | null;
  blueId: string | null;
  busy: boolean;
  onRun: <T>(action: () => Promise<{ success: boolean; message?: string; data?: T }>) => Promise<void>;
}) {
  const bunkai = live.performance.bunkaiRequired;

  // Only this evaluation is "mine" to correct — other judges' scores are visible in history but not editable here.
  const myActiveEvalFor = (targetId: string | null, phase: "KATA" | "BUNKAI") =>
    live.evaluations.find(
      (e) =>
        (e.targetPlayerId === targetId || e.targetTeamId === targetId) &&
        e.phase === phase &&
        e.officialAssignmentId === live.myOfficialAssignmentId &&
        !live.evaluations.some((c) => c.correctionOfId === e.id),
    );

  async function submit(targetId: string | null, score: number, phase: "KATA" | "BUNKAI", existingId?: string) {
    if (!targetId) return;
    if (existingId) {
      await onRun(() =>
        correctJudgeEvaluationAction(boutId, { evaluationId: existingId, score, isDisqualification: false, clientOperationId: newOperationId() }),
      );
    } else {
      await onRun(() =>
        submitJudgeEvaluationAction(boutId, { targetPlayerId: targetId, score, isDisqualification: false, phase, clientOperationId: newOperationId() }),
      );
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your evaluation ({live.config.scoreMin.toFixed(1)}-{live.config.scoreMax.toFixed(1)}, {live.config.scoreIncrement} steps)</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ScoreRow label="AKA Kata" targetId={redId} phase="KATA" existing={myActiveEvalFor(redId, "KATA")} onSubmit={submit} busy={busy} />
        <ScoreRow label="AO Kata" targetId={blueId} phase="KATA" existing={myActiveEvalFor(blueId, "KATA")} onSubmit={submit} busy={busy} />
        {bunkai && (
          <>
            <ScoreRow label="AKA Bunkai" targetId={redId} phase="BUNKAI" existing={myActiveEvalFor(redId, "BUNKAI")} onSubmit={submit} busy={busy} />
            <ScoreRow label="AO Bunkai" targetId={blueId} phase="BUNKAI" existing={myActiveEvalFor(blueId, "BUNKAI")} onSubmit={submit} busy={busy} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ScoreRow({
  label,
  targetId,
  phase,
  existing,
  onSubmit,
  busy,
}: {
  label: string;
  targetId: string | null;
  phase: "KATA" | "BUNKAI";
  existing?: { id: string; score: number | null };
  onSubmit: (targetId: string | null, score: number, phase: "KATA" | "BUNKAI", existingId?: string) => Promise<void>;
  busy: boolean;
}) {
  const [score, setScore] = useState("8.0");
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 text-sm">{label}</span>
      <input
        type="number"
        min={5}
        max={10}
        step={0.1}
        value={score}
        onChange={(e) => setScore(e.target.value)}
        className="h-9 w-24 rounded-md border border-border bg-surface-raised px-2 text-sm"
      />
      <Button size="sm" disabled={busy} onClick={() => onSubmit(targetId, Number(score), phase, existing?.id)}>
        {existing ? "Correct" : "Submit"}
      </Button>
      {existing && <span className="text-xs text-text-muted">current: {existing.score}</span>}
    </div>
  );
}
