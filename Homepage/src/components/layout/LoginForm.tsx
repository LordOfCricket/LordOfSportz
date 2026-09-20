"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loginRequest } from "@/lib/auth";

const field = "w-full rounded-lg border border-line bg-ink-2 px-4 py-3 text-paper outline-none focus:border-accent";

export default function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    const failure = await loginRequest(String(data.get("identifier")), String(data.get("password")));
    setBusy(false);
    if (failure) return setError(failure);
    router.push("/");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4">
      <label className="flex flex-col gap-2 text-sm text-muted">
        Email or phone
        <input name="identifier" required autoComplete="username" className={field} />
      </label>
      <label className="flex flex-col gap-2 text-sm text-muted">
        Password
        <input name="password" type="password" required autoComplete="current-password" className={field} />
      </label>
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      <button type="submit" disabled={busy} className="rounded-full bg-accent px-6 py-3 text-sm font-semibold text-ink disabled:opacity-60">
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
