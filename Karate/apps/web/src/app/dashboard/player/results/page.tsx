import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { getCurrentUserOrRedirect } from "@/lib/server/current-user";
import { getMyResults } from "@/lib/server/domain";

export default async function PlayerResultsPage() {
  await getCurrentUserOrRedirect("/dashboard/player/results");
  const results = await getMyResults();
  return <Card><CardHeader><CardTitle>Results history</CardTitle><Badge tone="neutral">{results.length} bouts</Badge></CardHeader><CardContent className="flex flex-col gap-3">{results.length === 0 ? <p className="text-sm text-text-secondary">No finalized results yet.</p> : results.map((row) => <div key={row.boutId} className="flex items-center justify-between border-b border-border pb-3 text-sm"><div><p className="font-medium text-text-primary">{row.tournament.name}</p><p className="text-text-secondary">{row.discipline} · vs {row.opponent?.displayName ?? "Team"}</p></div><div className="flex items-center gap-2"><Badge tone={row.result.winnerPlayerId === null ? "neutral" : row.result.winnerPlayerId === row.playerId ? "success" : "danger"}>{row.result.method}</Badge><span className="text-text-muted">{row.date ? new Date(row.date).toLocaleDateString() : ""}</span></div></div>)}</CardContent></Card>;
}
