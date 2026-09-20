import { useState } from 'react'
import { Share2, Check } from 'lucide-react'
import { shareEntity } from '../../lib/shareEntity.js'

// Share a public LOC entity by its stable web URL. Native share sheet where
// available, clipboard copy as the fallback (transient "Link copied" state).
// Same visual language as the Match Summary page's existing Share control.
export default function ShareButton({ title, text, path, size = 'md', className = '' }) {
  const [copied, setCopied] = useState(false)

  const onClick = async () => {
    const result = await shareEntity({ title, text, path })
    if (result === 'copied') {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const pad = size === 'sm' ? 'px-3 py-1 text-xs' : 'px-4 py-1.5 text-sm'

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 font-semibold text-slate-100 transition-colors hover:bg-white/10 ${pad} ${className}`}
      aria-label="Share"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Share2 className="h-3.5 w-3.5" />}
      {copied ? 'Link copied' : 'Share'}
    </button>
  )
}
