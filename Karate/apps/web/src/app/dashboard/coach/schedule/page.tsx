import { getCurrentUserOrRedirect } from "@/lib/server/current-user";
import { getMyStudentsUpcomingBouts } from "@/lib/server/domain";
import { ScheduleList } from "@/components/domain/ScheduleList";

export default async function CoachSchedulePage() {
  await getCurrentUserOrRedirect("/dashboard/coach/schedule");
  const entries = await getMyStudentsUpcomingBouts();
  return (
    <ScheduleList
      title="Students' upcoming bouts"
      entries={entries}
      emptyDescription="Published bouts for players at your affiliated academies will appear here."
    />
  );
}
