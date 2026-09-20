"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import type { ActionResult } from "@/lib/server/actions";

interface CreateProfileCardProps {
  title: string;
  description: string;
  submitLabel?: string;
  onSubmit: () => Promise<ActionResult>;
  children: ReactNode;
}

/** Shared shell for the four roles' "create your profile" forms — one submit/loading/error pattern. */
export function CreateProfileCard({
  title,
  description,
  submitLabel = "Create profile",
  onSubmit,
  children,
}: CreateProfileCardProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await onSubmit();
      if (!result.success) {
        setError(result.message ?? "Something went wrong. Please try again.");
        return;
      }
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="border-accent/30">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-4 text-sm text-text-secondary">{description}</p>
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          {error && <Alert tone="danger" title={error} />}
          {children}
          <Button type="submit" isLoading={isSubmitting} disabled={isSubmitting} className="self-start">
            {submitLabel}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
