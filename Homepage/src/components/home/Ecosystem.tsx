"use client";

import Container from "@/components/shared/Container";
import Reveal from "@/components/shared/Reveal";
import Button from "@/components/shared/Button";
import { useAuthUser } from "@/lib/auth";
import { sports } from "@/data/sports";

const pillars = ["Players", "Coaches", "Clubs", "Academies", "Grounds", "Tournaments", "Communities"];
const cricketHome = sports.find((sport) => sport.slug === "cricket")?.href;

export default function Ecosystem() {
  const { user, ready, logout } = useAuthUser();

  return (
    <section id="about" aria-labelledby="account-heading" className="scroll-mt-20 border-t border-line-soft bg-ink-2/40 py-20 sm:py-28">
      <Container>
        <Reveal>
          <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-end lg:gap-20">
            <div>
              <span className="text-xs font-semibold tracking-[0.3em] text-accent uppercase">One account</span>
              <h2 id="account-heading" className="mt-4 max-w-2xl font-display text-[clamp(2.75rem,6vw,5.5rem)] leading-[0.9] text-paper">
                ONE LOGIN. EVERY SPORT.
              </h2>
              <p className="mt-6 max-w-lg text-base leading-relaxed text-muted sm:text-lg">
                Sign in once and move between Cricket, Karate and what comes next — your profile travels with you.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 lg:justify-end">
              {ready && user ? (
                <>
                  <span className="text-sm text-muted">Signed in as <span className="text-paper">{user.name}</span></span>
                  <button
                    type="button"
                    onClick={logout}
                    className="rounded-full border border-line px-6 py-3 text-sm font-semibold tracking-wide text-paper transition-colors hover:border-accent hover:text-accent"
                  >
                    Logout
                  </button>
                </>
              ) : (
                <>
                  <Button href="/login" variant="primary" size="lg">SIGN IN</Button>
                  {cricketHome ? (
                    <Button href={`${cricketHome.replace(/\/+$/, "")}/signup`} variant="secondary" size="lg" showArrow={false}>
                      CREATE ACCOUNT
                    </Button>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </Reveal>

        <Reveal delayMs={120}>
          <ul className="mt-14 flex flex-wrap gap-2 border-t border-line pt-6">
            {pillars.map((pillar) => (
              <li key={pillar} className="rounded-full border border-line px-4 py-2 text-xs font-semibold tracking-[0.18em] text-paper/70 uppercase">
                {pillar}
              </li>
            ))}
          </ul>
        </Reveal>
      </Container>
    </section>
  );
}
