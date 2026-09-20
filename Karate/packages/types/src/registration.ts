export const REGISTRATION_STATUSES = ["SUBMITTED", "VERIFIED", "REJECTED", "WITHDRAWN", "CONFIRMED"] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

/**
 * Valid forward transitions, mirroring the tournament lifecycle pattern
 * (apps/api/src/domain/registrationLifecycle.ts is the only place allowed to
 * apply one). Phase 6 only ever exercises SUBMITTED -> WITHDRAWN; VERIFIED/
 * REJECTED/CONFIRMED are reserved for the eligibility/readiness phases that
 * build on top of this table, so the map doesn't need reshaping later.
 */
export const REGISTRATION_STATUS_TRANSITIONS: Record<RegistrationStatus, RegistrationStatus[]> = {
  SUBMITTED: ["WITHDRAWN", "VERIFIED", "REJECTED"],
  VERIFIED: ["CONFIRMED", "REJECTED", "WITHDRAWN"],
  REJECTED: [],
  WITHDRAWN: [],
  CONFIRMED: ["WITHDRAWN"],
};

export const ELIGIBILITY_STATUSES = [
  "NOT_CHECKED",
  "PENDING",
  "ELIGIBLE",
  "INELIGIBLE",
  "MANUAL_REVIEW",
] as const;
export type EligibilityStatus = (typeof ELIGIBILITY_STATUSES)[number];

export const ELIGIBILITY_REASON_CODES = [
  "AGE_OUTSIDE_RANGE",
  "GENDER_NOT_ELIGIBLE",
  "WEIGHT_OUTSIDE_RANGE",
  "WEIGHT_NOT_YET_MEASURED",
  "BELT_NOT_ELIGIBLE",
  "BELT_NOT_VERIFIED",
  "STYLE_NOT_ELIGIBLE",
  "DISCIPLINE_NOT_ELIGIBLE",
  "MISSING_INFORMATION",
  "MANUAL_REVIEW_REQUIRED",
] as const;
export type EligibilityReasonCode = (typeof ELIGIBILITY_REASON_CODES)[number];

export const MEDICAL_CLEARANCE_STATUSES = ["PENDING", "CLEARED", "NOT_CLEARED", "EXPIRED"] as const;
export type MedicalClearanceStatusValue = (typeof MEDICAL_CLEARANCE_STATUSES)[number];

/** Enforced by apps/api/src/domain/medicalClearanceLifecycle.ts — never a client-set value. */
export const MEDICAL_CLEARANCE_STATUS_TRANSITIONS: Record<
  MedicalClearanceStatusValue,
  MedicalClearanceStatusValue[]
> = {
  PENDING: ["CLEARED", "NOT_CLEARED"],
  CLEARED: ["EXPIRED"],
  NOT_CLEARED: [],
  EXPIRED: [],
};

export const WEIGH_IN_STATUSES = ["PENDING", "PASSED", "FAILED", "REWEIGH_REQUIRED"] as const;
export type WeighInStatus = (typeof WEIGH_IN_STATUSES)[number];
