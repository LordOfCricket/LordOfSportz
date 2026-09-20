"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { createGradingEventAction } from "@/lib/server/actions";
import type { BeltSystemRef } from "@/lib/server/domain";

export function CreateGradingEventForm({
  academyId,
  beltSystems,
}: {
  academyId: string;
  beltSystems: BeltSystemRef[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [beltSystemId, setBeltSystemId] = useState(beltSystems[0]?.id ?? "");
  const [eventDate, setEventDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await createGradingEventAction(academyId, { name, beltSystemId, eventDate });
      if (!result.success) {
        setError(result.message ?? "Could not create the grading event.");
        return;
      }
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  if (beltSystems.length === 0) {
    return (
      <Alert tone="info" title="No belt systems available yet">
        Create a belt system first before scheduling a grading event.
      </Alert>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
      {error && <Alert tone="danger" title={error} />}
      <Input label="Event name" value={name} onChange={(e) => setName(e.target.value)} required />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="beltSystem" className="text-sm font-medium text-text-primary">
          Belt system
        </label>
        <select
          id="beltSystem"
          value={beltSystemId}
          onChange={(e) => setBeltSystemId(e.target.value)}
          className="h-10 rounded-md border border-border bg-surface-raised px-3 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {beltSystems.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <Input
        label="Event date"
        type="date"
        value={eventDate}
        onChange={(e) => setEventDate(e.target.value)}
        required
      />
      <Button type="submit" isLoading={isSubmitting} disabled={isSubmitting} className="self-start">
        Create grading event
      </Button>
    </form>
  );
}
