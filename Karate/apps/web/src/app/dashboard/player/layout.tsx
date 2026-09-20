import type { ReactNode } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { getCurrentUserOrRedirect } from "@/lib/server/current-user";

export default async function PlayerLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUserOrRedirect("/dashboard/player");

  return (
    <DashboardShell role="PLAYER" userName={user.fullName}>
      {children}
    </DashboardShell>
  );
}
