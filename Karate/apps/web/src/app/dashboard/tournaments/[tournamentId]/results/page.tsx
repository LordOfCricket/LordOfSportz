import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { getCurrentUserOrRedirect } from "@/lib/server/current-user";
import { getTournamentResults } from "@/lib/server/domain";

export default async function TournamentResultsPage({ params }: { params: { tournamentId: string } }) {
  await getCurrentUserOrRedirect(`/dashboard/tournaments/${params.tournamentId}/results`);
  const results = await getTournamentResults(params.tournamentId);
  return <Card><CardHeader><CardTitle>Tournament results</CardTitle><Badge tone="neutral">{results.length} finalized bouts</Badge></CardHeader><CardContent className="flex flex-col gap-3">{results.length === 0 ? <p className="text-sm text-text-secondary">No finalized results yet.</p> : results.map((row) => <div key={row.boutId} className="flex items-center justify-between border-b border-border pb-3 text-sm"><span>{row.redPlayer?.displayName ?? "Team"} vs {row.bluePlayer?.displayName ?? "Team"}</span><Badge tone="neutral">{row.result.method}</Badge></div>)}</CardContent></Card>;
}