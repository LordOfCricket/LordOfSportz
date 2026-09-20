import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { StatTile } from "@/components/ui/StatTile";
import {
  getMyAcademies,
  getAcademyById,
  getAcademyPendingRequests,
  getAcademyPendingVerifications,
} from "@/lib/server/domain";
import { CreateAcademyForm } from "@/components/domain/CreateAcademyForm";
import { IncomingRequestsList } from "@/components/domain/IncomingRequestsList";
import { GradingEventsPanel } from "@/components/domain/GradingEventsPanel";
import { PendingVerificationsList } from "@/components/domain/PendingVerificationsList";

export default async function AcademyOverviewPage() {
  const academies = await getMyAcademies();

  if (academies.length === 0) {
    return <CreateAcademyForm />;
  }

  const primary = academies[0]!;
  const [detail, pendingRequests, pendingVerifications] = await Promise.all([
    getAcademyById(primary.id),
    getAcademyPendingRequests(primary.id),
    getAcademyPendingVerifications(primary.id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{primary.name}</CardTitle>
          <Badge tone={primary.status === "ACTIVE" ? "success" : "neutral"}>{primary.status}</Badge>
        </CardHeader>
        <CardContent className="text-sm text-text-secondary">
          You administer this academy as{" "}
          <span className="font-medium text-text-primary">{primary.adminRole}</span>.
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Players" value={detail?.playerCount ?? 0} />
        <StatTile label="Coaches" value={detail?.coachCount ?? 0} />
        <StatTile label="Pending requests" value={pendingRequests.length} />
        <StatTile label="Pending verifications" value={pendingVerifications.length} />
      </div>

      <IncomingRequestsList academyId={primary.id} requests={pendingRequests} />
      <GradingEventsPanel academyId={primary.id} />
      <PendingVerificationsList rows={pendingVerifications} />
    </div>
  );
}
