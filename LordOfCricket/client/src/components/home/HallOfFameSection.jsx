import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { Trophy, Target, Flame, Sparkles } from 'lucide-react'
import { useHallOfFame } from '../../hooks/useHallOfFame.js'
import useTiltHover from '../../hooks/useTiltHover.js'
import { roleLabel } from '../../models/player.model.js'
import ScrollReveal from '../common/ScrollReveal.jsx'
import { fadeUpSoft, staggerContainer, staggerItemScale } from '../../lib/revealVariants.js'

const CATEGORY_ICON = { topPerformer: Trophy, maximumScore: Target, maximumWickets: Flame, emergingPlayer: Sparkles }

function HallOfFameCard({ category }) {
  const tilt = useTiltHover(4, 1.015)
  const Icon = CATEGORY_ICON[category.key]
  const Card = tilt.enabled ? motion.div : 'div'

  if (!category.player) {
    return (
      <div className="flex h-120 flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-emerald-400/20 bg-white/2 px-6 text-center">
        <Icon className="h-8 w-8 text-emerald-400/40" aria-hidden="true" />
        <p className="text-sm font-semibold text-emerald-100/50 uppercase tracking-wide">{category.label}</p>
        <p className="text-xs text-emerald-100/30">Not yet awarded — check back once more matches are played.</p>
      </div>
    )
  }

  const { player } = category

  return (
    <Card
      {...(tilt.enabled ? { style: tilt.style, onPointerMove: tilt.onPointerMove, onPointerLeave: tilt.onPointerLeave } : {})}
      className="h-full"
    >
      <Link
        to={`/players/${player.publicPlayerId}`}
        className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-emerald-400/15 bg-loc-card-dark shadow-xl shadow-black/40 transition-colors duration-300 hover:border-loc-gold/40"
      >
        <div className="relative h-56 w-full shrink-0 overflow-hidden bg-black/40">
          {player.photoUrl ? (
            <img src={player.photoUrl} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-linear-to-br from-emerald-900/40 to-loc-dark">
              <span className="font-loc-display text-5xl font-bold text-emerald-400/30">{player.name?.charAt(0)}</span>
            </div>
          )}
          <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-loc-card-dark via-transparent to-transparent" />
          <span className="absolute top-3 right-3 flex items-center gap-1.5 rounded-full bg-loc-gold/15 px-3 py-1 text-[11px] font-bold tracking-wide text-loc-gold uppercase backdrop-blur-sm">
            <Icon className="h-3 w-3" aria-hidden="true" />
            {category.label}
          </span>
          <div className="absolute inset-x-0 bottom-0 p-5">
            <h3 className="font-loc-display text-xl font-bold text-white uppercase">{player.name}</h3>
            <p className="mt-0.5 text-xs text-emerald-100/60">{roleLabel(player.role) || 'Playing role not set'}</p>
          </div>
        </div>

        {/* His stats — a real table, every row a genuine all-time career
            field the backend already returns (see useHallOfFame.js), never
            a fabricated "this week" number. */}
        <div className="flex flex-1 flex-col justify-center gap-1.5 p-5">
          <p className="mb-1 font-loc-display text-2xl font-extrabold text-emerald-400">{player.headline}</p>
          <div className="divide-y divide-white/5 border-t border-white/5">
            {player.stats.map((row) => (
              <div key={row.label} className="flex items-center justify-between py-2.5 text-sm">
                <span className="text-emerald-100/50">{row.label}</span>
                <span className="font-semibold text-white">{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      </Link>
    </Card>
  )
}

function CardSkeleton() {
  return <div className="h-120 animate-pulse rounded-3xl border border-emerald-400/10 bg-white/5" />
}

// "HALL OF FAME" — 4 real, all-time leaders (Stage 1 planning decided
// against a fabricated "this week" claim — the backend has no date-ranged
// leaderboard). Every card is real career data; a category with no
// qualifying player yet shows an honest placeholder, never an invented
// name.
export default function HallOfFameSection() {
  const { categories, loading, error } = useHallOfFame()

  return (
    <div className="flex w-full flex-col items-center gap-10 px-6 py-6">
      <ScrollReveal variant={fadeUpSoft} amount={0.4} className="flex max-w-2xl flex-col items-center gap-3 text-center">
        <span className="text-sm font-semibold uppercase tracking-widest text-emerald-400">Hall of Fame</span>
        <h2 className="font-loc-display text-4xl font-extrabold tracking-[0.04em] text-loc-gold uppercase sm:text-5xl">
          LOC's All-Time Leaders.
        </h2>
        <p className="max-w-xl text-emerald-100/60">Those who made the game unforgettable.</p>
      </ScrollReveal>

      {error ? (
        <p className="text-red-300/80">{error}</p>
      ) : (
        <ScrollReveal
          as="div"
          variant={staggerContainer(0.1)}
          amount={0.2}
          className="grid w-full max-w-7xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4"
        >
          {loading
            ? Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)
            : categories.map((category) => (
                <motion.div key={category.key} variants={staggerItemScale}>
                  <HallOfFameCard category={category} />
                </motion.div>
              ))}
        </ScrollReveal>
      )}
    </div>
  )
}
