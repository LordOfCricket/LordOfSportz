"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { KumiteLiveState } from "@/lib/server/domain";
import {
  submitKumiteScoreAction,
  cancelKumiteScoreAction,
  applyKumitePenaltyAction,
  submitHanteiVotesAction,
  finalizeKumiteResultAction,
  startKumiteClockAction,
  pauseKumiteClockAction,
  resumeKumiteClockAction,
  requestVideoReviewAction,
  decideVideoReviewAction,
} from "@/lib/server/actions";

function newOperationId(): string {
  return window.crypto.randomUUID();
}

const SCORE_TYPES = ["YUKO", "WAZA_ARI", "IPPON"] as const;
const PENALTY_TYPES = ["CHUI", "HANSOKU_CHUI", "HANSOKU", "SHIKKAKU"] as const;
const REASON_CODES = [
  "JOGAI",
  "MUBOBI",
  "PASSIVITY",
  "AVOIDING_COMBAT",
  "EXCESSIVE_CONTACT",
  "CONTACT_TO_THROAT",
  "CLINCHING_OR_WRESTLING",
  "GRABBING_VIOLATION",
  "FEIGNING_INJURY",
  "MISCONDUCT_OR_ETIQUETTE",
] as const;

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function KumiteLivePanel({
  boutId,
  initialState,
  redPlayerName,
  bluePlayerName,
}: {
  boutId: string;
  initialState: KumiteLiveState;
  redPlayerName: string;
  bluePlayerName: string;
}) {
  const [live, setLive] = useState<KumiteLiveState>(initialState);
  const [displaySeconds, setDisplaySeconds] = useState(initialState.clock.remainingSeconds);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(true);
  const [signalPicks, setSignalPicks] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/kumite/${boutId}`, { cache: "no-store" });
      const body = await res.json();
      if (body.success) {
        setLive(body.data as KumiteLiveState);
        setDisplaySeconds(body.data.clock.remainingSeconds);
        setConnected(true);
      } else {
        setConnected(false);
      }
    } catch {
      setConnected(false);
    }
  }, [boutId]);

  useEffect(() => {
    const poll = setInterval(refresh, 3000);
    return () => clearInterval(poll);
  }, [refresh]);

  useEffect(() => {
    const realtimeUrl = process.env["NEXT_PUBLIC_API_BASE_URL"];
    if (!realtimeUrl) {
      setConnected(false);
      return;
    }

    // The realtime token is deliberately short-lived (60s, see issueRealtimeToken)
    // — `auth` must be a function so Socket.IO fetches a FRESH one on every
    // (re)connection attempt. A static token captured once would work for the
    // first connect but fail every reconnect after 60s (server restart, sleep/
    // wake, network blip), silently killing live push for the rest of the session.
    const socket = io(realtimeUrl, {
      auth: async (cb) => {
        try {
          const response = await fetch("/api/auth/realtime-token", { cache: "no-store" });
          const body: { data?: { token: string } } = response.ok ? await response.json() : {};
          cb({ token: body.data?.token ?? "" });
        } catch {
          cb({ token: "" });
        }
      },
      transports: ["websocket", "polling"],
    });
    const onConnect = () => {
      setConnected(true);
      socket.emit("subscribe", { roomType: "bout", roomId: boutId });
    };
    const onDisconnect = () => setConnected(false);
    const onEvent = (event: { entityId?: string }) => {
      if (event.entityId === boutId) void refresh();
    };
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onDisconnect);
    socket.on("event", onEvent);

    return () => {
      socket.emit("unsubscribe", { roomType: "bout", roomId: boutId });
      socket.disconnect();
    };
  }, [boutId, refresh]);

  const runningRef = useRef(live.clock.running);
  runningRef.current = live.clock.running;
  useEffect(() => {
    const tick = setInterval(() => {
      if (runningRef.current) setDisplaySeconds((s) => Math.max(s - 1, 0));
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  async function run<T>(action: () => Promise<{ success: boolean; message?: string; data?: T }>) {
    setBusy(true);
    setError(null);
    const result = await action();
    if (result.success && result.data) {
      setLive(result.data as unknown as KumiteLiveState);
      setDisplaySeconds((result.data as unknown as KumiteLiveState).clock.remainingSeconds);
    } else if (!result.success) {
      setError(result.message ?? "Action failed.");
    }
    setBusy(false);
  }

  if (live.status === "FINALIZED" || live.status === "FINISHED") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Bout finalized</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <p className="text-sm text-text-secondary">
            {redPlayerName} {live.state?.redScore ?? 0} — {live.state?.blueScore ?? 0} {bluePlayerName}
          </p>
          <Badge tone="success">{live.status}</Badge>
        </CardContent>
      </Card>
    );
  }

  const iAmReferee = live.myOfficialFunction === "REFEREE";
  const iAmTimekeeper = live.myOfficialFunction === "TIMEKEEPER" || iAmReferee;
  const iAmVideoJudge = live.myOfficialFunction === "VIDEO_REVIEW_JUDGE";
  const judgeOfficials = live.panelOfficials.filter(
    (o) => o.function === "JUDGE" || (live.config.twoJudgeMode && o.function === "REFEREE"),
  );

  async function submitScoreDecision() {
    const signals = Object.entries(signalPicks)
      .filter(([, v]) => v && v !== "NONE")
      .map(([officialAssignmentId, v]) => {
        const [color, scoreType] = v.split(":");
        return {
          officialAssignmentId,
          targetPlayerId: color === "RED" ? live.redPlayerId! : live.bluePlayerId!,
          scoreType,
        };
      });
    if (signals.length < 2) {
      setError("Select at least two judge signals before submitting.");
      return;
    }
    await run(() => submitKumiteScoreAction(boutId, { signals, clientOperationId: newOperationId() }));
    setSignalPicks({});
  }

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
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="text-center">
              <p className="text-xs text-text-muted">AKA (Red)</p>
              <p className="text-3xl font-bold text-danger">{live.state?.redScore ?? 0}</p>
              {live.state?.senshu === "RED" && <Badge tone="gold">SENSHU</Badge>}
            </div>
            <div className="text-center">
              <p className="font-mono text-2xl">{formatClock(displaySeconds)}</p>
              <Badge tone={live.clock.running ? "success" : "neutral"}>
                {live.clock.running ? "RUNNING" : "STOPPED"}
              </Badge>
            </div>
            <div className="text-center">
              <p className="text-xs text-text-muted">AO (Blue)</p>
              <p className="text-3xl font-bold text-info">{live.state?.blueScore ?? 0}</p>
              {live.state?.senshu === "BLUE" && <Badge tone="gold">SENSHU</Badge>}
            </div>
          </div>
          <div className="flex flex-wrap gap-1 justify-center">
            {live.state?.redPenalties.map((p, i) => (
              <Badge key={`r${i}`} tone="danger">
                AKA {p}
              </Badge>
            ))}
            {live.state?.bluePenalties.map((p, i) => (
              <Badge key={`b${i}`} tone="danger">
                AO {p}
              </Badge>
            ))}
          </div>
          <p className="text-center text-xs text-text-muted">
            Status: {live.status} · Your function: {live.myOfficialFunction ?? "Spectator (read-only)"}
          </p>
        </CardContent>
      </Card>

      {iAmTimekeeper && (
        <Card>
          <CardHeader>
            <CardTitle>Timer controls</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Button size="sm" disabled={busy || live.clock.running} onClick={() => run(() => startKumiteClockAction(boutId))}>
              Start
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || !live.clock.running}
              onClick={() => run(() => pauseKumiteClockAction(boutId))}
            >
              Pause
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || live.clock.running}
              onClick={() => run(() => resumeKumiteClockAction(boutId))}
            >
              Resume
            </Button>
          </CardContent>
        </Card>
      )}

      {iAmReferee && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Score decision</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {judgeOfficials.length === 0 && (
                <p className="text-xs text-text-muted">No Judges assigned to this bout yet.</p>
              )}
              {judgeOfficials.map((o) => (
                <div key={o.id} className="flex items-center justify-between gap-2">
                  <span className="text-sm text-text-primary">
                    {o.displayName} ({o.function})
                  </span>
                  <select
                    className="h-9 rounded-md border border-border bg-surface-raised px-2 text-sm"
                    value={signalPicks[o.id] ?? "NONE"}
                    onChange={(e) => setSignalPicks((s) => ({ ...s, [o.id]: e.target.value }))}
                  >
                    <option value="NONE">No signal</option>
                    {SCORE_TYPES.map((t) => (
                      <option key={`red-${t}`} value={`RED:${t}`}>
                        AKA {t}
                      </option>
                    ))}
                    {SCORE_TYPES.map((t) => (
                      <option key={`blue-${t}`} value={`BLUE:${t}`}>
                        AO {t}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              <Button size="sm" disabled={busy || judgeOfficials.length === 0} onClick={submitScoreDecision}>
                Submit score decision
              </Button>
              {live.events
                .filter((e) => e.eventType === "YUKO" || e.eventType === "WAZA_ARI" || e.eventType === "IPPON")
                .slice(-3)
                .map((e) => (
                  <div key={e.id} className="flex items-center justify-between text-xs text-text-muted">
                    <span>
                      {e.eventType} · {e.targetPlayerId === live.redPlayerId ? "AKA" : "AO"}
                    </span>
                    <button
                      className="text-danger hover:underline"
                      disabled={busy}
                      onClick={() =>
                        run(() => cancelKumiteScoreAction(boutId, { eventId: e.id, clientOperationId: newOperationId() }))
                      }
                    >
                      Cancel
                    </button>
                  </div>
                ))}
            </CardContent>
          </Card>

          <PenaltyPanel boutId={boutId} live={live} busy={busy} onRun={run} />

          {live.state && live.state.redScore === live.state.blueScore && (
            <HanteiPanel boutId={boutId} live={live} busy={busy} onRun={run} />
          )}

          <Card>
            <CardHeader>
              <CardTitle>Finalize result</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button size="sm" disabled={busy} onClick={() => run(() => finalizeKumiteResultAction(boutId, {}))}>
                Finalize (time-up / points)
              </Button>
              <Button
                size="sm"
                variant="danger"
                disabled={busy}
                onClick={() =>
                  run(() =>
                    finalizeKumiteResultAction(boutId, {
                      disqualifiedPlayerId: live.redPlayerId,
                      disqualificationType: "HANSOKU",
                    }),
                  )
                }
              >
                AKA HANSOKU
              </Button>
              <Button
                size="sm"
                variant="danger"
                disabled={busy}
                onClick={() =>
                  run(() =>
                    finalizeKumiteResultAction(boutId, {
                      disqualifiedPlayerId: live.bluePlayerId,
                      disqualificationType: "HANSOKU",
                    }),
                  )
                }
              >
                AO HANSOKU
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      {iAmVideoJudge && (
        <Card>
          <CardHeader>
            <CardTitle>Video review decisions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {live.videoReviewRequests.filter((r) => r.status === "REQUESTED").length === 0 ? (
              <p className="text-xs text-text-muted">No pending requests.</p>
            ) : (
              live.videoReviewRequests
                .filter((r) => r.status === "REQUESTED")
                .map((r) => (
                  <div key={r.id} className="flex flex-col gap-2 rounded-md border border-border p-2">
                    <p className="text-sm">
                      Requested for {r.requestedForPlayerId === live.redPlayerId ? "AKA" : "AO"} ·{" "}
                      {r.requestedScoreType ?? "unspecified level"}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {SCORE_TYPES.map((t) => (
                        <Button
                          key={t}
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            run(() =>
                              decideVideoReviewAction(boutId, r.id, {
                                status: "UPHELD",
                                awardedScoreType: t,
                                clientOperationId: newOperationId(),
                              }),
                            )
                          }
                        >
                          Uphold {t}
                        </Button>
                      ))}
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() =>
                          run(() => decideVideoReviewAction(boutId, r.id, { status: "REJECTED", clientOperationId: newOperationId() }))
                        }
                      >
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() =>
                          run(() =>
                            decideVideoReviewAction(boutId, r.id, { status: "UNVIEWABLE", clientOperationId: newOperationId() }),
                          )
                        }
                      >
                        MIENAI (unviewable)
                      </Button>
                    </div>
                  </div>
                ))
            )}
          </CardContent>
        </Card>
      )}

      {live.config.videoReviewEnabled && (
        <Card>
          <CardHeader>
            <CardTitle>Video review history</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {live.videoReviewRequests.length === 0 ? (
              <p className="text-xs text-text-muted">No requests yet.</p>
            ) : (
              live.videoReviewRequests.map((r) => (
                <div key={r.id} className="flex items-center justify-between text-xs">
                  <span>
                    {r.requestedForPlayerId === live.redPlayerId ? "AKA" : "AO"} · {r.requestedScoreType ?? "—"}
                  </span>
                  <Badge tone={r.status === "UPHELD" ? "success" : r.status === "REQUESTED" ? "info" : "neutral"}>
                    {r.status}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PenaltyPanel({
  boutId,
  live,
  busy,
  onRun,
}: {
  boutId: string;
  live: KumiteLiveState;
  busy: boolean;
  onRun: <T>(action: () => Promise<{ success: boolean; message?: string; data?: T }>) => Promise<void>;
}) {
  const [target, setTarget] = useState<"RED" | "BLUE">("RED");
  const [penaltyType, setPenaltyType] = useState<string>(PENALTY_TYPES[0]);
  const [reasonCode, setReasonCode] = useState<string>(REASON_CODES[0]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Penalties</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2">
        <select className="h-9 rounded-md border border-border bg-surface-raised px-2 text-sm" value={target} onChange={(e) => setTarget(e.target.value as "RED" | "BLUE")}>
          <option value="RED">AKA</option>
          <option value="BLUE">AO</option>
        </select>
        <select className="h-9 rounded-md border border-border bg-surface-raised px-2 text-sm" value={penaltyType} onChange={(e) => setPenaltyType(e.target.value)}>
          {PENALTY_TYPES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select className="h-9 rounded-md border border-border bg-surface-raised px-2 text-sm" value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
          {REASON_CODES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          disabled={busy}
          onClick={() =>
            onRun(() =>
              applyKumitePenaltyAction(boutId, {
                targetPlayerId: target === "RED" ? live.redPlayerId : live.bluePlayerId,
                penaltyType,
                reasonCode,
                clientOperationId: newOperationId(),
              }),
            )
          }
        >
          Apply penalty
        </Button>
      </CardContent>
    </Card>
  );
}

function HanteiPanel({
  boutId,
  live,
  busy,
  onRun,
}: {
  boutId: string;
  live: KumiteLiveState;
  busy: boolean;
  onRun: <T>(action: () => Promise<{ success: boolean; message?: string; data?: T }>) => Promise<void>;
}) {
  const [votes, setVotes] = useState<Record<string, "RED" | "BLUE">>({});
  const officials = live.panelOfficials;

  return (
    <Card>
      <CardHeader>
        <CardTitle>HANTEI (tied score, no superiority)</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {officials.map((o) => (
          <div key={o.id} className="flex items-center justify-between">
            <span className="text-sm">{o.displayName}</span>
            <select
              className="h-9 rounded-md border border-border bg-surface-raised px-2 text-sm"
              value={votes[o.id] ?? ""}
              onChange={(e) => setVotes((v) => ({ ...v, [o.id]: e.target.value as "RED" | "BLUE" }))}
            >
              <option value="">No vote</option>
              <option value="RED">AKA</option>
              <option value="BLUE">AO</option>
            </select>
          </div>
        ))}
        <Button
          size="sm"
          disabled={busy}
          onClick={() =>
            onRun(() =>
              submitHanteiVotesAction(boutId, {
                votes: Object.entries(votes)
                  .filter(([, v]) => v)
                  .map(([officialAssignmentId, v]) => ({
                    officialAssignmentId,
                    votedForPlayerId: v === "RED" ? live.redPlayerId : live.bluePlayerId,
                  })),
                clientOperationId: newOperationId(),
              }),
            )
          }
        >
          Submit HANTEI votes
        </Button>
      </CardContent>
    </Card>
  );
}

/** Rendered only for a COACH viewer. The server independently verifies this Coach is actually assigned to the chosen athlete — a wrong pick simply comes back as an authorization error here. */
export function CoachVideoReviewRequest({
  boutId,
  redPlayerId,
  bluePlayerId,
  redPlayerName,
  bluePlayerName,
  videoReviewEnabled,
}: {
  boutId: string;
  redPlayerId: string;
  bluePlayerId: string;
  redPlayerName: string;
  bluePlayerName: string;
  videoReviewEnabled: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [forPlayer, setForPlayer] = useState<"RED" | "BLUE">("RED");

  if (!videoReviewEnabled) return null;

  async function request(scoreType: string) {
    setBusy(true);
    const requestedForPlayerId = forPlayer === "RED" ? redPlayerId : bluePlayerId;
    const result = await requestVideoReviewAction(boutId, { requestedForPlayerId, requestedScoreType: scoreType });
    setMessage(result.success ? "Video review requested." : (result.message ?? "Could not request review."));
    setBusy(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Request video review</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2">
        <select
          className="h-9 rounded-md border border-border bg-surface-raised px-2 text-sm"
          value={forPlayer}
          onChange={(e) => setForPlayer(e.target.value as "RED" | "BLUE")}
        >
          <option value="RED">{redPlayerName} (AKA)</option>
          <option value="BLUE">{bluePlayerName} (AO)</option>
        </select>
        {SCORE_TYPES.map((t) => (
          <Button key={t} size="sm" variant="secondary" disabled={busy} onClick={() => request(t)}>
            Request {t}
          </Button>
        ))}
        {message && <p className="w-full text-xs text-text-muted">{message}</p>}
      </CardContent>
    </Card>
  );
}
