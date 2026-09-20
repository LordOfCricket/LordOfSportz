"use client";

import { useState } from "react";
import { sports } from "@/data/sports";
import Container from "@/components/shared/Container";
import Reveal from "@/components/shared/Reveal";

export default function SportsUniverse() {
  const [selectedSlug, setSelectedSlug] = useState(sports[0]?.slug ?? "");
  const selectedSport = sports.find((sport) => sport.slug === selectedSlug) ?? sports[0];

  if (!selectedSport) return null;

  return (
    <section id="sports" aria-labelledby="sports-heading" className="sports-universe scroll-mt-20 overflow-hidden border-t border-line-soft py-24 sm:py-32 lg:py-40">
      <Container>
        <Reveal>
          <div className="flex items-end justify-between gap-8 border-b border-line pb-7">
            <div>
              <span className="text-xs font-semibold tracking-[0.3em] text-accent uppercase">Sports</span>
              <h2 id="sports-heading" className="mt-4 font-display text-6xl leading-[0.82] text-paper sm:text-8xl">FIND YOUR ARENA.</h2>
            </div>
            <span className="hidden max-w-xs text-right text-sm leading-relaxed text-muted sm:block">One connected home for the sports, people and moments that keep you moving.</span>
          </div>
        </Reveal>

        <Reveal delayMs={100}>
          <div className="sports-stage mt-8 grid min-h-[min(72svh,46rem)] border-b border-line lg:grid-cols-[0.46fr_1.54fr]">
            <div className="flex flex-col border-b border-line lg:border-b-0 lg:border-r">
              <p className="pb-5 text-[10px] font-semibold tracking-[0.3em] text-muted uppercase">Choose your sport</p>
              <ul aria-label="Sports" className="my-auto">
                {sports.map((sport, index) => {
                  const isSelected = sport.slug === selectedSlug;
                  return (
                    <li key={sport.slug} className="border-t border-line-soft">
                      <button
                        type="button"
                        onClick={() => setSelectedSlug(sport.slug)}
                        aria-pressed={isSelected}
                        className={`sports-choice group flex w-full items-center gap-4 py-4 text-left transition-colors sm:py-5 ${isSelected ? "text-paper" : "text-muted hover:text-paper"}`}
                      >
                        <span className="text-[10px] font-semibold tracking-[0.2em] text-accent">0{index + 1}</span>
                        <span className="font-display text-4xl leading-none tracking-wide sm:text-5xl">{sport.name}</span>
                        <span className={`ml-auto h-px transition-all duration-500 ${isSelected ? "w-10" : "w-0 group-hover:w-5"}`} style={{ backgroundColor: sport.accent }} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="sports-stage-visual relative min-h-[24rem] overflow-hidden lg:min-h-0">
              <div
                key={selectedSport.slug}
                className="sport-panel absolute inset-0"
                style={{ "--sport-accent": selectedSport.accent, "--sport-accent-soft": selectedSport.accentSoft } as React.CSSProperties}
                aria-hidden="true"
              >
                <div className="sport-visual-grid absolute inset-0" />
                <div className="sport-visual-ring absolute left-[58%] top-[45%] h-[min(56vw,34rem)] w-[min(56vw,34rem)] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[var(--sport-accent)]/40" />
                <div className="sport-visual-ring sport-visual-ring-inner absolute left-[58%] top-[45%] h-[min(30vw,18rem)] w-[min(30vw,18rem)] -translate-x-1/2 -translate-y-1/2 rounded-full border border-paper/20" />
                <div className="sport-visual-slash absolute left-[44%] top-[-12%] h-[130%] w-px rotate-[28deg] bg-[var(--sport-accent)]/40" />
              </div>
              <div className="relative flex h-full flex-col justify-between p-6 sm:p-10 lg:p-14">
                <div className="flex items-start justify-between gap-6">
                  <span className="text-xs font-semibold tracking-[0.28em] uppercase" style={{ color: selectedSport.accent }}>
                    {selectedSport.status === "active" ? "Live on the platform" : "Building the arena"}
                  </span>
                  <span className="font-display text-[clamp(8rem,20vw,18rem)] leading-[0.7] text-paper/[0.06]">{selectedSport.name.slice(0, 3).toUpperCase()}</span>
                </div>
                <div key={`${selectedSport.slug}-copy`} className="sport-copy relative max-w-2xl">
                  <h3 className="font-display text-[clamp(5rem,11vw,10rem)] leading-[0.76] text-paper">{selectedSport.name}</h3>
                  <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                    <p className="max-w-sm text-base leading-relaxed text-paper/60 sm:text-lg">{selectedSport.description}</p>
                    <a href={selectedSport.href} target={selectedSport.external ? "_blank" : undefined} rel={selectedSport.external ? "noopener noreferrer" : undefined} className="inline-flex shrink-0 items-center gap-3 text-sm font-semibold tracking-[0.18em] text-paper uppercase transition-colors hover:text-accent">
                      {selectedSport.cta}
                      <span aria-hidden="true" className="text-accent">↗</span>
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
