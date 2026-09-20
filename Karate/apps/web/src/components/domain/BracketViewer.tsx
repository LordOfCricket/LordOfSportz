import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import type { DrawDetail } from "@/lib/server/domain";

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = {
  DRAFT: "neutral",
  PUBLISHED: "info",
  LOCKED: "success",
  SUPERSEDED: "danger",
};

export function BracketViewer({ draw }: { draw: DrawDetail | null }) {
  if (!draw) {
    return (
      <Card>
        <CardContent>
          <EmptyState
            title="No draw yet"
            description="A bracket will appear here once the organizer generates one."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {draw.bracketType === "SINGLE_ELIMINATION" ? "Single elimination bracket" : "Round robin"} · v
          {draw.version}
        </CardTitle>
        <Badge tone={STATUS_TONE[draw.status] ?? "neutral"}>{draw.status}</Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {draw.rounds.map((round) => (
          <div key={round.id} className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-text-primary">
              {round.name ?? `Round ${round.roundNumber}`}
            </p>
            <div className="flex flex-col gap-2">
              {round.bouts.map((bout) => (
                <div
                  key={bout.id}
                  className="flex items-center justify-between rounded-md border border-border p-2 text-sm"
                >
                  <span className="text-text-secondary">
                    {bout.redPlayerName ?? "BYE"} vs {bout.bluePlayerName ?? "BYE"}
                  </span>
                  <Badge tone={bout.isBye ? "neutral" : "info"}>{bout.isBye ? "BYE" : bout.status}</Badge>
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
