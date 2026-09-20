import Container from "@/components/shared/Container";
import Reveal from "@/components/shared/Reveal";

const categories = ["Cricket", "Karate", "Lawn Tennis", "Football"];

export default function ShopPreview() {
  return (
    <section id="shop" aria-labelledby="shop-heading" className="border-t border-line-soft bg-ink-2/40 py-24 sm:py-32">
      <Container>
        <Reveal className="flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="text-xs font-semibold tracking-[0.3em] text-accent uppercase">Coming to the universe</span>
            <h2 id="shop-heading" className="mt-4 font-display text-5xl leading-[0.9] text-paper sm:text-6xl">GEAR FOR THE GAME.</h2>
          </div>
          <p className="max-w-sm text-base leading-relaxed text-muted">A considered collection for the sports you play, follow and live.</p>
        </Reveal>
        <Reveal delayMs={100} className="mt-12 border-y border-line">
          <div className="grid grid-cols-2 sm:grid-cols-4">
            {categories.map((category, index) => (
              <div key={category} className="group border-line px-4 py-8 first:border-l-0 sm:border-l sm:px-6 sm:py-12">
                <span className="text-xs text-muted">0{index + 1}</span>
                <h3 className="mt-10 font-display text-2xl text-paper transition-colors group-hover:text-accent sm:text-3xl">{category}</h3>
                <span className="mt-3 block text-xs font-semibold tracking-[0.2em] text-muted uppercase">Soon</span>
              </div>
            ))}
          </div>
        </Reveal>
      </Container>
    </section>
  );
}