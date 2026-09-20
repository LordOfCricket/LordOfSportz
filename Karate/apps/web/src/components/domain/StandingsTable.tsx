import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type { StandingRow } from "@/lib/server/domain";

/** Art. 5.11 — round-robin group standings. Read-only: there is nothing to mutate here, standings are always recomputed fresh from finalized results. */
export function StandingsTable({ standings, nameById }: { standings: StandingRow[]; nameById: Record<string, string> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Group standings</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {standings.map((s) => (
          <div key={s.playerId} className="flex items-center justify-between rounded-md border border-border p-2 text-sm">
            <span className="w-8 font-semibold">{s.rank}</span>
            <span className="flex-1">{nameById[s.playerId] ?? s.playerId}</span>
            <span className="w-16 text-text-muted">{s.victoryPoints} pts</span>
            <span className="w-24 text-text-muted">
              {s.totalVotesFor}-{s.totalVotesAgainst} votes
            </span>
            {s.tieUnresolved && <Badge tone="warning">Extra Kata needed</Badge>}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
