import { getCurrentUserOrRedirect } from "@/lib/server/current-user";
import { getMyUpcomingBouts } from "@/lib/server/domain";
import { ScheduleList } from "@/components/domain/ScheduleList";

export default async function PlayerSchedulePage() {
  await getCurrentUserOrRedirect("/dashboard/player/schedule");
  const entries = await getMyUpcomingBouts();
  return (
    <ScheduleList
      title="My upcoming bouts"
      entries={entries}
      emptyDescription="Once a tournament publishes its schedule, your bouts will appear here."
    />
  );
}
