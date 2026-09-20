import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import type { MembershipRow, PendingRequestRow } from "@/lib/server/domain";

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  ACTIVE: "success",
  PENDING: "warning",
  INVITED: "warning",
  LEFT: "neutral",
  TRANSFERRED: "neutral",
  SUSPENDED: "danger",
  REJECTED: "danger",
};

export function MembershipList({
  memberships,
  pendingRequests,
}: {
  memberships: MembershipRow[];
  pendingRequests: PendingRequestRow[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Academy relationship</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {memberships.length === 0 && pendingRequests.length === 0 && (
          <EmptyState
            title="No academy relationship yet"
            description="Search for an academy below to request to join."
          />
        )}

        {pendingRequests.map((r) => (
          <div key={r.id} className="flex items-center justify-between text-sm">
            <div>
              <p className="font-medium text-text-primary">{r.academy.name}</p>
              <p className="text-xs text-text-muted">
                Requested {new Date(r.createdAt).toLocaleDateString()}
              </p>
            </div>
            <Badge tone="warning">PENDING</Badge>
          </div>
        ))}

        {memberships.map((m) => (
          <div key={m.id} className="flex items-center justify-between text-sm">
            <div>
              <p className="font-medium text-text-primary">{m.academy.name}</p>
              {m.startedAt && (
                <p className="text-xs text-text-muted">Since {new Date(m.startedAt).toLocaleDateString()}</p>
              )}
            </div>
            <Badge tone={STATUS_TONE[m.status] ?? "neutral"}>{m.status}</Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
