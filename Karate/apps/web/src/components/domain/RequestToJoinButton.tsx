"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { requestToJoinAcademyAction } from "@/lib/server/actions";

export function RequestToJoinButton({ academyId }: { academyId: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleClick() {
    setState("loading");
    const result = await requestToJoinAcademyAction(academyId);
    if (result.success) {
      setState("sent");
      router.refresh();
    } else {
      setState("error");
      setMessage(result.message ?? "Could not send the request.");
    }
  }

  if (state === "sent") {
    return <span className="text-xs font-medium text-success">Request sent</span>;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant="secondary" onClick={handleClick} isLoading={state === "loading"}>
        Request to join
      </Button>
      {state === "error" && <span className="text-xs text-danger">{message}</span>}
    </div>
  );
}
