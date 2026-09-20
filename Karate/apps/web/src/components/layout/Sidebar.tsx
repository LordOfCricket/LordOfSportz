"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { UserRole } from "@karate/types";
import { ROLE_NAVIGATION, ROLE_LABELS } from "@/lib/navigation";
import { cn } from "@/lib/cn";

export function Sidebar({ role }: { role: UserRole }) {
  const pathname = usePathname();
  const items = ROLE_NAVIGATION[role];

  return (
    <nav
      aria-label={`${ROLE_LABELS[role]} navigation`}
      className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-surface-raised"
    >
      <div className="flex h-16 items-center gap-2 border-b border-border px-5">
        <span className="h-2.5 w-2.5 rounded-full bg-accent" aria-hidden="true" />
        <span className="text-sm font-semibold tracking-tight text-text-primary">Karate Platform</span>
      </div>
      <ul className="flex flex-1 flex-col gap-1 p-3">
        {items.map((item) => {
          const isActive = pathname === item.href;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-accent/10 text-accent"
                    : "text-text-secondary hover:bg-surface-sunken hover:text-text-primary",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
