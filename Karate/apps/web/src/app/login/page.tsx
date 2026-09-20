"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { loginRequestSchema } from "@karate/validation";
import type { UserRole } from "@karate/types";
import { AuthCard } from "@/components/auth/AuthCard";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { loginUser, AuthRequestError } from "@/lib/client/auth-client";
import { roleDashboardPath } from "@/lib/client/role-routes";

type FieldErrors = Partial<Record<"email" | "password", string>>;

/** Only allow redirecting back into our own dashboard tree — never an external/open redirect. */
function safeRedirectTarget(raw: string | null): string | null {
  if (!raw) return null;
  return raw.startsWith("/dashboard/") ? raw : null;
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const sessionExpired = searchParams.get("sessionExpired") === "1";

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const parsed = loginRequestSchema.safeParse({ email, password });
    if (!parsed.success) {
      const errors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FieldErrors;
        if (!errors[key]) errors[key] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    setIsSubmitting(true);
    try {
      const user = await loginUser(parsed.data);
      const primaryRole = user.roles[0] as UserRole | undefined;
      const target =
        safeRedirectTarget(searchParams.get("redirect")) ??
        (primaryRole ? roleDashboardPath(primaryRole) : "/login");
      router.push(target);
      router.refresh();
    } catch (error) {
      setFormError(
        error instanceof AuthRequestError ? error.message : "Something went wrong. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthCard
      title="Sign in"
      subtitle="Welcome back to the Karate Platform."
      footer={
        <>
          New here?{" "}
          <Link href="/register" className="font-medium text-white hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {sessionExpired && <Alert tone="warning" title="Your session expired. Please sign in again." />}
        {formError && <Alert tone="danger" title={formError} />}

        <Input
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          errorMessage={fieldErrors.email}
          required
        />
        <PasswordInput
          label="Password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          errorMessage={fieldErrors.password}
          required
        />

        <Button type="submit" size="lg" isLoading={isSubmitting} disabled={isSubmitting}>
          Sign in
        </Button>
      </form>
    </AuthCard>
  );
}
