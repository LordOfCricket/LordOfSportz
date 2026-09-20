import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { getCurrentUserOrRedirect } from "@/lib/server/current-user";
import { getRanking, getRankingCategories } from "@/lib/server/domain";

export default async function PlayerRankingsPage() {
  await getCurrentUserOrRedirect("/dashboard/player/rankings");
  const categories = await getRankingCategories();
  const category = categories[0];
  const rows = category ? await getRanking(category.id) : [];
  return <Card><CardHeader><CardTitle>Rankings</CardTitle><Badge tone="neutral">{category ? `${category.rankingSeason.rankingSystem.name} · ${category.rankingSeason.season.name}` : "No ranking published"}</Badge></CardHeader><CardContent className="flex flex-col gap-2">{rows.length === 0 ? <p className="text-sm text-text-secondary">No ranking entries available.</p> : rows.map((row) => <div key={row.player.displayName} className="flex items-center justify-between border-b border-border py-2 text-sm"><span>{row.rank}. {row.player.displayName}</span><strong>{row.points.toString()} pts</strong></div>)}</CardContent></Card>;
}