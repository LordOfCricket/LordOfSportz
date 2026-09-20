// Phase 19 Feature 2 — numeric route params (teams.id, matches.id — internal
// serial ids, as opposed to the string public_*_id's used everywhere a
// resource is meant to be referenced externally) were passed straight into
// parameterized SQL unvalidated. A non-numeric value (e.g. GET /teams/abc)
// doesn't get rejected until Postgres itself refuses to cast it, which
// surfaced as an unhandled 500 rather than a clean 400. This is a plain
// shape check, not a lookup — "not found" for a well-formed but nonexistent
// id is still each route's own job.

export function requireIntParam(paramName) {
  return (req, res, next) => {
    const raw = req.params[paramName]
    if (!/^\d+$/.test(raw)) {
      return res.status(400).json({ message: `${paramName} must be a positive integer.` })
    }
    next()
  }
}
