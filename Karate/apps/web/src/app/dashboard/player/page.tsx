import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { getCurrentUserOrRedirect } from "@/lib/server/current-user";
import {
  getPlayerProfile,
  getPlayerMemberships,
  getPlayerPendingRequests,
  getMyBeltHistory,
} from "@/lib/server/domain";
import { PlayerProfileForm } from "@/components/domain/PlayerProfileForm";
import { MembershipList } from "@/components/domain/MembershipList";
import { AcademyFinder } from "@/components/domain/AcademyFinder";
import { BeltHistoryCard } from "@/components/domain/BeltHistoryCard";

export default async function PlayerOverviewPage({ searchParams }: { searchParams: { q?: string } }) {
  const user = await getCurrentUserOrRedirect("/dashboard/player");
  const profile = await getPlayerProfile();
  const [memberships, pendingRequests, beltHistory] = profile
    ? await Promise.all([getPlayerMemberships(), getPlayerPendingRequests(), getMyBeltHistory()])
    : [[], [], null];
  const hasAcademyRelationship = memberships.length > 0 || pendingRequests.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Signed in as</CardTitle>
          <Badge tone="success">Live account data</Badge>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm">
          <p className="font-medium text-text-primary">{user.fullName}</p>
          <p className="text-text-secondary">{user.email}</p>
        </CardContent>
      </Card>

      {!profile ? (
        <PlayerProfileForm />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Player profile</CardTitle>
              <Badge tone={profile.status === "ACTIVE" ? "success" : "neutral"}>{profile.status}</Badge>
            </CardHeader>
            <CardContent className="flex flex-col gap-1 text-sm">
              <p className="font-medium text-text-primary">{profile.displayName}</p>
              <p className="text-text-secondary">{profile.primaryStyle?.name ?? "No style set"}</p>
            </CardContent>
          </Card>

          <BeltHistoryCard data={beltHistory} />

          <MembershipList memberships={memberships} pendingRequests={pendingRequests} />
          {!hasAcademyRelationship && (
            <AcademyFinder dashboardPath="/dashboard/player" query={searchParams.q} />
          )}
        </>
      )}
    </div>
  );
}
