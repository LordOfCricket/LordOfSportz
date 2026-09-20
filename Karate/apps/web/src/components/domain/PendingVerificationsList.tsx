"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { verifyBeltHistoryAction } from "@/lib/server/actions";
import type { PendingVerificationRow } from "@/lib/server/domain";

function Row({ row }: { row: PendingVerificationRow }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"VERIFIED" | "REJECTED" | null>(null);

  async function resolve(status: "VERIFIED" | "REJECTED") {
    setBusy(status);
    try {
      await verifyBeltHistoryAction(row.id, status);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center justify-between text-sm">
      <div>
        <p className="font-medium text-text-primary">{row.player.displayName}</p>
        <p className="text-xs text-text-muted">
          {row.beltGrade.name} · {new Date(row.awardedDate).toLocaleDateString()}
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => resolve("VERIFIED")}
          isLoading={busy === "VERIFIED"}
          disabled={busy !== null}
        >
          Verify
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => resolve("REJECTED")}
          isLoading={busy === "REJECTED"}
          disabled={busy !== null}
        >
          Reject
        </Button>
      </div>
    </div>
  );
}

export function PendingVerificationsList({ rows }: { rows: PendingVerificationRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pending grade verifications</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {rows.length === 0 ? (
          <EmptyState
            title="Nothing to verify"
            description="Finalized awards will appear here until verified."
          />
        ) : (
          rows.map((r) => <Row key={r.id} row={r} />)
        )}
      </CardContent>
    </Card>
  );
}
