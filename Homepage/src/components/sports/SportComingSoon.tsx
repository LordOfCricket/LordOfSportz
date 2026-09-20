import type { Sport } from "@/types/sport";
import Button from "@/components/shared/Button";
import Container from "@/components/shared/Container";

type SportComingSoonProps = {
  sport: Sport;
};

export default function SportComingSoon({ sport }: SportComingSoonProps) {
  return (
    <section className="relative flex min-h-[calc(100svh-5rem)] items-center overflow-hidden py-24">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[32rem] w-[32rem] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[140px]"
        style={{ backgroundColor: sport.accentSoft }}
      />

      <Container className="relative flex flex-col items-center gap-8 text-center">
        <span
          className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-xs font-semibold tracking-[0.3em] uppercase"
          style={{ color: sport.accent }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: sport.accent }}
            aria-hidden="true"
          />
          Coming Soon
        </span>

        <h1 className="font-display text-6xl leading-[0.9] tracking-tight text-paper sm:text-7xl lg:text-8xl">
          {sport.name.toUpperCase()}
        </h1>

        <p className="max-w-lg text-xl leading-relaxed text-paper/80 sm:text-2xl">
          {sport.comingSoonHeadline}
        </p>

        <p className="max-w-md text-base leading-relaxed text-muted">{sport.description}</p>

        <Button href="/#sports" variant="secondary" size="lg" showArrow={false} className="mt-4">
          Back to Sports
        </Button>
      </Container>
    </section>
  );
}
