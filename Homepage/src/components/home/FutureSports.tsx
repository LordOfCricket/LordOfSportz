import { futureSports } from "@/data/sports";
import SectionHeading from "@/components/shared/SectionHeading";
import Container from "@/components/shared/Container";
import Reveal from "@/components/shared/Reveal";

export default function FutureSports() {
  return (
    <section
      aria-labelledby="future-sports-heading"
      className="border-t border-line-soft py-20 sm:py-28"
    >
      <Container className="flex flex-col gap-14">
        <Reveal>
          <SectionHeading
            id="future-sports-heading"
            eyebrow="Next"
            heading="MORE SPORTS ARE COMING."
            supporting="New sports join the hub one at a time — each with its own home, one shared account."
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
