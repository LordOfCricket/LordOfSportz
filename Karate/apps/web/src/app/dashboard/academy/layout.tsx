import type { ReactNode } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { getCurrentUserOrRedirect } from "@/lib/server/current-user";

export default async function AcademyLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUserOrRedirect("/dashboard/academy");

  return (
    <DashboardShell role="ACADEMY" userName={user.fullName}>
      {children}
    </DashboardShell>
  );
}
