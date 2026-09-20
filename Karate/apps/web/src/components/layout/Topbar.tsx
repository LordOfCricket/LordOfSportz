import type { UserRole } from "@karate/types";
import { ROLE_LABELS } from "@/lib/navigation";
import { Badge } from "@/components/ui/Badge";
import Link from "next/link";
import { SignOutButton } from "./SignOutButton";

export function Topbar({ role, userName }: { role: UserRole; userName: string }) {
  return (
    <header className="flex h-16 items-center justify-between gap-3 border-b border-border bg-surface-raised px-4 md:px-6">
      <Link href="/" className="flex items-center gap-2 md:hidden" aria-label="Karate Platform home">
        <span className="h-2.5 w-2.5 rounded-full bg-accent" aria-hidden="true" />
        <span className="text-sm font-semibold tracking-tight text-text-primary">Karate</span>
      </Link>
      <div className="hidden min-w-0 md:block">
        <p className="truncate text-sm font-semibold text-text-primary">Welcome back, {userName}</p>
        <p className="text-xs text-text-muted">{ROLE_LABELS[role]} dashboard</p>
      </div>
      <div className="flex items-center gap-3">
        <span className="hidden sm:inline-flex"><Badge tone="neutral">{ROLE_LABELS[role]}</Badge></span>
        <div
          aria-hidden="true"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-sm font-semibold text-white"
        >
          {userName.charAt(0).toUpperCase()}
        </div>
        <SignOutButton />
      </div>
    </header>
  );
}
