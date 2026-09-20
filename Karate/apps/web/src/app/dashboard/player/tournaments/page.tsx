import Link from "next/link";
import { getCurrentUserOrRedirect } from "@/lib/server/current-user";
import { getMyRegistrations } from "@/lib/server/domain";
import { TournamentBrowser } from "@/components/domain/TournamentBrowser";
import { RegistrationsList } from "@/components/domain/RegistrationsList";

export default async function PlayerTournamentsPage({
  searchParams,
}: {
  searchParams: { tournamentId?: string };
}) {
  await getCurrentUserOrRedirect("/dashboard/player/tournaments");
  const registrations = await getMyRegistrations();
  const registeredCompetitionIds = new Set(registrations.map((r) => r.competition.id));

  return (
    <div className="flex flex-col gap-6">
      <Link href="/dashboard/player/schedule" className="text-sm text-accent hover:underline">
        View my upcoming bout schedule →
      </Link>
      <TournamentBrowser
        tournamentId={searchParams.tournamentId}
        registeredCompetitionIds={registeredCompetitionIds}
      />
      <RegistrationsList
        title="My registrations"
        registrations={registrations}
        canWithdraw
        bracketBasePath="/dashboard/player"
        emptyDescription="Register for an open tournament above to see your status here."
      />
    </div>
  );
}
