import { Link } from 'react-router-dom'

const STEPS = [
  { n: '01', title: 'Create Your Profile', body: 'Tell LOC who you are and start your cricket journey.' },
  { n: '02', title: 'Discover', body: 'Find players, teams, grounds, matches and leagues.' },
  { n: '03', title: 'Connect', body: 'Join teams, organize matches and connect with the cricket community.' },
  { n: '04', title: 'Play', body: 'Get on the ground and build your cricket journey.' },
]

export default function WhoWeAreSection() {
  return (
    <section className="flex w-full flex-col lg:flex-row">
      <div className="flex w-full flex-col justify-center bg-green-800 px-6 py-16 sm:px-10 lg:w-1/2 lg:px-16 lg:py-20">
        <h2 className="mt-4 max-w-xl text-3xl font-black uppercase leading-tight text-white sm:text-4xl lg:text-5xl">
          The Home of Cricket Beyond Just the Game.
        </h2>
        <p className="mt-6 max-w-xl text-sm leading-7 text-green-100 sm:text-base">
          Lord Of Cricket brings players, teams, grounds, matches and leagues together in one place — making it easier to
          discover, connect and be part of the game.
        </p>
        <div className="mt-8">
          <Link
            to="/grounds"
            className="inline-flex rounded-full bg-loc-surface px-6 py-3 text-sm font-bold text-loc-green-strong no-underline transition hover:bg-loc-mint"
          >
            Explore LOC
          </Link>
        </div>
      </div>

      <div className="flex w-full items-center justify-center bg-loc-surface px-6 py-16 sm:px-10 lg:w-1/2 lg:px-16 lg:py-20">
        <div className="w-full max-w-xl">
          <div className="text-center">
            <h2 className="mt-4 text-3xl font-black uppercase leading-tight text-loc-navy sm:text-4xl">
              Everything You Need.
              <br />
              One Cricket Platform.
            </h2>
          </div>

          <div className="mt-10 space-y-6">
            {STEPS.map((step) => (
              <div key={step.n} className="flex items-start gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100 text-sm font-bold text-loc-green">
                  {step.n}
                </span>
                <div>
                  <h3 className="font-bold text-loc-navy">{step.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-loc-muted">{step.body}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-10">
            <Link
              to="/signup"
              className="inline-flex items-center rounded-full bg-loc-green px-7 py-3.5 text-sm font-bold text-white no-underline transition hover:bg-loc-green-strong"
            >
              Start Your Cricket Journey
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
