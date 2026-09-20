import { useState } from 'react'
import { initials } from '../../models/player.model.js'

const SIZE_CLASSES = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-base',
}

export default function Avatar({ name, photoUrl, size = 'md', className = '' }) {
  const [imageFailed, setImageFailed] = useState(false)
  const sizeClass = SIZE_CLASSES[size] || SIZE_CLASSES.md

  if (photoUrl && !imageFailed) {
    return (
      <img
        src={photoUrl}
        alt={name || 'Player'}
        onError={() => setImageFailed(true)}
        className={`${sizeClass} shrink-0 rounded-full object-cover ring-2 ring-white/10 ${className}`}
      />
    )
  }

  return (
    <span
      className={`${sizeClass} inline-flex shrink-0 items-center justify-center rounded-full bg-linear-to-br from-emerald-400 to-emerald-600 font-bold text-emerald-950 ring-2 ring-white/10 ${className}`}
    >
      {initials(name)}
    </span>
  )
}
