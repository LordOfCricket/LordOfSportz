import Link from "next/link";
import { getCurrentUserOrRedirect } from "@/lib/server/current-user";
import { getMyAssignments, getSchedule, type ScheduleEntryRow } from "@/lib/server/domain";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

const LIVE_STATUSES = new Set(["CALLED", "READY", "IN_PROGRESS", "PAUSED"]);

/** Real data, not a placeholder: cross-references this Scorer's ACTIVE assignments against each assigned tournament's published schedule to surface only the bouts they can actually act on right now. */
export default async function ScorerLivePage() {
  await getCurrentUserOrRedirect("/dashboard/scorer/live");
  const assignments = (await getMyAssignments()).filter((a) => a.status === "ASSIGNED" || a.status === "CONFIRMED");

  const tournamentIds = [...new Set(assignments.map((a) => a.tournamentId))];
  const schedulesByTournament = new Map(
    await Promise.all(tournamentIds.map(async (id) => [id, await getSchedule(id)] as const)),
  );

  const liveEntries: { entry: ScheduleEntryRow; tournamentName: string; function: string }[] = [];
  for (const a of assignments) {
    const schedule = schedulesByTournament.get(a.tournamentId);
    if (!schedule) continue;
    for (const entry of schedule.entries) {
      if (!LIVE_STATUSES.has(entry.boutStatus)) continue;
      if (a.tatamiId && entry.tatami?.id !== a.tatamiId) continue;
      if (a.competitionId && entry.competitionId !== a.competitionId) continue;
      liveEntries.push({ entry, tournamentName: a.tournament?.name ?? "Tournament", function: a.function });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Live bouts on my assignments</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {liveEntries.length === 0 ? (
          <EmptyState
            title="No live bouts right now"
            description="Bouts on your assigned tatami will appear here once they are called or in progress."
          />
        ) : (
          liveEntries.map(({ entry, tournamentName, function: fn }) => (
            <Link
              key={entry.id}
              href={`/bout/${entry.boutId}/${entry.discipline === "KATA" ? "kata-live" : "live"}`}
              className="flex items-center justify-between rounded-md border border-border p-3 hover:bg-surface-sunken"
            >
              <div>
                <p className="text-sm font-medium text-text-primary">
                  {tournamentName} · {entry.redPlayerName ?? "BYE"} vs {entry.bluePlayerName ?? "BYE"}
                </p>
                <p className="text-xs text-text-muted">
                  {entry.tatami ? `${entry.tatami.label} · ` : ""}Your function: {fn}
                </p>
              </div>
              <Badge tone="info">{entry.boutStatus}</Badge>
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}
