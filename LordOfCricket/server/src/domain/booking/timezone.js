// Moved to domain/shared/groundTime.js (Umpire Communication & Commercial
// 2.0) — the logic was always domain-agnostic ground-local time math, not
// booking-specific, and the umpire-domain reminder scheduler needed it too.
// Re-exported here so every existing booking import keeps working unchanged.
export * from '../shared/groundTime.js'
