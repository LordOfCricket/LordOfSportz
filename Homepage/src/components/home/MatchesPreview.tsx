import Button from "@/components/shared/Button";
import Container from "@/components/shared/Container";
import Reveal from "@/components/shared/Reveal";

const activity = [
  { type: "Cricket", title: "LordOfCricket League", detail: "Demo fixture", date: "18 SEP", time: "07:30 PM", number: "01" },
  { type: "Karate", title: "Precision Open", detail: "Demo fixture", date: "21 SEP", time: "06:00 PM", number: "02" },
  { type: "Lawn Tennis", title: "The Rally Series", detail: "Demo fixture", date: "28 SEP", time: "04:30 PM", number: "03" },
];

export default function MatchesPreview() {
  return (
    <section id="matches" aria-labelledby="matches-heading" className="border-t border-line-soft py-20 sm:py-28">
      <Container>
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
          <Reveal>
            <span className="text-xs font-semibold tracking-[0.3em] text-accent uppercase">Upcoming</span>
            <h2 id="matches-heading" className="mt-4 max-w-md font-display text-5xl leading-[0.9] text-paper sm:text-6xl">
              WHAT&apos;S ON.
            </h2>
            <p className="mt-6 max-w-sm text-base leading-relaxed text-muted">
              Fixtures and tournaments across every sport, in one place.
            </p>
            <Button href="#sports" variant="ghost" className="mt-6 px-0">BROWSE SPORTS</Button>
          </Reveal>

          <div className="border-t border-line">
            {activity.map((item, index) => (
              <Reveal key={item.type} delayMs={index * 80}>
                <div className="group grid gap-4 border-b border-line py-6 transition-colors hover:bg-ink-2/60 sm:grid-cols-[3rem_0.8fr_0.75fr_auto] sm:items-center sm:gap-6 sm:px-4">
                  <span className="font-display text-2xl text-accent">{item.number}</span>
                  <div>
                    <span className="text-xs font-semibold tracking-[0.25em] text-muted uppercase">{item.type}</span>
                    <h3 className="mt-2 font-display text-2xl text-paper sm:text-3xl">{item.title}</h3>
                  </div>
                  <p className="text-sm leading-relaxed text-muted">{item.detail}</p>
                  <div className="flex items-center justify-between gap-6 sm:flex-col sm:items-end sm:gap-1">
                    <span className="font-display text-xl text-paper">{item.date}</span>
                    <span className="text-xs font-semibold tracking-[0.18em] text-muted">{item.time}</span>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}