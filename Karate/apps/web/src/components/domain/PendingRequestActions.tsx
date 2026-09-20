"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { resolveMembershipRequestAction } from "@/lib/server/actions";

export function PendingRequestActions({ academyId, requestId }: { academyId: string; requestId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<"ACCEPT" | "REJECT" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function resolve(action: "ACCEPT" | "REJECT") {
    setPending(action);
    setError(null);
    const result = await resolveMembershipRequestAction(academyId, requestId, action);
    if (result.success) {
      router.refresh();
    } else {
      setError(result.message ?? "Could not resolve this request.");
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => resolve("ACCEPT")}
          isLoading={pending === "ACCEPT"}
          disabled={pending !== null}
        >
          Accept
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => resolve("REJECT")}
          isLoading={pending === "REJECT"}
          disabled={pending !== null}
        >
          Reject
        </Button>
      </div>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
