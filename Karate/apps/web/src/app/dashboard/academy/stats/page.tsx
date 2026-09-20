import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { getMyAcademies, getAcademyStats } from "@/lib/server/domain";

export default async function AcademyStatsPage() {
  const academies = await getMyAcademies();
  const stats = academies[0] ? await getAcademyStats(academies[0].id) : null;
  if (!stats) return <Card><CardContent className="p-6 text-sm text-text-secondary">No academy statistics available.</CardContent></Card>;
  return <Card><CardHeader><CardTitle>{academies[0]!.name} statistics</CardTitle></CardHeader><CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-5"><StatTile label="Players" value={stats.playerCount} /><StatTile label="Tournaments" value={stats.tournamentsParticipated} /><StatTile label="Wins" value={stats.wins} /><StatTile label="Losses" value={stats.losses} /><StatTile label="Medals" value={stats.medalsWon} /></CardContent></Card>;
}
