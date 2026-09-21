// Shared header for the universal LordOfSportz sign-in / sign-up pages. LordOfCricket is the identity
// provider, so these pages are the one account experience for every sport (hub, Cricket, Karate).
const HUB_URL = import.meta.env.VITE_HUB_URL || (import.meta.env.DEV ? 'http://localhost:3000' : '')

export default function UniversalAuthBar() {
  const mark = (
    <span className="font-loc-display text-xl font-bold tracking-wide">
      LORD<span className="text-amber-500">OF</span>SPORTZ
    </span>
  )
  return (
    <header className="border-b border-white/10 bg-loc-charcoal text-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4 lg:px-16">
        {HUB_URL ? (
          <a href={HUB_URL} aria-label="LordOfSportz home">
            {mark}
          </a>
        ) : (
          mark
        )}
        <p className="hidden text-xs font-semibold tracking-[0.22em] text-white/60 uppercase sm:block">
          One account · Every sport
        </p>
      </div>
    </header>
  )
}
