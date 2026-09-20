import { notFound } from "next/navigation";
import { getCurrentUserOrRedirect } from "@/lib/server/current-user";
import { getBout, getKumiteState } from "@/lib/server/domain";
import { KumiteLivePanel, CoachVideoReviewRequest } from "@/components/domain/KumiteLivePanel";
import { EmptyState } from "@/components/ui/EmptyState";

/**
 * Shared live-bout page for every role. Function-gated controls (Referee/Judge/
 * Timekeeper/Video Review Judge) render only for a viewer who actually holds
 * that OfficialAssignment for this bout (resolved server-side by the Kumite
 * API itself — see myOfficialFunction) — everyone else gets the same
 * read-only scoreboard, matching "one score store, not one per client."
 */
export default async function LiveBoutPage({ params }: { params: { boutId: string } }) {
  const user = await getCurrentUserOrRedirect(`/bout/${params.boutId}/live`);
  const [bout, kumite] = await Promise.all([getBout(params.boutId), getKumiteState(params.boutId)]);

  if (!bout || !kumite) {
    notFound();
  }
  if (!bout.redPlayer || !bout.bluePlayer) {
    return <EmptyState title="This bout has a bye" description="There is no live scoring for a bye slot." />;
  }

  const isCoach = user.roles.includes("COACH");

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
      <div>
        <p className="text-xs text-text-muted">
          {bout.roundName ?? `Round ${bout.roundNumber}`}
          {bout.tatami ? ` · ${bout.tatami.label}` : ""}
        </p>
      </div>
      <KumiteLivePanel
        boutId={params.boutId}
        initialState={kumite}
        redPlayerName={bout.redPlayer.displayName}
        bluePlayerName={bout.bluePlayer.displayName}
      />
      {isCoach && (
        <CoachVideoReviewRequest
          boutId={params.boutId}
          redPlayerId={bout.redPlayer.id}
          bluePlayerId={bout.bluePlayer.id}
          redPlayerName={bout.redPlayer.displayName}
          bluePlayerName={bout.bluePlayer.displayName}
          videoReviewEnabled={kumite.config.videoReviewEnabled}
        />
      )}
    </div>
  );
}
