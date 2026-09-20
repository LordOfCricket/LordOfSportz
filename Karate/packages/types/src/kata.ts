/**
 * Kata competition domain types — driven by the verified WKF Kata Competition
 * Rules, Version 2026.0, valid from 1 January 2026
 * (https://www.wkf.net/files/pdf/documents/WKF%20Kata%20Competition%20Rules%202026%20MASTER%20COPY_V2.pdf,
 * retrieved 2026-09-17). Article references below cite that document.
 *
 * A Kata bout is always one-on-one, AKA vs AO (Art. 3.1.2/3.2.1) — the
 * winner is decided by a majority of judge VOTES (Art. 5.4.2/5.5.1), each
 * judge's vote derived from the two 5.0-10.0 scores they gave. This is a
 * different result mechanism from Kumite's point ledger — no shared engine.
 */

export const KATA_RESULT_REASONS = [
  "JUDGE_MAJORITY",
  "DISQUALIFICATION",
  "KIKEN",
  "WALKOVER",
  "TIE_UNRESOLVED",
] as const;
export type KataResultReason = (typeof KATA_RESULT_REASONS)[number];
