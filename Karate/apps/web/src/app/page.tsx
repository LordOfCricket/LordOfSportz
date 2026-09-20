import Link from "next/link";
import { Card, CardContent } from "@/components/ui/Card";
import { HUB_URL } from "@/lib/hub";

const ROLE_CARDS = [
  { role: "PLAYER", href: "/dashboard/player", description: "Track bouts, belt progression, and rankings." },
  { role: "COACH", href: "/dashboard/coach", description: "Manage students and follow live competition." },
  { role: "ACADEMY", href: "/dashboard/academy", description: "Run your organization and its tournaments." },
  { role: "SCORER", href: "/dashboard/scorer", description: "Officiate with a fast, focused scoring workflow." },
] as const;

const FEATURES = [
  { title: "Tournaments", body: "Registration, draws and brackets for kata and kumite events." },
  { title: "Live bouts", body: "Real-time scoring, tatami boards and results as they happen." },
  { title: "Belts & grading", body: "Verified belt history, grading events and certificates." },
  { title: "Academies", body: "Students, coaches and memberships in one organised place." },
] as const;

const NAV_LINKS = [
  { label: "Home", href: "/" },
  { label: "Features", href: "#features" },
  { label: "Roles", href: "#roles" },
  ...(HUB_URL ? [{ label: "All sports", href: HUB_URL }] : []),
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-ink text-white">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-ink/90 backdrop-blur">
        <nav aria-label="Primary" className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-accent" aria-hidden="true" />
            <span className="text-sm font-semibold tracking-tight">Karate Platform</span>
          </Link>
          <ul className="hidden items-center gap-8 text-sm text-white/70 sm:flex">
            {NAV_LINKS.map((link) => (
              <li key={link.label}>
                <a href={link.href} className="transition-colors hover:text-white">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2">
            <Link href="/login" className="rounded-full border border-white/20 px-4 py-2 text-sm font-medium transition-colors hover:border-accent">
              Sign in
            </Link>
            <Link href="/register" className="hidden rounded-full bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover sm:inline-block">
              Create account
            </Link>
          </div>
        </nav>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
        <span className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">Karate · LordOfSportz</span>
        <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">
          Karate competition, run properly.
        </h1>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-white/70 sm:text-lg">
          Tournaments, live bouts, belt grading and academies — one platform for players, coaches, scorers and organisers.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link href="/login" className="rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover">
            Sign in
          </Link>
          <Link href="/register" className="rounded-full border border-white/20 px-6 py-3 text-sm font-semibold transition-colors hover:border-accent">
            Create account
          </Link>
        </div>
      </section>

      <section id="features" aria-label="Features" className="border-t border-white/10">
        <ul className="mx-auto grid max-w-6xl gap-px bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature) => (
            <li key={feature.title} className="bg-ink px-6 py-10">
              <h2 className="text-lg font-semibold tracking-tight">{feature.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-white/60">{feature.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section id="roles" aria-label="Roles" className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Built for every role</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
        </div>
      </section>

      <footer className="border-t border-white/10 py-8 text-center text-sm text-white/50">
        {HUB_URL ? (
          <a href={HUB_URL} className="transition-colors hover:text-white">
            One LordOfSportz account, every sport — back to all sports
          </a>
        ) : (
          "One LordOfSportz account, every sport"
        )}
      </footer>
    </div>
  );
}
