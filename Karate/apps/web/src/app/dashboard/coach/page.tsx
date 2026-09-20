import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import {
  getCoachProfile,
  getCoachAffiliations,
  getCoachPendingRequests,
  getMyStudentsGrades,
} from "@/lib/server/domain";
import { CoachProfileForm } from "@/components/domain/CoachProfileForm";
import { MembershipList } from "@/components/domain/MembershipList";
import { AcademyFinder } from "@/components/domain/AcademyFinder";
import { StudentsGradesList } from "@/components/domain/StudentsGradesList";

export default async function CoachOverviewPage({ searchParams }: { searchParams: { q?: string } }) {
  const profile = await getCoachProfile();
  const [affiliations, pendingRequests, students] = profile
    ? await Promise.all([getCoachAffiliations(), getCoachPendingRequests(), getMyStudentsGrades()])
    : [[], [], []];
  const hasAcademyRelationship = affiliations.length > 0 || pendingRequests.length > 0;

  if (!profile) {
    return <CoachProfileForm />;
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Coach profile</CardTitle>
          <Badge tone={profile.status === "ACTIVE" ? "success" : "neutral"}>{profile.status}</Badge>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm">
          <p className="font-medium text-text-primary">{profile.displayName}</p>
          <p className="text-text-secondary">
            {profile.yearsActive ? `${profile.yearsActive} years coaching` : "Experience not set"}
          </p>
        </CardContent>
      </Card>

      <StudentsGradesList students={students} />

      <MembershipList memberships={affiliations} pendingRequests={pendingRequests} />
      {!hasAcademyRelationship && <AcademyFinder dashboardPath="/dashboard/coach" query={searchParams.q} />}
    </div>
  );
}
