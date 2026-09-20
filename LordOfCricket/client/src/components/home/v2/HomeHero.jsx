import { Link } from 'react-router-dom'
import heroImage from '../../../assets/hero-cricket-players.png'

export default function HomeHero() {
  return (
    <section className="w-full bg-loc-surface">
      <div className="mx-auto flex min-h-[calc(100vh-100px)] w-full max-w-[1400px] flex-col items-center gap-12 px-6 py-16 sm:px-10 lg:flex-row lg:px-16">
        <div className="w-full max-w-2xl lg:w-1/2">
          <h1 className="text-5xl font-black uppercase leading-[0.95] tracking-tight text-loc-navy sm:text-6xl lg:text-7xl">
            Your Game.
            <br />
            Your Ground.
            <br />
            Your Legacy.
          </h1>

          <p className="mt-6 max-w-xl text-base leading-7 text-loc-muted">
            Discover cricket grounds, matches, teams and players in one powerful platform built for the game you love.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/matches"
              className="rounded-full bg-loc-green px-6 py-3 text-sm font-bold text-white no-underline transition hover:bg-loc-green-strong"
            >
              Explore Matches
            </Link>
            <Link
              to="/players"
              className="rounded-full border border-loc-green px-6 py-3 text-sm font-bold text-loc-green-strong no-underline transition hover:bg-loc-mint"
            >
              Discover Players
            </Link>
          </div>
        </div>

        <div className="hidden w-1/2 items-center justify-center lg:flex">
          <img src={heroImage} alt="Cricket players on the field" className="h-[500px] w-full rounded-3xl object-cover" />
        </div>
      </div>
    </section>
  )
}
