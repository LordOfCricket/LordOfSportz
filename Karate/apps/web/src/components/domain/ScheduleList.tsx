import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import type { ScheduleEntryRow } from "@/lib/server/domain";

const LIVE_STATUSES = new Set(["IN_PROGRESS", "PAUSED", "CALLED", "READY"]);

export function ScheduleList({
  title,
  entries,
  emptyDescription = "Nothing scheduled yet.",
}: {
  title: string;
  entries: ScheduleEntryRow[];
  emptyDescription?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {entries.length === 0 ? (
          <EmptyState title="No upcoming bouts" description={emptyDescription} />
        ) : (
          entries.map((e) => (
            <div key={e.id} className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <p className="text-sm font-medium text-text-primary">
                  {e.roundName ?? `Round ${e.roundNumber}`} · {e.redPlayerName ?? "BYE"} vs{" "}
                  {e.bluePlayerName ?? "BYE"}
                </p>
                <p className="text-xs text-text-muted">
                  {new Date(e.scheduledAt).toLocaleString()} · {e.estimatedDurationMinutes} min
                  {e.tatami ? ` · ${e.tatami.label}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone="info">{e.boutStatus}</Badge>
                {LIVE_STATUSES.has(e.boutStatus) && (
                  <Link
                    href={`/bout/${e.boutId}/${e.discipline === "KATA" ? "kata-live" : "live"}`}
                    className="text-xs font-medium text-accent hover:underline"
                  >
                    Live →
                  </Link>
                )}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
