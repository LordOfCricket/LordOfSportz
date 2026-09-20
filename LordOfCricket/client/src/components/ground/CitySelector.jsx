import { useEffect, useRef, useState } from 'react'
import { MapPin, Search } from 'lucide-react'
import { fetchGroundCities } from '../../services/groundsApi.js'

// Searchable city combobox — filters a REAL list of cities that currently
// have at least one ACTIVE ground (GET /grounds/cities), not a hardcoded
// "possible cities" list. Still lets the user submit free text for a city
// not yet in that list (never blocks discovery just because the list is
// short today, e.g. this app has 1 real ground right now).
export default function CitySelector({ onSelect }) {
  const [cities, setCities] = useState([])
  const [value, setValue] = useState('')
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(-1)
  const containerRef = useRef(null)

  useEffect(() => {
    fetchGroundCities()
      .then(setCities)
      .catch(() => setCities([]))
  }, [])

  useEffect(() => {
    const onClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const matches = value.trim() ? cities.filter((c) => c.toLowerCase().includes(value.trim().toLowerCase())) : cities

  const submit = (city) => {
    const trimmed = city.trim()
    if (!trimmed) return
    setValue(trimmed)
    setOpen(false)
    onSelect(trimmed)
  }

  const handleKeyDown = (event) => {
    if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      setOpen(true)
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlighted((i) => Math.min(i + 1, matches.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlighted((i) => Math.max(i - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      submit(highlighted >= 0 && matches[highlighted] ? matches[highlighted] : value)
    } else if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <div className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-white/5 px-5">
        <Search className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-label="Select your city"
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setOpen(true)
            setHighlighted(-1)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search your city — e.g. Gurugram"
          className="h-12 w-full bg-transparent text-white placeholder:text-emerald-100/40 focus:outline-none"
        />
      </div>

      {open && matches.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-20 mt-2 w-full max-h-64 overflow-y-auto rounded-2xl border border-emerald-400/20 bg-loc-dark shadow-xl shadow-black/40"
        >
          {matches.map((city, i) => (
            <li key={city}>
              <button
                type="button"
                role="option"
                aria-selected={i === highlighted}
                onClick={() => submit(city)}
                onMouseEnter={() => setHighlighted(i)}
                className={`flex w-full items-center gap-2 px-5 py-3 text-left text-sm transition-colors ${
                  i === highlighted ? 'bg-emerald-500/15 text-white' : 'text-emerald-100/80 hover:bg-white/5'
                }`}
              >
                <MapPin className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden="true" />
                {city}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
