"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { generateDrawAction, publishDrawAction, lockDrawAction } from "@/lib/server/actions";
import type { DrawDetail } from "@/lib/server/domain";

/** Organizer-only controls. The backend is the real authorization boundary — an unauthorized attempt simply surfaces the server's error message here. */
export function DrawManagementPanel({
  competitionId,
  draw,
}: {
  competitionId: string;
  draw: DrawDetail | null;
}) {
  const router = useRouter();
  const [bracketType, setBracketType] = useState<"SINGLE_ELIMINATION" | "ROUND_ROBIN">("SINGLE_ELIMINATION");
  const [seedingStrategy, setSeedingStrategy] = useState<"NONE" | "RANDOM" | "RANKING" | "MANUAL">("NONE");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleGenerate(force = false) {
    setBusy(true);
    setMessage(null);
    const result = await generateDrawAction(competitionId, { bracketType, seedingStrategy, force });
    setMessage(result.success ? "Draw generated." : (result.message ?? "Could not generate the draw."));
    setBusy(false);
    router.refresh();
  }

  async function handlePublish() {
    if (!draw) return;
    setBusy(true);
    setMessage(null);
    const result = await publishDrawAction(draw.id, competitionId);
    setMessage(result.success ? "Draw published." : (result.message ?? "Could not publish the draw."));
    setBusy(false);
    router.refresh();
  }

  async function handleLock() {
    if (!draw) return;
    setBusy(true);
    setMessage(null);
    const result = await lockDrawAction(draw.id, competitionId);
    setMessage(result.success ? "Draw locked." : (result.message ?? "Could not lock the draw."));
    setBusy(false);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Draw management</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <select
            value={bracketType}
            onChange={(e) => setBracketType(e.target.value as typeof bracketType)}
            className="h-10 rounded-md border border-border bg-surface-raised px-3 text-sm text-text-primary"
          >
            <option value="SINGLE_ELIMINATION">Single elimination</option>
            <option value="ROUND_ROBIN">Round robin</option>
          </select>
          <select
            value={seedingStrategy}
            onChange={(e) => setSeedingStrategy(e.target.value as typeof seedingStrategy)}
            className="h-10 rounded-md border border-border bg-surface-raised px-3 text-sm text-text-primary"
          >
            <option value="NONE">No seeding (registration order)</option>
            <option value="RANDOM">Random</option>
            <option value="RANKING">Ranking-based</option>
            <option value="MANUAL">Manual (set via API)</option>
          </select>
          <Button size="sm" onClick={() => handleGenerate(false)} isLoading={busy} disabled={busy}>
            {draw ? "Regenerate draw" : "Generate draw"}
          </Button>
          {draw?.status === "LOCKED" && (
            <Button
              size="sm"
              variant="danger"
              onClick={() => handleGenerate(true)}
              isLoading={busy}
              disabled={busy}
            >
              Force re-draw
            </Button>
          )}
        </div>

        {draw && draw.status === "DRAFT" && (
          <Button size="sm" variant="secondary" onClick={handlePublish} isLoading={busy} disabled={busy}>
            Publish draw
          </Button>
        )}
        {draw && draw.status === "PUBLISHED" && (
          <Button size="sm" variant="secondary" onClick={handleLock} isLoading={busy} disabled={busy}>
            Lock (finalize) draw
          </Button>
        )}

        {message && <p className="text-xs text-text-muted">{message}</p>}
      </CardContent>
    </Card>
  );
}
