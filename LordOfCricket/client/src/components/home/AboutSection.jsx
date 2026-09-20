import ScrollReveal from '../common/ScrollReveal.jsx'
import { fadeUpSoft } from '../../lib/revealVariants.js'

// "About Us" — sits directly under PlatformHero, before the ground-
// discovery flow. Static company/product copy (no backend data to derive
// this from). The heading deliberately breaks from the other sections' shared
// emerald-gradient h2 treatment — font-loc-display (the same condensed
// display face as the Hero/Final CTA headlines) in loc-gold, so "About Us"
// reads as this page's one title-card moment rather than blending into the
// repeating section-header pattern below it.
export default function AboutSection() {
  return (
    <ScrollReveal variant={fadeUpSoft} amount={0.4} className="flex w-full max-w-3xl flex-col items-center gap-6 px-6 py-6 text-center">
      <h2 className="font-loc-display text-4xl font-extrabold tracking-[0.04em] text-loc-gold uppercase sm:text-5xl">About Us</h2>
      <div className="flex flex-col gap-4 text-emerald-100/70">
        <p>
          LOC brings the complete cricket experience together in one place. Discover cricket grounds, explore players and their performances,
          track matches, analyze every shot with detailed wagon wheels, and relive your best moments through rich match data.
        </p>
        <p>
          From ground discovery and player profiles to live match updates, ball by ball data, performance analytics, match history, and smart
          cricket insights, LOC is designed to make every part of the game easier to explore, understand, and experience.
        </p>
      </div>
    </ScrollReveal>
  )
}
