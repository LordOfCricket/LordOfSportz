import type { ReactNode } from "react";
import type { UserRole } from "@karate/types";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

interface DashboardShellProps {
  role: UserRole;
  userName: string;
  children: ReactNode;
}

/** Shared shell for all four role dashboards — one layout, role-scoped nav. */
export function DashboardShell({ role, userName, children }: DashboardShellProps) {
  return (
    <div className="flex h-screen bg-surface">
      <Sidebar role={role} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar role={role} userName={userName} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
