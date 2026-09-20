import type { EligibilityReasonCode, EligibilityStatus, Discipline } from "@karate/types";
import type { Gender, GenderRestriction } from "@karate/database";

/**
 * Pure, side-effect-free evaluation — no Prisma, no I/O. Everything the
 * engine needs is passed in already resolved from authoritative server
 * state (verified belt, player's own profile fields, official weight once
 * Phase 9 exists). Keeping this pure is what makes it independently
 * testable and reusable from both the create-registration flow and an
 * explicit re-evaluate action, with no risk of the two paths drifting.
 */
export interface EligibilityEngineInput {
  player: { dateOfBirth: Date; gender: Gender; styleIds: string[] };
  /** Player's verified (isCurrent + VERIFIED) belt grade rank, or null if they don't have one. Never a client-supplied value. */
  verifiedGradeRankOrder: number | null;
  category: {
    genderRestriction: GenderRestriction;
    ageMin: number | null;
    ageMax: number | null;
    weightMinKg: number | null;
    weightMaxKg: number | null;
    beltGradeMinOrder: number | null;
    beltGradeMaxOrder: number | null;
    karateStyleId: string | null;
  };
  competition: { discipline: Discipline };
  /** Empty = the category's style (if any) has no discipline restriction. */
  styleSupportedDisciplines: Discipline[];
  /** Official, verified weigh-in result (Phase 9). Undefined/null means "not measured yet", never a client claim. */
  officialWeightKg?: number | null;
  now?: Date;
}

export interface EligibilityEngineResult {
  status: EligibilityStatus;
  reasonCodes: EligibilityReasonCode[];
}

function calculateAge(dateOfBirth: Date, at: Date): number {
  let age = at.getFullYear() - dateOfBirth.getFullYear();
  const hasHadBirthdayThisYear =
    at.getMonth() > dateOfBirth.getMonth() ||
    (at.getMonth() === dateOfBirth.getMonth() && at.getDate() >= dateOfBirth.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

export function evaluateEligibility(input: EligibilityEngineInput): EligibilityEngineResult {
  const { category } = input;
  const now = input.now ?? new Date();
  const reasonCodes: EligibilityReasonCode[] = [];

  if (category.ageMin != null || category.ageMax != null) {
    const age = calculateAge(input.player.dateOfBirth, now);
    if (
      (category.ageMin != null && age < category.ageMin) ||
      (category.ageMax != null && age > category.ageMax)
    ) {
      reasonCodes.push("AGE_OUTSIDE_RANGE");
    }
  }

  if (
    category.genderRestriction !== "OPEN" &&
    category.genderRestriction !== "MIXED" &&
    category.genderRestriction !== input.player.gender
  ) {
    reasonCodes.push("GENDER_NOT_ELIGIBLE");
  }

  if (category.beltGradeMinOrder != null || category.beltGradeMaxOrder != null) {
    if (input.verifiedGradeRankOrder == null) {
      reasonCodes.push("BELT_NOT_VERIFIED");
    } else if (
      (category.beltGradeMinOrder != null && input.verifiedGradeRankOrder < category.beltGradeMinOrder) ||
      (category.beltGradeMaxOrder != null && input.verifiedGradeRankOrder > category.beltGradeMaxOrder)
    ) {
      reasonCodes.push("BELT_NOT_ELIGIBLE");
    }
  }

  if (category.karateStyleId && !input.player.styleIds.includes(category.karateStyleId)) {
    reasonCodes.push("STYLE_NOT_ELIGIBLE");
  }

  if (
    input.styleSupportedDisciplines.length > 0 &&
    !input.styleSupportedDisciplines.includes(input.competition.discipline)
  ) {
    reasonCodes.push("DISCIPLINE_NOT_ELIGIBLE");
  }

  let weightPending = false;
  if (category.weightMinKg != null || category.weightMaxKg != null) {
    if (input.officialWeightKg == null) {
      weightPending = true;
      reasonCodes.push("WEIGHT_NOT_YET_MEASURED");
    } else if (
      (category.weightMinKg != null && input.officialWeightKg < category.weightMinKg) ||
      (category.weightMaxKg != null && input.officialWeightKg > category.weightMaxKg)
    ) {
      reasonCodes.push("WEIGHT_OUTSIDE_RANGE");
    }
  }

  const hardFailures = reasonCodes.filter((code) => code !== "WEIGHT_NOT_YET_MEASURED");
  if (hardFailures.length > 0) {
    return { status: "INELIGIBLE", reasonCodes };
  }
  if (weightPending) {
    return { status: "PENDING", reasonCodes };
  }
  return { status: "ELIGIBLE", reasonCodes: [] };
}
