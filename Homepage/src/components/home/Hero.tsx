"use client";

import Button from "@/components/shared/Button";
import Container from "@/components/shared/Container";
import { ChevronDownIcon } from "@/components/shared/icons";
import MultiSportScene from "@/components/home/MultiSportScene";
import { useEffect, useState } from "react";

export default function Hero() {
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    let frame = 0;

    const updateProgress = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setScrollProgress(Math.min(window.scrollY / Math.max(window.innerHeight, 1), 1));
      });
    };

    updateProgress();
    window.addEventListener("scroll", updateProgress, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", updateProgress);
    };
  }, []);

  return (
    <section
      aria-label="Introduction"
      className="hero relative flex min-h-[100svh] items-end overflow-hidden bg-ink pt-20"
      style={{ "--hero-progress": scrollProgress, "--hero-shift": `${scrollProgress * -3}rem` } as React.CSSProperties}
    >
      <div aria-hidden="true" className="hero-backdrop pointer-events-none absolute inset-0">
        <div className="hero-poster absolute inset-[-5%]" />
        <div className="hero-vignette absolute inset-0" />
        <div className="hero-grain absolute inset-0" />
      </div>

      <div className="hero-scene-wrap absolute inset-0 z-[1]">
        <MultiSportScene />
      </div>

      <Container className="relative z-10 w-full pb-14 pt-32 sm:pb-20 lg:pb-24">
        <div className="hero-copy flex max-w-4xl flex-col items-start gap-6">
          <span className="hero-eyebrow inline-flex items-center gap-3 text-xs font-semibold tracking-[0.28em] text-accent uppercase">
            <span className="h-px w-8 bg-accent" aria-hidden="true" />
            The sports universe
          </span>

          <h1 className="hero-title max-w-5xl font-display text-[clamp(4.25rem,10.5vw,9.5rem)] leading-[0.78] tracking-tight text-paper">
            <span className="hero-line block"><span>ONE PLATFORM.</span></span>
            <span className="hero-line block"><span>EVERY SPORT.</span></span>
          </h1>

          <p className="hero-description max-w-sm text-base leading-relaxed text-paper/65 sm:text-lg">
            A connected home for players, matches, leagues and the communities that make sport matter.
          </p>

          <div className="hero-actions flex flex-col gap-4 sm:flex-row sm:items-center">
            <Button href="#sports" variant="primary" size="lg">
              EXPLORE SPORTS
            </Button>
            <Button href="#matches" variant="secondary" size="lg" showArrow={false}>
              VIEW MATCHES
            </Button>
          </div>
          <div className="hero-meta mt-6 flex w-full max-w-2xl flex-col justify-between gap-5 border-t border-paper/15 pt-4 sm:flex-row sm:items-end">
            <div className="flex flex-col gap-1">
              <span className="font-display text-5xl leading-none text-paper sm:text-6xl">01</span>
              <span className="text-[10px] font-semibold tracking-[0.28em] text-paper/50 uppercase">The game is bigger here</span>
            </div>
            <div className="max-w-xs sm:text-right">
              <span className="block text-[10px] font-semibold tracking-[0.25em] text-paper/50 uppercase">Live universe</span>
              <span className="mt-2 block font-display text-2xl text-paper">Cricket / Karate / Tennis</span>
            </div>
          </div>
        </div>
      </Container>

      <a
        href="#sports"
        aria-label="Scroll to sports section"
        className="absolute bottom-8 left-1/2 z-10 hidden -translate-x-1/2 text-muted transition-colors hover:text-accent sm:block"
      >
        <ChevronDownIcon className="h-6 w-6 animate-bounce" />
      </a>
    </section>
  );
}
