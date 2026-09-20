import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import {
  getAcademyGradingEvents,
  getBeltSystems,
  getGradingEventDetail,
  getBeltGrades,
  getAcademyActivePlayers,
} from "@/lib/server/domain";
import { CreateGradingEventForm } from "./CreateGradingEventForm";
import { GradingEventManager } from "./GradingEventManager";

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  DRAFT: "neutral",
  SCHEDULED: "warning",
  OPEN: "warning",
  IN_PROGRESS: "warning",
  COMPLETED: "success",
  FINALIZED: "success",
  CANCELLED: "danger",
};

const TERMINAL_STATUSES = new Set(["FINALIZED", "CANCELLED"]);

export async function GradingEventsPanel({ academyId }: { academyId: string }) {
  const [events, beltSystems, activePlayers] = await Promise.all([
    getAcademyGradingEvents(academyId),
    getBeltSystems(),
    getAcademyActivePlayers(academyId),
  ]);

  const activeEvent = events.find((e) => !TERMINAL_STATUSES.has(e.status));
  const [activeEventDetail, activeEventGrades] = activeEvent
    ? await Promise.all([getGradingEventDetail(activeEvent.id), getBeltGrades(activeEvent.beltSystemId)])
    : [null, []];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Grading events</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <CreateGradingEventForm academyId={academyId} beltSystems={beltSystems} />

        {events.length === 0 ? (
          <p className="text-sm text-text-muted">No grading events yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {events.map((e) => (
              <li key={e.id} className="flex items-center justify-between text-sm">
                <span className="font-medium text-text-primary">{e.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-muted">
                    {new Date(e.eventDate).toLocaleDateString()}
                  </span>
                  <Badge tone={STATUS_TONE[e.status] ?? "neutral"}>{e.status}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}

        {activeEventDetail && (
          <GradingEventManager
            academyId={academyId}
            event={activeEventDetail}
            grades={activeEventGrades}
            activePlayers={activePlayers}
          />
        )}
      </CardContent>
    </Card>
  );
}
