/**
 * Kumite scoring domain types — driven by the verified WKF Kumite Competition
 * Rules, Version 2026.00, valid from 1 January 2026.
 * Source: https://www.wkf.net/files/pdf/documents/WKF%20KUMITE%202026.pdf
 * (full article text retrieved via a WKF-hosted Master Copy mirror), retrieved 2026-09-17.
 * Never hard-code "2026" scoring behavior outside this rule-set-driven layer —
 * a future RuleSetVersion can carry different KumiteConfiguration values.
 */

/** Art. 8.6 — the three raw score levels a technique can earn. */
export const KUMITE_SCORE_TYPES = ["YUKO", "WAZA_ARI", "IPPON"] as const;
export type KumiteScoreType = (typeof KUMITE_SCORE_TYPES)[number];

/** Art. 10.2/10.3 — the warning/penalty ladder, ordered by severity. */
export const KUMITE_PENALTY_TYPES = ["CHUI", "HANSOKU_CHUI", "HANSOKU", "SHIKKAKU"] as const;
export type KumitePenaltyType = (typeof KUMITE_PENALTY_TYPES)[number];

/** Art. 9.1.1 — structured prohibited-behaviour categories (never a free-text reason). */
export const PROHIBITED_BEHAVIOUR_CODES = [
  "EXCESSIVE_CONTACT",
  "CONTACT_TO_THROAT",
  "ATTACK_TO_LIMBS_GROIN_JOINTS",
  "ATTACK_TO_FACE_OPEN_HAND",
  "TECHNIQUE_DURING_WAKARETE",
  "DANGEROUS_THROW",
  "FEIGNING_INJURY",
  "JOGAI",
  "MUBOBI",
  "PASSIVITY",
  "AVOIDING_COMBAT",
  "CLINCHING_OR_WRESTLING",
  "GRABBING_VIOLATION",
  "UNCONTROLLED_DANGEROUS_TECHNIQUE",
  "HEAD_KNEE_ELBOW_ATTACK",
  "ATTACK_ON_DOWNED_OPPONENT",
  "MISCONDUCT_OR_ETIQUETTE",
] as const;
export type ProhibitedBehaviourCode = (typeof PROHIBITED_BEHAVIOUR_CODES)[number];

/** Machine-readable reasons for the deterministic winner-calculation engine (Art. 7.7-7.9, 12.2). */
export const KUMITE_RESULT_REASONS = [
  "CLEAR_LEAD",
  "TIMEUP_HIGHER_SCORE",
  "SENSHU",
  "IPPON_COUNT",
  "WAZA_ARI_COUNT",
  "HANTEI",
  "HANSOKU",
  "SHIKKAKU",
  "KIKEN",
  "HIKIWAKE",
  "DOUBLE_DISQUALIFICATION_BYE",
] as const;
export type KumiteResultReason = (typeof KUMITE_RESULT_REASONS)[number];

/** ScoreEvent.eventType values written by the Kumite engine — kept out of controllers, per the domain-driven design. */
export const KUMITE_EVENT_TYPES = {
  SCORE: (t: KumiteScoreType) => t as string,
  SCORE_CANCELLED: "SCORE_CANCELLED",
  PENALTY: (t: KumitePenaltyType) => `PENALTY_${t}`,
  SENSHU_AWARDED: "SENSHU_AWARDED",
  SENSHU_ANNULLED: "SENSHU_ANNULLED",
  HANTEI_VOTE: "HANTEI_VOTE",
  CLOCK_STARTED: "CLOCK_STARTED",
  CLOCK_PAUSED: "CLOCK_PAUSED",
  CLOCK_RESUMED: "CLOCK_RESUMED",
  CLOCK_TIMEUP: "CLOCK_TIMEUP",
} as const;
