"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { reevaluateEligibilityAction } from "@/lib/server/actions";

export function ReevaluateButton({ registrationId }: { registrationId: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleClick() {
    setState("loading");
    const result = await reevaluateEligibilityAction(registrationId);
    if (result.success) {
      setState("idle");
      router.refresh();
    } else {
      setState("error");
      setMessage(result.message ?? "Could not re-check eligibility.");
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant="ghost" onClick={handleClick} isLoading={state === "loading"}>
        Re-check eligibility
      </Button>
      {state === "error" && <span className="max-w-[16rem] text-right text-xs text-danger">{message}</span>}
    </div>
  );
}
