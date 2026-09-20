"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  createKataTeamAction,
  addKataTeamMemberAction,
  removeKataTeamMemberAction,
  createTeamBoutAction,
} from "@/lib/server/actions";
import type { KataTeamRow } from "@/lib/server/domain";

/** Organizer-facing Team Kata roster + manual team-bout creation (Art. 3.5) — the server independently re-verifies academy administration on every action. */
export function KataTeamsPanel({ academyId, competitionId, teams }: { academyId: string; competitionId: string; teams: KataTeamRow[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [playerId, setPlayerId] = useState<Record<string, string>>({});
  const [redTeamId, setRedTeamId] = useState("");
  const [blueTeamId, setBlueTeamId] = useState("");
  const [bunkaiRequired, setBunkaiRequired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleCreateTeam() {
    if (!name.trim()) return;
    setBusy(true);
    const result = await createKataTeamAction({ academyId, competitionId, name: name.trim() });
    setMessage(result.success ? "Team created." : (result.message ?? "Could not create the Team."));
    setName("");
    setBusy(false);
    router.refresh();
  }

  async function handleAddMember(teamId: string) {
    const id = playerId[teamId]?.trim();
    if (!id) return;
    setBusy(true);
    const result = await addKataTeamMemberAction(teamId, id);
    setMessage(result.success ? "Athlete added." : (result.message ?? "Could not add the Athlete."));
    setPlayerId((s) => ({ ...s, [teamId]: "" }));
    setBusy(false);
    router.refresh();
  }

  async function handleRemoveMember(teamId: string, memberId: string) {
    setBusy(true);
    await removeKataTeamMemberAction(teamId, memberId);
    setBusy(false);
    router.refresh();
  }

  async function handleCreateTeamBout() {
    if (!redTeamId || !blueTeamId) return;
    setBusy(true);
    const result = await createTeamBoutAction(competitionId, { redTeamId, blueTeamId, bunkaiRequired });
    setMessage(result.success ? "Team bout created." : (result.message ?? "Could not create the Team bout."));
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Kata Teams</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <input
              placeholder="Team name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-9 w-64 rounded-md border border-border bg-surface-raised px-3 text-sm"
            />
            <Button size="sm" disabled={busy} onClick={handleCreateTeam}>
              Create Team
            </Button>
          </div>

          {teams.length === 0 ? (
            <EmptyState title="No Teams registered yet" description="Create a Team, then add 3-4 Athletes (Art. 3.5.1)." />
          ) : (
            teams.map((team) => (
              <div key={team.id} className="flex flex-col gap-2 rounded-md border border-border p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-text-primary">{team.name}</p>
                  <Badge tone={team.status === "ACTIVE" ? "success" : "neutral"}>{team.status}</Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  {team.members.map((m) => (
                    <Badge key={m.player.id} tone="info">
                      {m.player.displayName}
                      <button className="ml-1 text-danger" onClick={() => handleRemoveMember(team.id, m.player.id)} disabled={busy}>
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    placeholder="Athlete profile ID"
                    value={playerId[team.id] ?? ""}
                    onChange={(e) => setPlayerId((s) => ({ ...s, [team.id]: e.target.value }))}
                    className="h-8 w-56 rounded-md border border-border bg-surface-raised px-2 text-xs"
                  />
                  <Button size="sm" variant="secondary" disabled={busy} onClick={() => handleAddMember(team.id)}>
                    Add Athlete
                  </Button>
                </div>
              </div>
            ))
          )}
          {message && <p className="text-xs text-text-muted">{message}</p>}
        </CardContent>
      </Card>

      {teams.length >= 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Create Team bout</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            <select className="h-9 rounded-md border border-border bg-surface-raised px-2 text-sm" value={redTeamId} onChange={(e) => setRedTeamId(e.target.value)}>
              <option value="">AKA Team</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <select className="h-9 rounded-md border border-border bg-surface-raised px-2 text-sm" value={blueTeamId} onChange={(e) => setBlueTeamId(e.target.value)}>
              <option value="">AO Team</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1 text-xs text-text-muted">
              <input type="checkbox" checked={bunkaiRequired} onChange={(e) => setBunkaiRequired(e.target.checked)} />
              Medal match (requires Bunkai)
            </label>
            <Button size="sm" disabled={busy} onClick={handleCreateTeamBout}>
              Create bout
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
