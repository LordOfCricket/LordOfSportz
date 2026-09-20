import type { ReactNode } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { getCurrentUserOrRedirect } from "@/lib/server/current-user";

export default async function CoachLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUserOrRedirect("/dashboard/coach");

  return (
    <DashboardShell role="COACH" userName={user.fullName}>
      {children}
    </DashboardShell>
  );
}
