import type { ReactNode } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { getCurrentUserOrRedirect } from "@/lib/server/current-user";

export default async function ScorerLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUserOrRedirect("/dashboard/scorer");

  return (
    <DashboardShell role="SCORER" userName={user.fullName}>
      {children}
    </DashboardShell>
  );
}
