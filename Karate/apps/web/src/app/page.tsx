import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";

const ROLE_CARDS = [
  { role: "PLAYER", href: "/dashboard/player", description: "Track bouts, belt progression, and rankings." },
  { role: "COACH", href: "/dashboard/coach", description: "Manage students and follow live competition." },
  { role: "ACADEMY", href: "/dashboard/academy", description: "Run your organization and its tournaments." },
  {
    role: "SCORER",
    href: "/dashboard/scorer",
    description: "Officiate with a fast, focused scoring workflow.",
  },
] as const;

export default function HomePage() {
  return (
    <div className="min-h-screen bg-ink text-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-accent" aria-hidden="true" />
          <span className="text-sm font-semibold tracking-tight">Karate Platform</span>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-20 text-center">
        <h1 className="mx-auto max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
          Competition infrastructure for serious Karate organizations.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-white/70">
          Player development, academy operations, and live tournament scoring — one platform, one shared
          source of truth.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-ink">
          <Link href="/dashboard/player">
            <Button size="lg">View demo dashboards</Button>
          </Link>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-6 pb-24 sm:grid-cols-2 lg:grid-cols-4">
        {ROLE_CARDS.map((item) => (
          <Link key={item.role} href={item.href}>
            <Card className="h-full border-white/10 bg-white/5 text-white transition-colors hover:border-accent/50">
              <CardContent>
                <p className="text-xs font-semibold uppercase tracking-wide text-accent">{item.role}</p>
                <p className="mt-2 text-sm text-white/70">{item.description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </section>
    </div>
  );
}
