/** Mirrors GET /api/v1/feature-schema. */

export type FeatureKind = "numeric" | "binary" | "ordinal" | "categorical";

export type FeatureValue = number | string;

export interface ObservedStatistics {
  n_missing: number;
  n_unique: number;
  min?: number;
  max?: number;
  median?: number;
  mean?: number;
  q1?: number;
  q3?: number;
  integer_valued?: boolean;
  counts?: Record<string, number>;
}

export interface FeatureDescription {
  name: string;
  label: string;
  group: string;
  kind: FeatureKind;
  unit: string | null;
  categories: FeatureValue[];
  input_limits: [number, number] | null;
  derived: boolean;
  derived_from: string[];
  integer_valued: boolean;
  observed: ObservedStatistics | null;
  typical_value: FeatureValue | null;
}

export interface FeatureGroup {
  key: string;
  title: string;
}

export interface FeatureSchema {
  groups: FeatureGroup[];
  features: FeatureDescription[];
  excluded_features: { name: string; label: string; reason: string }[];
  targets: { name: string; column: string; label: string }[];
  observed_on: string;
}

/** A synthetic input combination for demonstration. Never a real patient. */
export interface DemoProfile {
  id: string;
  name: string;
  summary: string;
  synthetic: true;
  features: PatientFeatures;
}

export interface DemoProfiles {
  note: string;
  profiles: DemoProfile[];
}

/** What the form holds: raw text for numbers, a chosen level otherwise, "" when empty. */
export type FormValues = Record<string, string>;

/** Validated values sent to the API, keyed by dataset column name. */
export type PatientFeatures = Record<string, FeatureValue>;

export type FieldErrors = Record<string, string>;
