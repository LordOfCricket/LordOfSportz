"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { generateScheduleAction, publishScheduleAction, delayScheduleAction } from "@/lib/server/actions";
import type { ScheduleDetail } from "@/lib/server/domain";

/** Organizer-only controls — the backend is the real authorization boundary. */
export function ScheduleManagementPanel({
  tournamentId,
  schedule,
}: {
  tournamentId: string;
  schedule: ScheduleDetail | null;
}) {
  const router = useRouter();
  const [startAt, setStartAt] = useState("");
  const [tatamiId, setTatamiId] = useState("");
  const [delayMinutes, setDelayMinutes] = useState(15);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleGenerate(force = false) {
    if (!startAt) {
      setMessage("Choose a start date/time first.");
      return;
    }
    setBusy(true);
    const result = await generateScheduleAction(tournamentId, {
      startAt: new Date(startAt).toISOString(),
      force,
    });
    setMessage(
      result.success ? "Schedule generated." : (result.message ?? "Could not generate the schedule."),
    );
    setBusy(false);
    router.refresh();
  }

  async function handlePublish() {
    if (!schedule) return;
    setBusy(true);
    const result = await publishScheduleAction(schedule.id, tournamentId);
    setMessage(
      result.success ? "Schedule published." : (result.message ?? "Could not publish the schedule."),
    );
    setBusy(false);
    router.refresh();
  }

  async function handleDelay() {
    if (!schedule || !tatamiId) {
      setMessage("Enter a tatami ID to record a delay against.");
      return;
    }
    setBusy(true);
    const result = await delayScheduleAction(schedule.id, tournamentId, { tatamiId, delayMinutes });
    setMessage(result.success ? "Delay recorded." : (result.message ?? "Could not record the delay."));
    setBusy(false);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Schedule management</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="datetime-local"
            value={startAt}
            onChange={(e) => setStartAt(e.target.value)}
            className="h-10 rounded-md border border-border bg-surface-raised px-3 text-sm text-text-primary"
          />
          <Button size="sm" onClick={() => handleGenerate(false)} isLoading={busy} disabled={busy}>
            {schedule ? "Regenerate schedule" : "Generate schedule"}
          </Button>
          {schedule && schedule.status !== "DRAFT" && (
            <Button
              size="sm"
              variant="danger"
              onClick={() => handleGenerate(true)}
              isLoading={busy}
              disabled={busy}
            >
              Force revision
            </Button>
          )}
        </div>

        {schedule && schedule.status === "DRAFT" && (
          <Button size="sm" variant="secondary" onClick={handlePublish} isLoading={busy} disabled={busy}>
            Publish schedule
          </Button>
        )}

        {schedule && schedule.status !== "DRAFT" && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              placeholder="Tatami ID"
              value={tatamiId}
              onChange={(e) => setTatamiId(e.target.value)}
              className="h-10 w-48 rounded-md border border-border bg-surface-raised px-3 text-sm text-text-primary"
            />
            <input
              type="number"
              min={1}
              value={delayMinutes}
              onChange={(e) => setDelayMinutes(Number(e.target.value))}
              className="h-10 w-24 rounded-md border border-border bg-surface-raised px-3 text-sm text-text-primary"
            />
            <Button size="sm" variant="secondary" onClick={handleDelay} isLoading={busy} disabled={busy}>
              Record delay (minutes)
            </Button>
          </div>
        )}

        {message && <p className="text-xs text-text-muted">{message}</p>}
      </CardContent>
    </Card>
  );
}
