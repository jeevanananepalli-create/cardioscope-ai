import type {
  FeatureDescription,
  FeatureSchema,
  FeatureValue,
  FieldErrors,
  FormValues,
  PatientFeatures,
} from "@/types/patient";

/** Features the user enters (derived features are computed, never typed). */
export function inputFeatures(schema: FeatureSchema): FeatureDescription[] {
  return schema.features.filter((feature) => !feature.derived);
}

export function emptyFormValues(schema: FeatureSchema): FormValues {
  return Object.fromEntries(inputFeatures(schema).map((feature) => [feature.name, ""]));
}

/** Form values filled with each feature's typical value in the training data. */
export function typicalFormValues(schema: FeatureSchema): FormValues {
  return Object.fromEntries(
    inputFeatures(schema).map((feature) => [
      feature.name,
      feature.typical_value === null ? "" : String(feature.typical_value),
    ]),
  );
}

export function toFormValues(features: PatientFeatures): FormValues {
  return Object.fromEntries(Object.entries(features).map(([name, value]) => [name, String(value)]));
}

const NUMBER_PATTERN = /^[+-]?(\d+\.?\d*|\.\d+)$/;

function formatLimit(value: number): string {
  return String(value);
}

/**
 * Validate one field. Returns the typed value, or an error message.
 * Nothing is corrected silently: an out-of-range or malformed entry is an error.
 */
export function validateField(
  feature: FeatureDescription,
  raw: string | undefined,
): { value: FeatureValue } | { error: string } {
  const text = (raw ?? "").trim();
  if (text === "") return { error: `${feature.label} is required.` };

  if (feature.kind === "numeric") {
    if (!NUMBER_PATTERN.test(text)) return { error: `${feature.label} must be a number.` };
    const value = Number(text);
    if (!Number.isFinite(value)) return { error: `${feature.label} must be a number.` };
    if (feature.input_limits) {
      const [low, high] = feature.input_limits;
      if (value < low || value > high) {
        const unit = feature.unit ? ` ${feature.unit}` : "";
        return {
          error: `${feature.label} must be between ${formatLimit(low)} and ${formatLimit(high)}${unit}.`,
        };
      }
    }
    return { value };
  }

  const match = feature.categories.find((category) => String(category) === text);
  if (match === undefined) return { error: `Choose one of the listed options for ${feature.label}.` };
  return { value: match };
}

export interface ValidationResult {
  errors: FieldErrors;
  features: PatientFeatures | null;
}

export function validatePatient(schema: FeatureSchema, values: FormValues): ValidationResult {
  const errors: FieldErrors = {};
  const features: PatientFeatures = {};
  for (const feature of inputFeatures(schema)) {
    const result = validateField(feature, values[feature.name]);
    if ("error" in result) errors[feature.name] = result.error;
    else features[feature.name] = result.value;
  }
  return Object.keys(errors).length > 0 ? { errors, features: null } : { errors, features };
}

/**
 * BMI as the API will derive it, for display while typing. The API's value is
 * authoritative; this only mirrors its formula (weight / height^2).
 */
export function previewBmi(values: FormValues): number | null {
  const weight = Number(values.Weight);
  const heightCm = Number(values.Length);
  if (!values.Weight || !values.Length || !(weight > 0) || !(heightCm > 0)) return null;
  return weight / (heightCm / 100) ** 2;
}

/** Numeric inputs outside the range seen in training (the model would extrapolate). */
export function outsideTrainingRange(feature: FeatureDescription, raw: string | undefined): boolean {
  if (feature.kind !== "numeric" || !feature.observed || !raw) return false;
  const value = Number(raw);
  const { min, max } = feature.observed;
  if (!Number.isFinite(value) || min === undefined || max === undefined) return false;
  return value < min || value > max;
}
