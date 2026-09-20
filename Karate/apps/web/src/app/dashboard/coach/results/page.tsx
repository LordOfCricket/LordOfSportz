import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { getCurrentUserOrRedirect } from "@/lib/server/current-user";
import { getCoachResults } from "@/lib/server/domain";

export default async function CoachResultsPage() {
  await getCurrentUserOrRedirect("/dashboard/coach/results");
  const results = await getCoachResults();
  return <Card><CardHeader><CardTitle>Student results</CardTitle><Badge tone="neutral">{results.length} bouts</Badge></CardHeader><CardContent className="flex flex-col gap-3">{results.length === 0 ? <p className="text-sm text-text-secondary">No finalized student results yet.</p> : results.map((row) => <div key={row.boutId} className="flex items-center justify-between border-b border-border pb-3 text-sm"><div><p className="font-medium text-text-primary">{row.tournament.name}</p><p className="text-text-secondary">{row.redPlayer?.displayName ?? "Team"} vs {row.bluePlayer?.displayName ?? "Team"}</p></div><Badge tone="neutral">{row.result.method}</Badge></div>)}</CardContent></Card>;
}
