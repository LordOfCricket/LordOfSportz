import { getMyAcademies, getAcademyUpcomingBouts } from "@/lib/server/domain";
import { CreateAcademyForm } from "@/components/domain/CreateAcademyForm";
import { ScheduleList } from "@/components/domain/ScheduleList";

export default async function AcademySchedulePage() {
  const academies = await getMyAcademies();
  if (academies.length === 0) {
    return <CreateAcademyForm />;
  }
  const primary = academies[0]!;
  const entries = await getAcademyUpcomingBouts(primary.id);
  return (
    <ScheduleList
      title={`${primary.name}'s players — upcoming bouts`}
      entries={entries}
      emptyDescription="Published bouts for your players will appear here."
    />
  );
}
