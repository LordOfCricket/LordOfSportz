import Link from "next/link";
import KarateScene from "@/components/KarateScene";
import { HUB_URL } from "@/lib/hub";

const PILLARS = [
  { title: "Discipline", body: "Structured grading, verified belts and a record that follows the athlete." },
  { title: "Precision", body: "Kata and kumite scored by trained officials, live, with a clear audit trail." },
  { title: "Respect", body: "Academies, coaches and organisers working from one shared, trusted source." },
] as const;

const FEATURES = [
  { title: "Tournaments", body: "Registration, eligibility, draws and brackets for kata and kumite events." },
  { title: "Live bouts", body: "Tatami boards, real-time scoring and results as they happen." },
  { title: "Belts & grading", body: "Verified belt history, grading events and certificates." },
  { title: "Academies", body: "Students, coaches and memberships organised in one place." },
] as const;

const ROLE_CARDS = [
  { role: "Player", href: "/dashboard/player", description: "Track bouts, belt progression and rankings." },
  { role: "Coach", href: "/dashboard/coach", description: "Manage students and follow live competition." },
  { role: "Academy", href: "/dashboard/academy", description: "Run your organisation and its tournaments." },
  { role: "Scorer", href: "/dashboard/scorer", description: "Officiate with a fast, focused scoring workflow." },
] as const;

const STEPS = ["Register", "Draw", "Compete", "Results"] as const;

const NAV_LINKS = [
  { label: "Home", href: "/" },
  { label: "Features", href: "#features" },
  { label: "Roles", href: "#roles" },
  { label: "Events", href: "#events" },
  ...(HUB_URL ? [{ label: "All sports", href: HUB_URL }] : []),
];

const primary =
  "rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover";
const secondary =
  "rounded-full border border-border px-6 py-3 text-sm font-semibold text-text-primary transition-colors hover:border-accent";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-surface text-text-primary">
      <header className="absolute inset-x-0 top-0 z-20">
        <nav aria-label="Primary" className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-5">
          <Link href="/" className="k-display flex items-center gap-2 text-2xl tracking-wide">
            <span className="h-2.5 w-2.5 rounded-full bg-accent" aria-hidden="true" />
            KARATE<span className="ml-1 hidden text-[10px] font-sans font-semibold tracking-[0.25em] text-amber lg:inline">LORDOFSPORTZ</span>
          </Link>
          <ul className="hidden items-center gap-5 whitespace-nowrap text-sm text-text-secondary md:flex lg:gap-8">
            {NAV_LINKS.map((link) => (
              <li key={link.label}>
                <a href={link.href} className="transition-colors hover:text-text-primary">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="whitespace-nowrap rounded-full border border-border px-4 py-2 text-sm font-medium transition-colors hover:border-accent"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="hidden whitespace-nowrap rounded-full bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover lg:inline-block"
            >
              Create account
            </Link>
          </div>
        </nav>
      </header>

      <section aria-label="Introduction" className="relative flex min-h-[100svh] items-end overflow-hidden bg-ink">
        <KarateScene />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,#0c0d10_0%,rgba(12,13,16,0.94)_36%,rgba(12,13,16,0.35)_70%,rgba(12,13,16,0.6)_100%)] max-md:bg-[linear-gradient(0deg,#0c0d10_0%,rgba(12,13,16,0.92)_52%,rgba(12,13,16,0.4)_100%)]"
        />
        <div className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-16 pt-32 sm:pb-24">
          <p className="k-rise text-xs font-semibold uppercase tracking-[0.3em] text-accent">Karate · LordOfSportz</p>
          <h1 className="k-display k-rise k-rise-2 mt-5 max-w-3xl text-[clamp(3.5rem,9vw,7.5rem)] leading-[0.86]">
            DISCIPLINE.
            <br />
            PRECISION.
            <br />
            COMPETITION.
          </h1>
          <p className="k-rise k-rise-3 mt-6 max-w-md text-base leading-relaxed text-text-secondary sm:text-lg">
            Tournaments, live bouts and belt grading for players, coaches, academies and scorers.
          </p>
          <div className="k-rise k-rise-3 mt-8 flex flex-wrap items-center gap-3">
            <Link href="/login" className={primary}>
              Sign in
            </Link>
            <Link href="/register" className={secondary}>
              Create account
            </Link>
          </div>
        </div>
      </section>

      <section aria-label="Why Karate" className="border-t border-border">
        <ul className="mx-auto grid max-w-6xl gap-px bg-border sm:grid-cols-3">
          {PILLARS.map((item, index) => (
            <li key={item.title} className="bg-surface px-6 py-10">
              <span className="text-xs font-semibold tracking-[0.25em] text-amber">0{index + 1}</span>
              <h2 className="k-display mt-4 text-3xl">{item.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">{item.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section id="features" aria-label="Features" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-20">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">Features</p>
        <h2 className="k-display mt-3 max-w-xl text-5xl leading-[0.9] sm:text-6xl">EVERYTHING THE DOJO NEEDS.</h2>
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature) => (
            <li key={feature.title} className="rounded-lg border border-border bg-surface-raised p-5">
              <h3 className="text-base font-semibold tracking-tight">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">{feature.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section id="roles" aria-label="Roles" className="scroll-mt-20 border-t border-border bg-ink-soft py-20">
        <div className="mx-auto max-w-6xl px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">Roles</p>
          <h2 className="k-display mt-3 text-5xl leading-[0.9] sm:text-6xl">BUILT FOR EVERY ROLE.</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {ROLE_CARDS.map((item) => (
              <Link
                key={item.role}
                href={item.href}
                className="group rounded-lg border border-border bg-surface-raised p-5 transition-colors hover:border-accent"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">{item.role}</p>
                <p className="mt-3 text-sm leading-relaxed text-text-secondary">{item.description}</p>
                <span
                  aria-hidden="true"
                  className="mt-5 block text-sm text-text-muted transition-transform group-hover:translate-x-1"
                >
                  →
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section id="events" aria-label="Events and competition" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-20">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">Events</p>
        <h2 className="k-display mt-3 max-w-2xl text-5xl leading-[0.9] sm:text-6xl">FROM REGISTRATION TO RESULT.</h2>
        <ol className="mt-10 grid grid-cols-2 gap-px border-y border-border bg-border sm:grid-cols-4">
          {STEPS.map((step, index) => (
            <li key={step} className="bg-surface px-4 py-6">
              <span className="text-xs font-semibold tracking-[0.25em] text-text-muted">0{index + 1}</span>
              <p className="k-display mt-3 text-3xl">{step}</p>
            </li>
          ))}
        </ol>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-surface-raised p-6">
            <h3 className="k-display text-3xl">Kata</h3>
            <p className="mt-2 text-sm leading-relaxed text-text-secondary">
              Individual and team forms, judged and ranked with a transparent score sheet.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-surface-raised p-6">
            <h3 className="k-display text-3xl">Kumite</h3>
            <p className="mt-2 text-sm leading-relaxed text-text-secondary">
              Head-to-head bouts on the tatami, scored live and progressed through the bracket.
            </p>
          </div>
        </div>
      </section>

      <section aria-label="Get started" className="border-t border-border bg-ink-soft py-16">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-6 sm:flex-row sm:items-center">
          <h2 className="k-display text-4xl leading-[0.95] sm:text-5xl">READY TO STEP ONTO THE TATAMI?</h2>
          <div className="flex flex-wrap gap-3">
            <Link href="/login" className={primary}>
              Sign in
            </Link>
            <Link href="/register" className={secondary}>
              Create account
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-border py-8 text-center text-sm text-text-muted">
        {HUB_URL ? (
          <a href={HUB_URL} className="transition-colors hover:text-text-primary">
            One LordOfSportz account, every sport — back to all sports
          </a>
        ) : (
          "One LordOfSportz account, every sport"
        )}
      </footer>
    </div>
  );
}
