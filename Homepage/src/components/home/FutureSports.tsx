import { futureSports } from "@/data/sports";
import SectionHeading from "@/components/shared/SectionHeading";
import Container from "@/components/shared/Container";
import Reveal from "@/components/shared/Reveal";

export default function FutureSports() {
  return (
    <section
      aria-labelledby="future-sports-heading"
      className="border-t border-line-soft py-24 sm:py-32"
    >
      <Container className="flex flex-col gap-14">
        <Reveal>
          <SectionHeading
            id="future-sports-heading"
            eyebrow="What's Next"
            heading="THE GAME IS GETTING BIGGER."
            supporting="More sports are joining the platform. The architecture is built to grow — one addition at a time."
          />
        </Reveal>

        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {futureSports.map((sport, index) => (
            <Reveal as="li" key={sport.slug} delayMs={index * 60}>
              <div className="group flex h-32 flex-col items-center justify-center gap-3 border border-dashed border-line bg-ink-2/30 text-center transition-colors duration-300 hover:border-accent/60 sm:h-36">
                <span className="font-display text-xl tracking-wide text-paper/80 sm:text-2xl">
                  {sport.name}
                </span>
                <span className="text-[10px] font-semibold tracking-[0.25em] text-muted uppercase transition-colors duration-300 group-hover:text-accent">
                  Coming Soon
                </span>
              </div>
            </Reveal>
          ))}
        </ul>
      </Container>
    </section>
  );
}
