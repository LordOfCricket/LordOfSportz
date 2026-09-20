import Button from "@/components/shared/Button";
import Container from "@/components/shared/Container";
import Reveal from "@/components/shared/Reveal";

export default function ExploreSection() {
  return (
    <section id="league" aria-labelledby="explore-heading" className="journey relative overflow-hidden border-t border-line-soft py-24 sm:py-36 lg:py-48">
      <Container className="relative">
        <Reveal>
          <div className="grid gap-12 lg:grid-cols-[0.3fr_1.7fr] lg:gap-20">
            <div>
              <span className="text-xs font-semibold tracking-[0.3em] text-accent uppercase">04 / Your journey</span>
              <span className="mt-8 block font-display text-7xl leading-none text-paper/10 sm:text-9xl">+</span>
            </div>
            <div>
              <h2 id="explore-heading" className="max-w-5xl font-display text-[clamp(4rem,9vw,9rem)] leading-[0.8] text-paper">YOUR GAME<br /><span className="text-accent">DOESN&apos;T BELONG</span><br />TO ONE SPORT.</h2>
              <p className="mt-10 max-w-md text-base leading-relaxed text-muted sm:ml-[18%] sm:text-lg">One profile, one sporting identity, and room to grow across every arena.</p>
            </div>
          </div>
        </Reveal>

        <Reveal delayMs={120}>
          <div className="journey-line mt-20 flex flex-wrap items-center gap-x-4 gap-y-3 border-y border-line py-7 sm:ml-[18%] sm:mt-32 sm:gap-x-7 sm:py-9">
            {['Cricket', 'Karate', 'Lawn Tennis', 'More'].map((sport, index) => (
              <span key={sport} className="flex items-center gap-4 font-display text-2xl text-paper sm:text-4xl">
                {sport}<span className="text-accent">{index < 3 ? '+' : '→'}</span>
              </span>
            ))}
            <span className="font-display text-2xl text-paper/40 sm:text-4xl">LordOfSportz</span>
          </div>
        </Reveal>

        <Reveal delayMs={220} className="mt-10 sm:ml-[18%]">
          <Button href="#sports" variant="primary" size="lg">EXPLORE THE SPORTS</Button>
        </Reveal>
      </Container>
    </section>
  );
}
