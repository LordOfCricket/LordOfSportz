const TONES = {
  active: 'loc-badge-active',
  inactive: 'loc-badge-inactive',
  warn: 'loc-badge-warn',
  danger: 'loc-badge-danger',
}

// Shared LOC status badge. `tone`: active | inactive | warn | danger.
export default function LocBadge({ tone = 'inactive', className = '', children }) {
  return <span className={`loc-badge ${TONES[tone] || TONES.inactive} ${className}`.trim()}>{children}</span>
}
