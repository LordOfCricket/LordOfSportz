import type { UserRole } from "@karate/types";
import { ROLE_LABELS } from "@/lib/navigation";
import { Badge } from "@/components/ui/Badge";
import { SignOutButton } from "./SignOutButton";

export function Topbar({ role, userName }: { role: UserRole; userName: string }) {
  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-surface-raised px-6">
      <div>
        <p className="text-sm font-semibold text-text-primary">Welcome back, {userName}</p>
        <p className="text-xs text-text-muted">{ROLE_LABELS[role]} dashboard</p>
      </div>
      <div className="flex items-center gap-3">
        <Badge tone="neutral">{ROLE_LABELS[role]}</Badge>
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
