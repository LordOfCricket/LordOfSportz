import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { PendingRequestActions } from "./PendingRequestActions";
import type { IncomingRequestRow } from "@/lib/server/domain";

export function IncomingRequestsList({
  academyId,
  requests,
}: {
  academyId: string;
  requests: IncomingRequestRow[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pending requests</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {requests.length === 0 ? (
          <EmptyState
            title="No pending requests"
            description="Coach and player requests to join will appear here."
          />
        ) : (
          requests.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-text-primary">
                  {r.applicant?.displayName ?? "Unknown"}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <Badge tone="neutral">{r.targetType}</Badge>
                  <span className="text-xs text-text-muted">
                    {new Date(r.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <PendingRequestActions academyId={academyId} requestId={r.id} />
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
