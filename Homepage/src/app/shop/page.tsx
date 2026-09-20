import Link from "next/link";
import Container from "@/components/shared/Container";

const categories = ["Cricket", "Karate", "Lawn Tennis", "Football"];

export default function ShopPage() {
  return (
    <section className="min-h-[70svh] border-b border-line pt-36 pb-24 sm:pt-48 sm:pb-32">
      <Container>
        <div className="max-w-3xl">
          <span className="text-xs font-semibold tracking-[0.3em] text-accent uppercase">LordOfSportz Shop</span>
          <h1 className="mt-5 font-display text-7xl leading-[0.85] text-paper sm:text-9xl">BUILT FOR THE GAME.</h1>
          <p className="mt-8 max-w-xl text-lg leading-relaxed text-muted">
            A considered collection for the sports you play, follow and live. The first drop is taking shape.
          </p>
        </div>

        <div className="mt-20 grid border-y border-line sm:grid-cols-4">
          {categories.map((category, index) => (
            <div key={category} className="border-b border-line px-4 py-8 last:border-b-0 sm:border-b-0 sm:border-r sm:px-6 sm:py-12 sm:last:border-r-0">
              <span className="font-display text-2xl text-accent">0{index + 1}</span>
              <h2 className="mt-12 font-display text-3xl text-paper">{category}</h2>
              <p className="mt-3 text-xs font-semibold tracking-[0.2em] text-muted uppercase">Coming soon</p>
            </div>
          ))}
        </div>

        <Link href="/#sports" className="mt-10 inline-flex text-sm font-semibold tracking-[0.18em] text-paper uppercase transition-colors hover:text-accent">
          Explore the sports <span className="ml-3 text-accent">↗</span>
        </Link>
      </Container>
    </section>
  );
}