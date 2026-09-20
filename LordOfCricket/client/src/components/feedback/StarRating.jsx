import { Star } from 'lucide-react'

// Integer 1-5 ratings only for this first version (no half-stars — U6 scope).
export default function StarRating({ value, onChange, label }) {
  return (
    <div>
      {label && <p className="mb-2 text-sm font-semibold text-slate-200">{label}</p>}
      <div className="flex gap-1.5" role="radiogroup" aria-label={label || 'Rating'}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} star${n === 1 ? '' : 's'}`}
            onClick={() => onChange(n)}
            className="p-1 transition-transform hover:scale-110"
          >
            <Star className={`h-8 w-8 ${value >= n ? 'fill-amber-400 text-amber-400' : 'text-slate-600'}`} />
          </button>
        ))}
      </div>
    </div>
  )
}
