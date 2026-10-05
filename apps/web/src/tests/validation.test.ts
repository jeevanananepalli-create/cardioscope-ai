import { categoryFor, FALLBACK_RISK_CATEGORIES } from "@/lib/constants";
import {
  emptyFormValues,
  inputFeatures,
  outsideTrainingRange,
  previewBmi,
  typicalFormValues,
  validateField,
  validatePatient,
} from "@/lib/validation";

import { schemaFixture, validFeatures } from "./fixtures";

const feature = (name: string) => schemaFixture.features.find((f) => f.name === name)!;

describe("patient validation", () => {
  it("leaves derived features out of the inputs", () => {
    expect(inputFeatures(schemaFixture).map((f) => f.name)).not.toContain("BMI");
    expect(Object.keys(emptyFormValues(schemaFixture))).toHaveLength(8);
  });

  it("requires every field", () => {
    const result = validatePatient(schemaFixture, emptyFormValues(schemaFixture));
    expect(result.features).toBeNull();
    expect(Object.keys(result.errors)).toHaveLength(8);
    expect(result.errors.Age).toBe("Age is required.");
  });

  it("accepts typical values and returns typed features", () => {
    const result = validatePatient(schemaFixture, typicalFormValues(schemaFixture));
    expect(result.errors).toEqual({});
    expect(result.features).toEqual(validFeatures);
  });

  it.each([
    ["abc", "Age must be a number."],
    ["12abc", "Age must be a number."],
    ["1e3", "Age must be a number."],
    ["500", "Age must be between 18 and 110 years."],
    ["-3", "Age must be between 18 and 110 years."],
    ["", "Age is required."],
    ["   ", "Age is required."],
  ])("rejects numeric input %j", (raw, message) => {
    expect(validateField(feature("Age"), raw)).toEqual({ error: message });
  });

  it("accepts decimals and keeps the value unchanged", () => {
    expect(validateField(feature("Weight"), " 74.5 ")).toEqual({ value: 74.5 });
  });

  it("rejects categories that are not listed", () => {
    expect(validateField(feature("Sex"), "Other")).toHaveProperty("error");
    expect(validateField(feature("DM"), "2")).toHaveProperty("error");
    expect(validateField(feature("DM"), "1")).toEqual({ value: 1 });
    expect(validateField(feature("BBB"), "LBBB")).toEqual({ value: "LBBB" });
  });

  it("previews BMI from weight and height", () => {
    expect(previewBmi({ Weight: "81", Length: "180" })).toBeCloseTo(25, 6);
    expect(previewBmi({ Weight: "", Length: "180" })).toBeNull();
    expect(previewBmi({ Weight: "81", Length: "0" })).toBeNull();
  });

  it("flags values outside the training range without rejecting them", () => {
    expect(outsideTrainingRange(feature("Age"), "95")).toBe(true);
    expect(outsideTrainingRange(feature("Age"), "58")).toBe(false);
    expect(validateField(feature("Age"), "95")).toEqual({ value: 95 });
  });
});

describe("risk categories", () => {
  it("maps probabilities onto the configured bands", () => {
    const keys = [0, 0.249, 0.25, 0.499, 0.5, 0.749, 0.75, 1].map(
      (p) => categoryFor(p, FALLBACK_RISK_CATEGORIES).key,
    );
    expect(keys).toEqual(["low", "low", "moderate", "moderate", "high", "high", "very_high", "very_high"]);
  });

  it("follows reconfigured thresholds", () => {
    const custom = [
      { key: "low" as const, label: "Low", min: 0, max: 0.1 },
      { key: "moderate" as const, label: "Moderate", min: 0.1, max: 0.2 },
      { key: "high" as const, label: "High", min: 0.2, max: 0.3 },
      { key: "very_high" as const, label: "Very high", min: 0.3, max: 1 },
    ];
    expect(categoryFor(0.25, custom).key).toBe("high");
    expect(categoryFor(0.25, FALLBACK_RISK_CATEGORIES).key).toBe("moderate");
  });
});
