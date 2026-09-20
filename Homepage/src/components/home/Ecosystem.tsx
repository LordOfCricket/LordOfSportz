import Container from "@/components/shared/Container";
import Reveal from "@/components/shared/Reveal";

const ecosystemPillars = [
  "Players",
  "Coaches",
  "Clubs",
  "Academies",
  "Grounds",
  "Courts",
  "Competitions",
  "Tournaments",
  "Communities",
];

export default function Ecosystem() {
  return (
    <section
      id="about"
      aria-labelledby="ecosystem-heading"
      className="scroll-mt-20 border-t border-line-soft bg-ink-2/35 py-24 sm:py-36 lg:py-48"
    >
      <Container>
        <Reveal>
          <div className="grid gap-12 lg:grid-cols-[0.3fr_1.7fr] lg:gap-20">
            <div>
              <span className="text-xs font-semibold tracking-[0.3em] text-accent uppercase">01 / Who we are</span>
              <span className="mt-8 block font-display text-7xl leading-none text-paper/10 sm:text-9xl">01</span>
            </div>
            <div>
              <h2 id="ecosystem-heading" className="max-w-5xl font-display text-[clamp(4rem,9vw,9rem)] leading-[0.8] text-paper">
                <span className="word-reveal block">SPORTS ARE MORE</span>
                <span className="word-reveal word-reveal-delay block text-accent">THAN A GAME.</span>
              </h2>
              <p className="mt-10 max-w-xl text-base leading-relaxed text-muted sm:ml-[18%] sm:text-lg">
                LordOfSportz brings players, organizers, leagues and communities into one connected ecosystem. A simpler way to discover, participate and grow across every arena.
              </p>
            </div>
          </div>
        </Reveal>

        <Reveal delayMs={160}>
          <ul className="mt-20 grid border-t border-line sm:grid-cols-3 lg:mt-32 lg:grid-cols-9">
            {ecosystemPillars.map((pillar, index) => (
              <li
                key={pillar}
                className="border-b border-line px-3 py-5 text-sm font-semibold tracking-wide text-paper/80 transition-colors duration-300 hover:text-accent sm:border-r sm:last:border-r-0 lg:border-b-0"
              >
                <span className="mb-5 block text-[10px] text-accent">0{index + 1}</span>
                {pillar}
              </li>
            ))}
          </ul>
        </Reveal>
      </Container>
    </section>
  );
}
