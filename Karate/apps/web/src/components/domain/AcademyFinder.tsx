import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { RequestToJoinButton } from "./RequestToJoinButton";
import { searchAcademies } from "@/lib/server/domain";

/** Server-rendered search: the `q` param round-trips through a full GET navigation, no client JS needed for search itself. */
export async function AcademyFinder({ dashboardPath, query }: { dashboardPath: string; query?: string }) {
  const results = query ? await searchAcademies(query) : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Find an academy</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form action={dashboardPath} method="GET" className="flex gap-2">
          <input
            type="text"
            name="q"
            defaultValue={query}
            placeholder="Search academies by name"
            className="h-10 flex-1 rounded-md border border-border bg-surface-raised px-3 text-sm text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>

        {query && results.length === 0 && (
          <EmptyState title="No academies found" description={`No active academies match "${query}".`} />
        )}

        {results.length > 0 && (
          <ul className="flex flex-col gap-3">
            {results.map((academy) => (
              <li
                key={academy.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
              >
                <div>
                  <p className="text-sm font-medium text-text-primary">{academy.name}</p>
                  <p className="text-xs text-text-muted">
                    {[academy.city, academy.countryCode].filter(Boolean).join(", ") || "Location not set"}
                  </p>
                </div>
                <RequestToJoinButton academyId={academy.id} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
