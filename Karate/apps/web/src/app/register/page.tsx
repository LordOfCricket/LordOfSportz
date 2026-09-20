"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { registerRequestSchema } from "@karate/validation";
import { USER_ROLES, type UserRole } from "@karate/types";
import { AuthCard } from "@/components/auth/AuthCard";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { registerUser, AuthRequestError } from "@/lib/client/auth-client";
import { roleDashboardPath } from "@/lib/client/role-routes";

const ROLE_LABELS: Record<UserRole, string> = {
  PLAYER: "Player",
  COACH: "Coach",
  ACADEMY: "Academy",
  SCORER: "Scorer",
};

type FieldErrors = Partial<Record<"email" | "password" | "confirmPassword" | "fullName" | "role", string>>;

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState<UserRole>("PLAYER");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    if (password !== confirmPassword) {
      setFieldErrors({ confirmPassword: "Passwords do not match." });
      return;
    }

    const parsed = registerRequestSchema.safeParse({ email, password, fullName, role });
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
      const user = await registerUser(parsed.data);
      router.push(roleDashboardPath((user.roles[0] as UserRole | undefined) ?? role));
      router.refresh();
    } catch (error) {
      if (error instanceof AuthRequestError) {
        setFormError(error.message);
      } else {
        setFormError("Something went wrong. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthCard
      title="Create your account"
      subtitle="Join as a player, coach, academy, or scorer."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-white hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {formError && <Alert tone="danger" title={formError} />}

        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-sm font-medium text-text-primary">I am a</legend>
          <div className="grid grid-cols-2 gap-2">
            {USER_ROLES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                aria-pressed={role === r}
                className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                  role === r
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border text-text-secondary hover:bg-surface-sunken"
                }`}
              >
                {ROLE_LABELS[r]}
              </button>
            ))}
          </div>
        </fieldset>

        <Input
          label="Full name"
          autoComplete="name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          errorMessage={fieldErrors.fullName}
          required
        />
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
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          errorMessage={fieldErrors.password}
          hint="At least 12 characters, with an uppercase letter and a number."
          required
        />
        <PasswordInput
          label="Confirm password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          errorMessage={fieldErrors.confirmPassword}
          required
        />

        <Button type="submit" size="lg" isLoading={isSubmitting} disabled={isSubmitting}>
          Create account
        </Button>
      </form>
    </AuthCard>
  );
}
