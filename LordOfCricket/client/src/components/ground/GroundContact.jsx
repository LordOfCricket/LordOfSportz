import { Globe, Mail, MapPin, Phone } from 'lucide-react'
import { formatGroundAddress, hasValue } from '../../models/groundDiscovery.model.js'

// Every field is optional; a missing one is hidden
// entirely, never rendered as a placeholder ("+91 00000 00000").
export default function GroundContact({ ground }) {
  const address = formatGroundAddress(ground)

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-sm text-emerald-100/60">
      {hasValue(address) && (
        <span className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-emerald-400" aria-hidden="true" />
          {address}
        </span>
      )}
      {hasValue(ground.email) && (
        <a href={`mailto:${ground.email}`} className="flex items-center gap-2 transition-colors hover:text-white">
          <Mail className="h-4 w-4 text-emerald-400" aria-hidden="true" />
          {ground.email}
        </a>
      )}
      {hasValue(ground.phone) && (
        <a href={`tel:${ground.phone}`} className="flex items-center gap-2 transition-colors hover:text-white">
          <Phone className="h-4 w-4 text-emerald-400" aria-hidden="true" />
          {ground.phone}
        </a>
      )}
      {hasValue(ground.website) && (
        <a href={ground.website} target="_blank" rel="noreferrer" className="flex items-center gap-2 transition-colors hover:text-white">
          <Globe className="h-4 w-4 text-emerald-400" aria-hidden="true" />
          Website
        </a>
      )}
    </div>
  )
}
