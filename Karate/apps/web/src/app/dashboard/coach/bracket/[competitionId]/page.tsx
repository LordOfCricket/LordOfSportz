import { getCurrentUserOrRedirect } from "@/lib/server/current-user";
import { getDraw, getRoundRobinStandings } from "@/lib/server/domain";
import { BracketViewer } from "@/components/domain/BracketViewer";
import { StandingsTable } from "@/components/domain/StandingsTable";

export default async function CoachBracketPage({ params }: { params: { competitionId: string } }) {
  await getCurrentUserOrRedirect(`/dashboard/coach/bracket/${params.competitionId}`);
  const draw = await getDraw(params.competitionId);
  const standings = draw?.bracketType === "ROUND_ROBIN" ? await getRoundRobinStandings(draw.id) : null;
  const nameById = Object.fromEntries((draw?.seeds ?? []).map((s) => [s.playerId, s.displayName]));
  return (
    <div className="flex flex-col gap-6">
      {standings && standings.standings.length > 0 && <StandingsTable standings={standings.standings} nameById={nameById} />}
      <BracketViewer draw={draw} />
    </div>
  );
}
