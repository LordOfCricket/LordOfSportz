import ScrollReveal from '../common/ScrollReveal.jsx'
import { fadeUpSoft } from '../../lib/revealVariants.js'
import { hasValue } from '../../models/groundDiscovery.model.js'

// ground.description is real API data now, not a
// hardcoded paragraph. A missing description gets a plain, honest
// fallback line, never an invented "about this ground" paragraph.
export default function GroundAbout({ ground }) {
  return (
    <div className="w-full max-w-2xl">
      <ScrollReveal
        variant={fadeUpSoft}
        amount={0.4}
        className="loc-card flex flex-col justify-center p-5"
      >
        <p className="text-loc-muted">
          {hasValue(ground.description) ? ground.description : `${ground.name} hasn't added a description yet.`}
        </p>
      </ScrollReveal>
    </div>
  )
}
