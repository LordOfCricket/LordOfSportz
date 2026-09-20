import { useEffect, useState } from 'react'

/** Delays reflecting `value` until it stops changing for `delayMs` — used to
 * avoid firing a search request on every keystroke (250-400ms). */
export function useDebouncedValue(value, delayMs = 350) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
