"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { withdrawRegistrationAction } from "@/lib/server/actions";

export function WithdrawButton({ registrationId }: { registrationId: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleClick() {
    setState("loading");
    const result = await withdrawRegistrationAction(registrationId);
    if (result.success) {
      router.refresh();
    } else {
      setState("error");
      setMessage(result.message ?? "Could not withdraw the registration.");
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant="danger" onClick={handleClick} isLoading={state === "loading"}>
        Withdraw
      </Button>
      {state === "error" && <span className="max-w-[16rem] text-right text-xs text-danger">{message}</span>}
    </div>
  );
}
