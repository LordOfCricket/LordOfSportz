import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { getCurrentUserOrRedirect } from "@/lib/server/current-user";
import { getMyStats } from "@/lib/server/domain";

export default async function PlayerStatsPage() {
  await getCurrentUserOrRedirect("/dashboard/player/stats");
  const stats = await getMyStats();
  if (!stats) return <Card><CardContent className="p-6 text-sm text-text-secondary">No statistics available.</CardContent></Card>;
  return <div className="grid gap-4 sm:grid-cols-2"><Card><CardHeader><CardTitle>Competition record</CardTitle></CardHeader><CardContent className="grid grid-cols-2 gap-3 text-sm"><span>Appearances <strong>{stats.appearances}</strong></span><span>Wins <strong>{stats.wins}</strong></span><span>Losses <strong>{stats.losses}</strong></span><span>Draws <strong>{stats.draws}</strong></span><span>Win rate <strong>{Math.round(stats.winRate * 100)}%</strong></span><span>Tournaments <strong>{stats.tournamentsEntered}</strong></span></CardContent></Card><Card><CardHeader><CardTitle>Discipline totals</CardTitle></CardHeader><CardContent className="grid grid-cols-2 gap-3 text-sm"><span>Kumite <strong>{stats.kumiteBouts}</strong></span><span>Kata <strong>{stats.kataBouts}</strong></span><span>Points scored <strong>{stats.pointsScored}</strong></span><span>Points conceded <strong>{stats.pointsConceded}</strong></span></CardContent></Card></div>;
}
