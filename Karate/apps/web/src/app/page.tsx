import Link from "next/link";
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

const HUB_URL =
  process.env["NEXT_PUBLIC_HUB_URL"] || (process.env.NODE_ENV !== "production" ? "http://localhost:3000" : "");

const NAV_LINKS = [
  { label: "Home", href: "/" },
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

      <section className="mx-auto max-w-6xl px-6 py-20 text-center sm:py-28">
        <h1 className="mx-auto max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
          Competition infrastructure for serious Karate organizations.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-white/70">
          Player development, academy operations, and live tournament scoring — one platform, one shared
          source of truth.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/login" className="rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover">
            Sign in
          </Link>
          <Link href="/register" className="rounded-full border border-white/20 px-6 py-3 text-sm font-semibold transition-colors hover:border-accent">
            Create account
          </Link>
        </div>
      </section>

      <section id="roles" aria-label="Roles" className="mx-auto grid max-w-6xl gap-4 px-6 pb-24 sm:grid-cols-2 lg:grid-cols-4">
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

      <footer className="border-t border-white/10 py-8 text-center text-sm text-white/50">
        {HUB_URL ? (
          <a href={HUB_URL} className="transition-colors hover:text-white">
            Part of LordOfSportz — all sports, one account
          </a>
        ) : (
          "Part of LordOfSportz"
        )}
      </footer>
    </div>
  );
}
