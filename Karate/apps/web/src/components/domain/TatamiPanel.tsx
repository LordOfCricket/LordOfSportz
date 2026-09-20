"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { createTatamiAction, transitionTatamiStatusAction } from "@/lib/server/actions";
import type { TatamiRow } from "@/lib/server/domain";

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = {
  INACTIVE: "neutral",
  ACTIVE: "success",
  PAUSED: "warning",
  MAINTENANCE: "danger",
  CLOSED: "danger",
};

const NEXT_STATUSES: Record<string, string[]> = {
  INACTIVE: ["ACTIVE", "CLOSED"],
  ACTIVE: ["PAUSED", "MAINTENANCE", "CLOSED"],
  PAUSED: ["ACTIVE", "MAINTENANCE", "CLOSED"],
  MAINTENANCE: ["ACTIVE", "CLOSED"],
  CLOSED: [],
};

/** Organizer-only. Every action's real authorization boundary is the backend — this just surfaces its result. */
export function TatamiPanel({ tournamentId, tatamis }: { tournamentId: string; tatamis: TatamiRow[] }) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleCreate() {
    if (!label.trim()) return;
    setBusy(true);
    const result = await createTatamiAction(tournamentId, label.trim());
    setMessage(result.success ? "Tatami created." : (result.message ?? "Could not create the tatami."));
    setLabel("");
    setBusy(false);
    router.refresh();
  }

  async function handleTransition(tatamiId: string, status: string) {
    setBusy(true);
    const result = await transitionTatamiStatusAction(tatamiId, tournamentId, status);
    setMessage(
      result.success ? `Tatami set to ${status}.` : (result.message ?? "Could not update the tatami."),
    );
    setBusy(false);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tatamis</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex gap-2">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Tatami 1"
            className="h-10 flex-1 rounded-md border border-border bg-surface-raised px-3 text-sm text-text-primary"
          />
          <Button size="sm" onClick={handleCreate} isLoading={busy} disabled={busy}>
            Add tatami
          </Button>
        </div>

        {tatamis.length === 0 ? (
          <EmptyState title="No tatamis yet" description="Add one above before generating a schedule." />
        ) : (
          tatamis.map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded-md border border-border p-3">
              <p className="text-sm font-medium text-text-primary">{t.label}</p>
              <div className="flex items-center gap-2">
                <Badge tone={STATUS_TONE[t.status] ?? "neutral"}>{t.status}</Badge>
                {(NEXT_STATUSES[t.status] ?? []).map((next) => (
                  <Button
                    key={next}
                    size="sm"
                    variant="secondary"
                    onClick={() => handleTransition(t.id, next)}
                    disabled={busy}
                  >
                    {next}
                  </Button>
                ))}
              </div>
            </div>
          ))
        )}

        {message && <p className="text-xs text-text-muted">{message}</p>}
      </CardContent>
    </Card>
  );
}
