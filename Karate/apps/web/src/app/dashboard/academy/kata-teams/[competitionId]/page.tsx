import { getCurrentUserOrRedirect } from "@/lib/server/current-user";
import { getMyAcademies, getKataTeams } from "@/lib/server/domain";
import { KataTeamsPanel } from "@/components/domain/KataTeamsPanel";
import { EmptyState } from "@/components/ui/EmptyState";

export default async function AcademyKataTeamsPage({ params }: { params: { competitionId: string } }) {
  await getCurrentUserOrRedirect(`/dashboard/academy/kata-teams/${params.competitionId}`);
  const academies = await getMyAcademies();
  const academy = academies[0];
  if (!academy) {
    return <EmptyState title="No academy found" description="Create your academy profile first." />;
  }
  const teams = await getKataTeams(params.competitionId);
  return <KataTeamsPanel academyId={academy.id} competitionId={params.competitionId} teams={teams} />;
}
