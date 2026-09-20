import { Link } from 'react-router-dom'
import { useAllGrounds } from '../../../hooks/useAllGrounds.js'
import GroundMiniCard from './GroundMiniCard.jsx'

const MAX_CARDS = 8

export default function FeaturedGroundsSection() {
  const { grounds, loading, error } = useAllGrounds({ sort: 'name', limit: MAX_CARDS })

  if (!loading && (error || grounds.length === 0)) return null

  const animate = !loading && grounds.length >= 4
  const track = animate ? [...grounds, ...grounds] : grounds

  return (
    <section className="w-full overflow-hidden bg-loc-surface py-16 sm:py-20 lg:py-24">
      <div className="flex w-full flex-col lg:flex-row">
        <div className="flex w-full items-center px-6 pb-10 sm:px-10 lg:w-[30%] lg:px-12 lg:pb-0">
          <h2 className="text-4xl font-black uppercase leading-[0.9] tracking-tight text-loc-navy sm:text-5xl lg:text-6xl">
            Featured
            <br />
            Grounds
          </h2>
        </div>

        <div className="w-full overflow-hidden lg:w-[70%]">
          {loading ? (
            <div className="flex gap-5 px-6 lg:px-0">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-56 w-[240px] shrink-0 animate-pulse rounded-2xl border border-loc-border-soft bg-slate-100" />
              ))}
            </div>
          ) : (
            <div className={`flex w-max gap-5 px-6 lg:px-0 ${animate ? 'ground-marquee-v2' : ''}`}>
              {track.map((ground, i) => (
                <GroundMiniCard key={`${ground.publicGroundId}-${i}`} ground={ground} />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-10 px-6 sm:px-10 lg:px-12">
        <Link to="/grounds" className="text-sm font-bold text-loc-green no-underline hover:text-loc-green-strong">
          View all grounds →
        </Link>
      </div>

      <style>{`
        @keyframes groundMarqueeV2 { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .ground-marquee-v2 { animation: groundMarqueeV2 28s linear infinite; }
        .ground-marquee-v2:hover { animation-play-state: paused; }
        @media (prefers-reduced-motion: reduce) { .ground-marquee-v2 { animation: none; } }
      `}</style>
    </section>
  )
}
