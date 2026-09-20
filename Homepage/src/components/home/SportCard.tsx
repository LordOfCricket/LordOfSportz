import Link from "next/link";
import type { Sport } from "@/types/sport";
import { ArrowRightIcon } from "@/components/shared/icons";

type SportCardProps = {
  sport: Sport;
};

export default function SportCard({ sport }: SportCardProps) {
  const isExternal = Boolean(sport.external);

  const cardContent = (
    <>
      <div
        className="absolute inset-0 -z-10 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background: `radial-gradient(120% 120% at 20% 0%, ${sport.accentSoft}, transparent 60%)`,
        }}
        aria-hidden="true"
      />

      <div className="relative flex h-56 items-center justify-center overflow-hidden border border-line-soft bg-ink-2 sm:h-64">
        <div
          aria-hidden="true"
          className="absolute inset-0 transition-transform duration-500 ease-out group-hover:scale-110"
          style={{
            backgroundImage: `radial-gradient(${sport.accent}33 1.5px, transparent 1.5px)`,
            backgroundSize: "18px 18px",
          }}
        />
        <span aria-hidden="true" className="absolute left-5 top-4 text-xs font-semibold tracking-[0.3em] text-muted uppercase">{sport.status === "active" ? "01 / Active" : "02 / Building"}</span>
        <span
          aria-hidden="true"
          className="font-display text-[5.5rem] leading-none transition-transform duration-500 ease-out group-hover:scale-110 sm:text-[7rem]"
          style={{ color: sport.accent, opacity: 0.9 }}
        >
          {sport.name.toUpperCase()}
        </span>
        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-ink-2 to-transparent"
        />
      </div>

      <div className="flex flex-1 flex-col gap-3 pt-6 transition-transform duration-500 ease-out group-hover:-translate-y-1">
        <span
          className="text-xs font-semibold tracking-[0.3em] uppercase"
          style={{ color: sport.accent }}
        >
          {sport.tagline}
        </span>
        <h3 className="font-display text-3xl tracking-tight text-paper sm:text-4xl">
          {sport.name}
        </h3>
        <p className="text-sm leading-relaxed text-muted sm:text-base">{sport.description}</p>

        <span className="mt-2 inline-flex items-center gap-2 text-sm font-semibold tracking-wide text-paper">
          {sport.cta}
          <ArrowRightIcon className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1.5" />
        </span>
      </div>
    </>
  );

  const className =
    "group relative flex h-full flex-col border border-line bg-ink-2/40 p-5 transition-colors duration-500 hover:border-[var(--card-accent)] sm:p-6";

  if (isExternal) {
    return (
      <a
        href={sport.href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        style={{ ["--card-accent" as string]: sport.accent }}
      >
        {cardContent}
      </a>
    );
  }

  return (
    <Link href={sport.href} className={className} style={{ ["--card-accent" as string]: sport.accent }}>
      {cardContent}
    </Link>
  );
}
