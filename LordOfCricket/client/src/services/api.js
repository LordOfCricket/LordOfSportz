import axios from 'axios'

// Phase 8 — the Authorization-header interceptor that used to attach a
// localStorage JWT was removed here: nothing has written a token to
// localStorage since the legacy password login was removed (see
// docs/AUTH.md), and every request already authenticates via the HttpOnly
// session cookie through `withCredentials: true` below.
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,
})

// Phase 22.1 — a session that expires or is revoked mid-use (cookie expiry,
// a security-incident forced logout) previously had no central handling:
// each page's own hook just treated the resulting 401 as a generic load
// error, leaving a stale/broken screen instead of returning to login.
// `/auth/me` is deliberately excluded — its 401 is the expected, already
// locally-handled way `AuthContext` first learns a visitor isn't logged in
// on page load, not a session dying mid-use. AuthContext listens for this
// event and resets its state; the existing RequireAuth route guard then
// does the actual redirect to /login, exactly as if the user had never been
// authenticated — no second, parallel redirect mechanism is introduced.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !error.config?.url?.includes('/auth/me')) {
      window.dispatchEvent(new Event('loc:session-expired'))
    }
    return Promise.reject(error)
  },
)

export default api
