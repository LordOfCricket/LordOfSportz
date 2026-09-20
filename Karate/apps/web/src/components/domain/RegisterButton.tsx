"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { createRegistrationAction } from "@/lib/server/actions";

export function RegisterButton({ competitionId }: { competitionId: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleClick() {
    setState("loading");
    const result = await createRegistrationAction(competitionId);
    if (result.success) {
      setState("done");
      router.refresh();
    } else {
      setState("error");
      setMessage(result.message ?? "Could not submit the registration.");
    }
  }

  if (state === "done") {
    return <span className="text-xs font-medium text-success">Registered</span>;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" onClick={handleClick} isLoading={state === "loading"}>
        Register
      </Button>
      {state === "error" && <span className="max-w-[16rem] text-right text-xs text-danger">{message}</span>}
    </div>
  );
}
