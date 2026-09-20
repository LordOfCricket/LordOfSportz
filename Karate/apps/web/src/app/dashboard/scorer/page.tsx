import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { getScorerProfile } from "@/lib/server/domain";
import { ScorerProfileForm } from "@/components/domain/ScorerProfileForm";

const VERIFICATION_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  VERIFIED: "success",
  PENDING: "warning",
  UNVERIFIED: "neutral",
  REJECTED: "danger",
};

export default async function ScorerOverviewPage() {
  const profile = await getScorerProfile();

  if (!profile) {
    return <ScorerProfileForm />;
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Scorer profile</CardTitle>
          <Badge tone={profile.status === "ACTIVE" ? "success" : "neutral"}>{profile.status}</Badge>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm">
          <p className="font-medium text-text-primary">{profile.displayName}</p>
          <p className="text-text-secondary">{profile.certificationLevel ?? "No certification on file"}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Verification status</CardTitle>
        </CardHeader>
        <CardContent>
          <Badge tone={VERIFICATION_TONE[profile.verificationStatus] ?? "neutral"}>
            {profile.verificationStatus}
          </Badge>
          <p className="mt-2 text-xs text-text-muted">
            Tournament official assignments become available once your credentials are verified.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
