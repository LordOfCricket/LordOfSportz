import { describe, it, expect } from "vitest";
import { evaluateEligibility, type EligibilityEngineInput } from "../src/domain/eligibilityEngine";

const BASE: EligibilityEngineInput = {
  player: { dateOfBirth: new Date("2000-01-01"), gender: "MALE", styleIds: [] },
  verifiedGradeRankOrder: null,
  category: {
    genderRestriction: "OPEN",
    ageMin: null,
    ageMax: null,
    weightMinKg: null,
    weightMaxKg: null,
    beltGradeMinOrder: null,
    beltGradeMaxOrder: null,
    karateStyleId: null,
  },
  competition: { discipline: "KUMITE" },
  styleSupportedDisciplines: [],
  officialWeightKg: null,
  now: new Date("2026-01-01"),
};

describe("Eligibility engine (Phase 7)", () => {
  it("1. an unconstrained category is ELIGIBLE with no reasons", () => {
    const result = evaluateEligibility(BASE);
    expect(result.status).toBe("ELIGIBLE");
    expect(result.reasonCodes).toEqual([]);
  });

  it("2. age outside the category range is INELIGIBLE with AGE_OUTSIDE_RANGE", () => {
    const result = evaluateEligibility({
      ...BASE,
      category: { ...BASE.category, ageMin: 10, ageMax: 15 },
    });
    expect(result.status).toBe("INELIGIBLE");
    expect(result.reasonCodes).toContain("AGE_OUTSIDE_RANGE");
  });

  it("3. gender restriction mismatch is INELIGIBLE with GENDER_NOT_ELIGIBLE", () => {
    const result = evaluateEligibility({
      ...BASE,
      category: { ...BASE.category, genderRestriction: "FEMALE" },
    });
    expect(result.status).toBe("INELIGIBLE");
    expect(result.reasonCodes).toContain("GENDER_NOT_ELIGIBLE");
  });

  it("4. official weight outside the category range is INELIGIBLE with WEIGHT_OUTSIDE_RANGE", () => {
    const result = evaluateEligibility({
      ...BASE,
      category: { ...BASE.category, weightMinKg: 60, weightMaxKg: 70 },
      officialWeightKg: 80,
    });
    expect(result.status).toBe("INELIGIBLE");
    expect(result.reasonCodes).toContain("WEIGHT_OUTSIDE_RANGE");
  });

  it("5. a verified grade below the category's minimum is INELIGIBLE with BELT_NOT_ELIGIBLE", () => {
    const result = evaluateEligibility({
      ...BASE,
      verifiedGradeRankOrder: 1,
      category: { ...BASE.category, beltGradeMinOrder: 5, beltGradeMaxOrder: 10 },
    });
    expect(result.status).toBe("INELIGIBLE");
    expect(result.reasonCodes).toContain("BELT_NOT_ELIGIBLE");
  });

  it("6. a player without the category's required style is INELIGIBLE with STYLE_NOT_ELIGIBLE", () => {
    const result = evaluateEligibility({
      ...BASE,
      player: { ...BASE.player, styleIds: ["other-style"] },
      category: { ...BASE.category, karateStyleId: "required-style" },
    });
    expect(result.status).toBe("INELIGIBLE");
    expect(result.reasonCodes).toContain("STYLE_NOT_ELIGIBLE");
  });

  it("7. a style restricted to a different discipline is INELIGIBLE with DISCIPLINE_NOT_ELIGIBLE", () => {
    const result = evaluateEligibility({
      ...BASE,
      competition: { discipline: "KUMITE" },
      styleSupportedDisciplines: ["KATA"],
    });
    expect(result.status).toBe("INELIGIBLE");
    expect(result.reasonCodes).toContain("DISCIPLINE_NOT_ELIGIBLE");
  });

  it("8. multiple simultaneous failures all appear as structured reason codes", () => {
    const result = evaluateEligibility({
      ...BASE,
      category: { ...BASE.category, ageMin: 10, ageMax: 15, genderRestriction: "FEMALE" },
    });
    expect(result.status).toBe("INELIGIBLE");
    expect(result.reasonCodes).toEqual(expect.arrayContaining(["AGE_OUTSIDE_RANGE", "GENDER_NOT_ELIGIBLE"]));
    expect(result.reasonCodes).toHaveLength(2);
  });

  it("9. a weight-bound category with no official measurement yet is PENDING, not INELIGIBLE", () => {
    const result = evaluateEligibility({
      ...BASE,
      category: { ...BASE.category, weightMinKg: 60, weightMaxKg: 70 },
      officialWeightKg: null,
    });
    expect(result.status).toBe("PENDING");
    expect(result.reasonCodes).toContain("WEIGHT_NOT_YET_MEASURED");
  });
});
