"use client";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";

export default function PlayerOverviewError({ reset }: { error: Error; reset: () => void }) {
  return (
    <Alert tone="danger" title="We couldn't load your dashboard">
      <p>Please try again. If this keeps happening, contact your academy administrator.</p>
      <Button variant="secondary" size="sm" className="mt-3" onClick={reset}>
        Retry
      </Button>
    </Alert>
  );
}
