import { getCurrentUserOrRedirect } from "@/lib/server/current-user";
import { getMyAssignments } from "@/lib/server/domain";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = {
  ASSIGNED: "warning",
  CONFIRMED: "success",
  DECLINED: "danger",
  COMPLETED: "info",
  REVOKED: "danger",
};

export default async function ScorerAssignmentsPage() {
  await getCurrentUserOrRedirect("/dashboard/scorer/assignments");
  const assignments = await getMyAssignments();

  return (
    <Card>
      <CardHeader>
        <CardTitle>My assignments</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {assignments.length === 0 ? (
          <EmptyState
            title="No assignments yet"
            description="Tournament organizers will assign you an official function here."
          />
        ) : (
          assignments.map((a) => (
            <div key={a.id} className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <p className="text-sm font-medium text-text-primary">
                  {a.tournament?.name ?? "Tournament"} · {a.function}
                </p>
                <p className="text-xs text-text-muted">
                  {a.tatami ? `${a.tatami.label} · ` : ""}
                  {a.startAt ? new Date(a.startAt).toLocaleString() : "No fixed window"}
                </p>
              </div>
              <Badge tone={STATUS_TONE[a.status] ?? "neutral"}>{a.status}</Badge>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
