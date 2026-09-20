import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { ArrowRight } from 'lucide-react'
import Avatar from '../ui/Avatar.jsx'
import { useNextGeneration } from '../../hooks/useNextGeneration.js'
import { roleLabel } from '../../models/player.model.js'
import ScrollReveal from '../common/ScrollReveal.jsx'
import { fadeUpSoft, staggerContainer, staggerItemUp } from '../../lib/revealVariants.js'

function TalentCard({ player }) {
  return (
    <Link
      to={`/players/${player.publicPlayerId}`}
      className="group flex w-52 shrink-0 flex-col items-center gap-3 rounded-2xl border border-emerald-400/15 bg-white/5 p-5 text-center transition-colors duration-300 hover:border-emerald-400/40"
    >
      <Avatar name={player.name} photoUrl={player.photoUrl} size="lg" />
      <div>
        <h3 className="font-semibold text-white">{player.name}</h3>
        <p className="text-xs text-emerald-100/50">{roleLabel(player.role) || 'Playing role not set'}</p>
      </div>
      <div className="flex items-center gap-3 text-sm">
        <span className="font-semibold text-emerald-400">{player.runs} Runs</span>
        <span className="text-emerald-100/30">·</span>
        <span className="text-emerald-100/60">{player.matches} {player.matches === 1 ? 'Match' : 'Matches'}</span>
      </div>
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-100/60 transition-colors group-hover:text-white">
        View Profile
        <ArrowRight className="h-3 w-3 transition-transform duration-200 group-hover:translate-x-1" />
      </span>
    </Link>
  )
}

// "THE NEXT GENERATION" — real players with strong stats and few career
// matches (no age/DOB field exists anywhere in this app's schema, so
// "emerging" is derived from career.matches, never a fabricated age).
export default function NextGenerationSection() {
  const { players, loading, error } = useNextGeneration()

  if (!loading && !error && players?.length === 0) return null

  return (
    <div className="flex w-full flex-col items-center gap-10 px-6 py-6">
      <ScrollReveal variant={fadeUpSoft} amount={0.4} className="flex max-w-2xl flex-col items-center gap-3 text-center">
        <span className="text-sm font-semibold uppercase tracking-widest text-emerald-400">The Next Generation</span>
        <h2 className="bg-linear-to-r from-white to-emerald-200 bg-clip-text text-3xl font-bold text-transparent sm:text-4xl">
          Tomorrow's Stars, Today.
        </h2>
        <p className="max-w-xl text-emerald-100/60">Discover the players who could be tomorrow's stars.</p>
      </ScrollReveal>

      {error ? (
        <p className="text-red-300/80">{error}</p>
      ) : (
        <ScrollReveal
          as="div"
          variant={staggerContainer(0.06)}
          amount={0.2}
          className="flex w-full max-w-6xl gap-5 overflow-x-auto px-1 pb-2"
        >
          {loading
            ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-56 w-52 shrink-0 animate-pulse rounded-2xl border border-emerald-400/10 bg-white/5" />)
            : players.map((player) => (
                <motion.div key={player.publicPlayerId} variants={staggerItemUp} className="shrink-0">
                  <TalentCard player={player} />
                </motion.div>
              ))}
        </ScrollReveal>
      )}
    </div>
  )
}
