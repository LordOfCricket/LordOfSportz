import { useEffect, useState } from 'react'

/**
 * Returns `value`, but only updates after it has stopped changing for
 * `delayMs`. Used by the player directory's search input so typing doesn't
 * fire a network request per keystroke (searchLimiter allows 120 requests /
 * 5 min per IP — a 400ms debounce keeps a normal search well under that).
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
