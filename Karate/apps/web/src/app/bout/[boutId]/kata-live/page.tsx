import { notFound } from "next/navigation";
import { getCurrentUserOrRedirect } from "@/lib/server/current-user";
import { getBout, getKataState, getKataDefinitions } from "@/lib/server/domain";
import { KataLivePanel } from "@/components/domain/KataLivePanel";
import { EmptyState } from "@/components/ui/EmptyState";

/** Shared live-performance page for every role — same pattern as /bout/[boutId]/live (Kumite): function-gated controls resolved server-side via myOfficialFunction, one shared state for every viewer. */
export default async function KataLiveBoutPage({ params }: { params: { boutId: string } }) {
  await getCurrentUserOrRedirect(`/bout/${params.boutId}/kata-live`);
  const [bout, kata] = await Promise.all([getBout(params.boutId), getKataState(params.boutId)]);

  if (!bout || !kata) {
    notFound();
  }
  const redName = bout.redPlayer?.displayName ?? bout.redTeam?.name ?? null;
  const blueName = bout.bluePlayer?.displayName ?? bout.blueTeam?.name ?? null;
  if (!redName || !blueName) {
    return <EmptyState title="This bout has a bye" description="There is no live Kata performance for a bye slot." />;
  }

  const kataDefinitions = kata.ruleSetVersionId ? await getKataDefinitions(kata.ruleSetVersionId) : [];

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
      <div>
        <p className="text-xs text-text-muted">{bout.roundName ?? `Round ${bout.roundNumber}`}</p>
      </div>
      <KataLivePanel boutId={params.boutId} initialState={kata} redPlayerName={redName} bluePlayerName={blueName} kataDefinitions={kataDefinitions} />
    </div>
  );
}
