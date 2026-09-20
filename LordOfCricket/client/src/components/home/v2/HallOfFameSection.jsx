import { useHallOfFame } from '../../../hooks/useHallOfFame.js'
import PlayerMiniCard from './PlayerMiniCard.jsx'

function PlaceholderCard({ label }) {
  return (
    <div className="flex h-full min-h-[18rem] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/25 bg-loc-surface/5 px-4 text-center">
      <p className="text-xs font-bold uppercase tracking-wide text-green-100">{label}</p>
      <p className="text-xs text-green-200/70">Not yet awarded — check back once more matches are played.</p>
    </div>
  )
}

export default function HallOfFameSection() {
  const { categories, loading, error } = useHallOfFame()

  if (error) return null

  return (
    <section className="w-full bg-green-800 py-16 sm:py-20 lg:py-12">
      <div className="flex w-full flex-col lg:flex-row">
        <div className="w-full px-6 sm:px-10 lg:w-[70%] lg:px-6">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {loading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-72 animate-pulse rounded-2xl border border-white/15 bg-loc-surface/10" />
                ))
              : categories.map((category) =>
                  category.player ? (
                    <PlayerMiniCard
                      key={category.key}
                      to={`/players/${category.player.publicPlayerId}`}
                      category={category.label}
                      name={category.player.name}
                      subtitle={category.player.headline}
                      photoUrl={category.player.photoUrl}
                      statLabel={category.player.stats?.[0]?.label}
                      statValue={category.player.stats?.[0]?.value}
                    />
                  ) : (
                    <PlaceholderCard key={category.key} label={category.label} />
                  ),
                )}
          </div>
        </div>

        <div className="flex w-full items-center justify-center px-6 pt-10 sm:px-10 lg:w-[30%] lg:px-12 lg:pt-0">
          <h2 className="whitespace-nowrap text-4xl font-black uppercase leading-none tracking-tight text-white sm:text-5xl lg:hidden">
            Hall Of Fame
          </h2>
          <h2 className="hidden text-5xl font-black uppercase leading-[0.9] tracking-tight text-white lg:block lg:text-6xl">
            Hall
            <br />
            Of
            <br />
            Fame
          </h2>
        </div>
      </div>
    </section>
  )
}
