import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { RegisterButton } from "./RegisterButton";
import { getTournamentDetail, listOpenTournaments } from "@/lib/server/domain";

/**
 * A single page handles both browsing (no `tournamentId`) and the
 * detail/register step (`?tournamentId=`) — avoids a second route for what
 * is really one flow, and keeps registration state (`registeredCompetitionIds`)
 * in one server-rendered place instead of syncing it across pages.
 */
export async function TournamentBrowser({
  tournamentId,
  registeredCompetitionIds,
}: {
  tournamentId?: string;
  registeredCompetitionIds: Set<string>;
}) {
  if (tournamentId) {
    const detail = await getTournamentDetail(tournamentId);
    if (!detail) {
      return (
        <Card>
          <CardContent>
            <EmptyState title="Tournament not found" />
          </CardContent>
        </Card>
      );
    }
    return (
      <Card>
        <CardHeader>
          <CardTitle>{detail.name}</CardTitle>
          <Link href="/dashboard/player/tournaments" className="text-xs text-accent hover:underline">
            Back to all tournaments
          </Link>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-text-secondary">
            {[detail.venue, detail.countryCode].filter(Boolean).join(", ") || "Venue to be announced"}
          </p>
          {detail.competitions.length === 0 ? (
            <EmptyState title="No categories published yet" description="Check back closer to the event." />
          ) : (
            detail.competitions.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-md border border-border p-3"
              >
                <div>
                  <p className="text-sm font-medium text-text-primary">{c.name}</p>
                  <p className="text-xs text-text-muted">
                    {c.discipline} · {c.category.genderRestriction}
                    {c.category.ageMin || c.category.ageMax
                      ? ` · Age ${c.category.ageMin ?? "-"}-${c.category.ageMax ?? "-"}`
                      : ""}
                    {c.category.weightMinKg || c.category.weightMaxKg
                      ? ` · ${c.category.weightMinKg ?? "-"}-${c.category.weightMaxKg ?? "-"}kg`
                      : ""}
                  </p>
                </div>
                {registeredCompetitionIds.has(c.id) ? (
                  <Badge tone="success">Already registered</Badge>
                ) : (
                  <RegisterButton competitionId={c.id} />
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    );
  }

  const tournaments = await listOpenTournaments();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Open tournaments</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {tournaments.length === 0 ? (
          <EmptyState
            title="No tournaments open for registration"
            description="New tournaments will appear here once organizers open registration."
          />
        ) : (
          tournaments.map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <p className="text-sm font-medium text-text-primary">{t.name}</p>
                <p className="text-xs text-text-muted">
                  {[t.venue, t.countryCode].filter(Boolean).join(", ") || "Venue to be announced"}
                  {t.registrationClosesAt &&
                    ` · Closes ${new Date(t.registrationClosesAt).toLocaleDateString()}`}
                </p>
              </div>
              <Link href={`/dashboard/player/tournaments?tournamentId=${t.id}`}>
                <Button size="sm" variant="secondary">
                  View & register
                </Button>
              </Link>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
