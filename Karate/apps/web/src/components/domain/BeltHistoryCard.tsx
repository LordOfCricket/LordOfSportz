import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import type { BeltHistoryResponse } from "@/lib/server/domain";

const VERIFICATION_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  VERIFIED: "success",
  PENDING: "warning",
  UNVERIFIED: "neutral",
  REJECTED: "danger",
};

export function BeltHistoryCard({ data }: { data: BeltHistoryResponse | null }) {
  if (!data || data.history.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Belt & grade</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            title="No grade on record"
            description="Your belt history will appear here once an academy awards you a grade."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Current grade</CardTitle>
        {data.current && (
          <Badge tone={VERIFICATION_TONE[data.current.verificationStatus] ?? "neutral"}>
            {data.current.verificationStatus}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {data.current ? (
          <div>
            <p className="text-sm font-medium text-text-primary">{data.current.beltGrade.name}</p>
            <p className="text-xs text-text-muted">
              Awarded {new Date(data.current.awardedDate).toLocaleDateString()}
            </p>
            {data.current.certificate && (
              <p className="mt-1 text-xs text-text-muted">
                Certificate {data.current.certificate.serialNumber}
              </p>
            )}
          </div>
        ) : (
          <EmptyState title="No current grade" />
        )}

        {data.history.length > 1 && (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">History</p>
            <ul className="flex flex-col gap-2">
              {data.history
                .filter((h) => !h.isCurrent)
                .map((h) => (
                  <li key={h.id} className="flex items-center justify-between text-sm">
                    <span className="text-text-secondary">{h.beltGrade.name}</span>
                    <span className="text-xs text-text-muted">
                      {new Date(h.awardedDate).toLocaleDateString()}
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
