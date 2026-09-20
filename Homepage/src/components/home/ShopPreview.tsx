import Container from "@/components/shared/Container";
import Reveal from "@/components/shared/Reveal";
import Button from "@/components/shared/Button";

const categories = ["Cricket", "Karate", "Lawn Tennis", "Football"];

export default function ShopPreview() {
  return (
    <section id="shop" aria-labelledby="shop-heading" className="border-t border-line-soft py-20 sm:py-28">
      <Container>
        <Reveal className="flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="text-xs font-semibold tracking-[0.3em] text-accent uppercase">Shops</span>
            <h2 id="shop-heading" className="mt-4 font-display text-5xl leading-[0.9] text-paper sm:text-6xl">GEAR FOR THE GAME.</h2>
          </div>
          <div className="flex max-w-sm flex-col items-start gap-5">
            <p className="text-base leading-relaxed text-muted">A considered collection for the sports you play, follow and live.</p>
            <Button href="/shop" variant="secondary" size="md">VISIT THE SHOP</Button>
          </div>
        </Reveal>
        <Reveal delayMs={100} className="mt-12 border-y border-line">
          <ul className="grid grid-cols-2 sm:grid-cols-4">
            {categories.map((category) => (
              <li key={category} className="border-line px-4 py-8 sm:border-l sm:px-6 sm:py-10 sm:first:border-l-0">
                <h3 className="font-display text-2xl text-paper sm:text-3xl">{category}</h3>
                <span className="mt-3 block text-xs font-semibold tracking-[0.2em] text-muted uppercase">Soon</span>
              </li>
            ))}
          </ul>
        </Reveal>
      </Container>
    </section>
  );
}
