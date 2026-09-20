import AsyncStorage from '@react-native-async-storage/async-storage'

// Local-only convenience: the last few global-search terms, newest first.
// Not synced anywhere; failures are swallowed so search never depends on it.
const KEY = 'loc_recent_searches'
const MAX = 6

export async function getRecentSearches(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string').slice(0, MAX) : []
  } catch {
    return []
  }
}

export async function addRecentSearch(term: string): Promise<string[]> {
  const t = term.trim()
  if (!t) return getRecentSearches()
  try {
    const existing = await getRecentSearches()
    const next = [t, ...existing.filter((v) => v.toLowerCase() !== t.toLowerCase())].slice(0, MAX)
    await AsyncStorage.setItem(KEY, JSON.stringify(next))
    return next
  } catch {
    return getRecentSearches()
  }
}

export async function clearRecentSearches(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}
