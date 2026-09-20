import Link from "next/link";
import { getCoachProfile, getMyStudentsRegistrations } from "@/lib/server/domain";
import { CoachProfileForm } from "@/components/domain/CoachProfileForm";
import { RegistrationsList } from "@/components/domain/RegistrationsList";

export default async function CoachTournamentsPage() {
  const profile = await getCoachProfile();
  if (!profile) {
    return <CoachProfileForm />;
  }

  const registrations = await getMyStudentsRegistrations();

  return (
    <div className="flex flex-col gap-6">
      <Link href="/dashboard/coach/schedule" className="text-sm text-accent hover:underline">
        View students&apos; upcoming bout schedule →
      </Link>
      <RegistrationsList
        title="Students' tournament registrations"
        registrations={registrations}
        showPlayer
        bracketBasePath="/dashboard/coach"
        emptyDescription="Registrations submitted for players at academies you're affiliated with will appear here."
      />
    </div>
  );
}
