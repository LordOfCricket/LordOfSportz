import { getCurrentUserOrRedirect } from "@/lib/server/current-user";
import { getSchedule, getTatamis, getTournamentAssignments } from "@/lib/server/domain";
import { ScheduleManagementPanel } from "@/components/domain/ScheduleManagementPanel";
import { ScheduleList } from "@/components/domain/ScheduleList";
import { TatamiPanel } from "@/components/domain/TatamiPanel";
import { OfficialsPanel } from "@/components/domain/OfficialsPanel";

export default async function AcademyTournamentSchedulePage({
  params,
}: {
  params: { tournamentId: string };
}) {
  await getCurrentUserOrRedirect(`/dashboard/academy/schedule/${params.tournamentId}`);
  const [schedule, tatamis, assignments] = await Promise.all([
    getSchedule(params.tournamentId),
    getTatamis(params.tournamentId),
    getTournamentAssignments(params.tournamentId),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <TatamiPanel tournamentId={params.tournamentId} tatamis={tatamis} />
      <ScheduleManagementPanel tournamentId={params.tournamentId} schedule={schedule} />
      <ScheduleList title="Full schedule" entries={schedule?.entries ?? []} />
      <OfficialsPanel tournamentId={params.tournamentId} assignments={assignments} tatamis={tatamis} />
    </div>
  );
}
