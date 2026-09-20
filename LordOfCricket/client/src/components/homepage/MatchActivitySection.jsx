import { useHomeDiscovery } from '../../hooks/useHomeDiscovery.js'
import FeaturedLiveMatch from './FeaturedLiveMatch.jsx'
import { StatsErrorState } from '../stats/StatsStates.jsx'
import ScrollReveal from '../common/ScrollReveal.jsx'
import { energeticReveal } from '../../lib/revealVariants.js'

// Homepage match discovery. Shows only live match activity.
// A failure here is contained to this section and never crashes the rest of the
// homepage, since HomePage.jsx renders this as one self-contained subtree.

export default function MatchActivitySection() {
  const { data, loading, error, retry } = useHomeDiscovery()

  if (loading) {
    return (
      <div className="flex w-full flex-col gap-10 px-6 py-6 lg:px-10">
        <div className="h-40 animate-pulse rounded-3xl border border-loc-border bg-loc-mint" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="w-full px-6 py-6 lg:px-10">
        <StatsErrorState message={error || "Couldn't load match activity."} onRetry={retry} light />
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col gap-10 px-6 py-6 lg:px-10">
      <ScrollReveal variant={energeticReveal} amount={0.3}>
        <FeaturedLiveMatch match={data.featuredLiveMatch} />
      </ScrollReveal>
    </div>
  )
}
