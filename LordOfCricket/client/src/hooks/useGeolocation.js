import { useCallback, useState } from 'react'

/** Browser Geolocation wrapper — no third-party geocoding service, no
 * Google Maps dependency. Only ever requests location on explicit user
 * action (requestLocation()), never on mount — "do not immediately request
 * GPS location; first allow the user to select a city." A denial or
 * unsupported browser leaves `status` at 'denied'/'unavailable' for the
 * caller to fall back to city search. */
export function useGeolocation() {
  // idle -> prompting -> 'granted' | 'denied' | 'unavailable'
  const [status, setStatus] = useState('idle')
  const [coords, setCoords] = useState(null)
  const [error, setError] = useState(null)

  // `onSuccess(coords)`, if given, fires directly inside the browser's
  // geolocation success callback (a plain Web API callback, not a React
  // effect) — lets a caller chain "search nearby" immediately without a
  // useEffect watching `status`/`coords`.
  const requestLocation = useCallback((onSuccess) => {
    if (!('geolocation' in navigator)) {
      setStatus('unavailable')
      setError('Location services are not supported by this browser.')
      return
    }
    setStatus('prompting')
    setError(null)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = { latitude: position.coords.latitude, longitude: position.coords.longitude }
        setCoords(coords)
        setStatus('granted')
        onSuccess?.(coords)
      },
      (err) => {
        setStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable')
        setError(err.message || "Couldn't determine your location.")
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 },
    )
  }, [])

  const reset = useCallback(() => {
    setCoords(null)
    setStatus('idle')
    setError(null)
  }, [])

  return { status, coords, error, requestLocation, reset }
}
