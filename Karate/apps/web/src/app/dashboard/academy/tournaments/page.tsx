import Link from "next/link";
import { getMyAcademies, getAcademyRegistrations } from "@/lib/server/domain";
import { CreateAcademyForm } from "@/components/domain/CreateAcademyForm";
import { RegistrationsList } from "@/components/domain/RegistrationsList";

export default async function AcademyTournamentsPage() {
  const academies = await getMyAcademies();
  if (academies.length === 0) {
    return <CreateAcademyForm />;
  }

  const primary = academies[0]!;
  const registrations = await getAcademyRegistrations(primary.id);
  const tournamentIds = Array.from(new Set(registrations.map((r) => r.competition.tournament.id)));

  return (
    <div className="flex flex-col gap-6">
      <Link href="/dashboard/academy/schedule" className="text-sm text-accent hover:underline">
        View your players&apos; upcoming bout schedule →
      </Link>
      {tournamentIds.length > 0 && (
        <div className="flex flex-wrap gap-3 text-sm">
          {tournamentIds.map((id) => (
            <Link key={id} href={`/dashboard/academy/schedule/${id}`} className="text-accent hover:underline">
              Manage schedule for tournament {id.slice(0, 8)}…
            </Link>
          ))}
        </div>
      )}
      <RegistrationsList
        title={`${primary.name}'s tournament registrations`}
        registrations={registrations}
        showPlayer
        // Safe here specifically because every row already has representingAcademy === primary,
        // which the backend accepts as authorization for both actions — unlike the coach view,
        // where a student's registration may have been submitted by someone else entirely.
        canWithdraw
        canReevaluate
        bracketBasePath="/dashboard/academy"
        emptyDescription="Registrations submitted for your players will appear here."
      />
    </div>
  );
}
