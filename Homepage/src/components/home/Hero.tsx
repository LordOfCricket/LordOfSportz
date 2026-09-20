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
            LordOfSportz
          </span>

          <h1 className="hero-title max-w-5xl font-display text-[clamp(3.5rem,9vw,8rem)] leading-[0.82] tracking-tight text-paper">
            <span className="hero-line block"><span>ONE HUB.</span></span>
            <span className="hero-line block"><span>EVERY SPORT.</span></span>
          </h1>

          <p className="hero-description max-w-md text-base leading-relaxed text-paper/75 sm:text-lg">
            Discover sports, follow matches and competitions, shop the gear — and take one account across every game.
          </p>

          <div className="hero-actions flex flex-col gap-4 sm:flex-row sm:items-center">
            <Button href="#sports" variant="primary" size="lg">
              EXPLORE SPORTS
            </Button>
            <Button href="/shop" variant="secondary" size="lg" showArrow={false}>
              SHOP GEAR
            </Button>
          </div>
          <ul aria-label="Sports on the platform" className="hero-meta mt-6 flex w-full max-w-2xl flex-wrap gap-x-8 gap-y-3 border-t border-paper/15 pt-5 text-xs font-semibold tracking-[0.22em] text-paper/70 uppercase">
            <li className="flex items-center gap-2"><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-accent" />Cricket · Live</li>
            <li className="flex items-center gap-2"><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-accent" />Karate · Live</li>
            <li className="flex items-center gap-2 text-paper/40"><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-paper/30" />Tennis · Soon</li>
          </ul>
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
