/**
 * Test fixtures. These are hand-written stand-ins shaped like API responses.
 * The numbers are arbitrary test values, not model results or patient data.
 */
import type { Api } from "@/lib/api";
import type { FeatureDescription, FeatureSchema, PatientFeatures } from "@/types/patient";
import type {
  ExplanationResponse,
  ModelInfo,
  ModelMetadata,
  PredictionResponse,
  RiskCategoryKey,
  TargetExplanation,
  TargetName,
  TargetPrediction,
} from "@/types/prediction";

function numeric(
  name: string,
  label: string,
  group: string,
  unit: string,
  limits: [number, number],
  observed: [number, number],
  typical: number,
): FeatureDescription {
  return {
    name,
    label,
    group,
    kind: "numeric",
    unit,
    categories: [],
    input_limits: limits,
    derived: false,
    derived_from: [],
    integer_valued: true,
    observed: { n_missing: 0, n_unique: 40, min: observed[0], max: observed[1], median: typical },
    typical_value: typical,
  };
}

function binary(name: string, label: string, group: string, typical: 0 | 1): FeatureDescription {
  return {
    name,
    label,
    group,
    kind: "binary",
    unit: null,
    categories: [0, 1],
    input_limits: null,
    derived: false,
    derived_from: [],
    integer_valued: false,
    observed: { n_missing: 0, n_unique: 2, counts: { "0": 100, "1": 50 } },
    typical_value: typical,
  };
}

export const schemaFixture: FeatureSchema = {
  groups: [
    { key: "demographic", title: "Demographic" },
    { key: "history", title: "History and risk factors" },
    { key: "ecg", title: "ECG" },
  ],
  features: [
    numeric("Age", "Age", "demographic", "years", [18, 110], [30, 86], 58),
    numeric("Weight", "Weight", "demographic", "kg", [30, 250], [48, 120], 74),
    numeric("Length", "Height", "demographic", "cm", [120, 220], [140, 188], 165),
    {
      name: "Sex",
      label: "Sex",
      group: "demographic",
      kind: "categorical",
      unit: null,
      categories: ["Male", "Female"],
      input_limits: null,
      derived: false,
      derived_from: [],
      integer_valued: false,
      observed: { n_missing: 0, n_unique: 2, counts: { Male: 90, Female: 60 } },
      typical_value: "Male",
    },
    {
      ...numeric("BMI", "Body mass index", "demographic", "kg/m²", [10, 70], [18, 41], 27),
      derived: true,
      derived_from: ["Weight", "Length"],
    },
    binary("DM", "Diabetes mellitus", "history", 0),
    binary("HTN", "Hypertension", "history", 1),
    binary("St Elevation", "ST elevation", "ecg", 0),
    {
      name: "BBB",
      label: "Bundle branch block",
      group: "ecg",
      kind: "categorical",
      unit: null,
      categories: ["N", "LBBB", "RBBB"],
      input_limits: null,
      derived: false,
      derived_from: [],
      integer_valued: false,
      observed: { n_missing: 0, n_unique: 3, counts: { N: 140, LBBB: 6, RBBB: 4 } },
      typical_value: "N",
    },
  ],
  excluded_features: [],
  targets: [],
  observed_on: "development set",
};

export const validFeatures: PatientFeatures = {
  Age: 58,
  Weight: 74,
  Length: 165,
  Sex: "Male",
  DM: 0,
  HTN: 1,
  "St Elevation": 0,
  BBB: "N",
};

const LABELS: Record<TargetName, string> = {
  CAD: "Coronary artery disease",
  LAD: "Left anterior descending artery stenosis",
  LCX: "Left circumflex artery stenosis",
  RCA: "Right coronary artery stenosis",
};

function categoryOf(probability: number): RiskCategoryKey {
  if (probability < 0.25) return "low";
  if (probability < 0.5) return "moderate";
  if (probability < 0.75) return "high";
  return "very_high";
}

const CATEGORY_LABELS: Record<RiskCategoryKey, string> = {
  low: "Low",
  moderate: "Moderate",
  high: "High",
  very_high: "Very high",
};

export function targetPrediction(target: TargetName, probability: number, threshold = 0.5): TargetPrediction {
  const positive = probability >= threshold;
  const subject = target === "CAD" ? "CAD" : `${target} stenosis`;
  return {
    target,
    label: LABELS[target],
    probability,
    predicted_class: positive ? 1 : 0,
    predicted_label: positive ? `Model predicts ${subject}` : `Model predicts no ${subject}`,
    decision_threshold: threshold,
    risk_category: categoryOf(probability),
    risk_category_label: CATEGORY_LABELS[categoryOf(probability)],
    calibration: "none",
  };
}

export function predictionFixture(
  probabilities: Record<TargetName, number> = { CAD: 0.81, LAD: 0.84, LCX: 0.41, RCA: 0.12 },
): PredictionResponse {
  return {
    model_version: "0.1.0",
    timestamp: "2026-01-01T00:00:00Z",
    cad: targetPrediction("CAD", probabilities.CAD),
    vessels: {
      LAD: targetPrediction("LAD", probabilities.LAD),
      LCX: targetPrediction("LCX", probabilities.LCX, 0.38),
      RCA: targetPrediction("RCA", probabilities.RCA),
    },
    derived_features: { BMI: 27.2, Obesity: 1 },
    warnings: [],
    disclaimer: "",
  };
}

function explanation(target: TargetName): TargetExplanation {
  return {
    target,
    output_space: target === "CAD" || target === "RCA" ? "log_odds" : "probability",
    output_space_description: "Contributions are in units of the model's raw score.",
    base_value: 0.2,
    raw_score: 0.9,
    n_features: 3,
    contributions: [
      {
        feature: "Age",
        label: "Age",
        group: "demographic",
        unit: "years",
        value: 58,
        shap_value: 0.4,
        direction: "increases",
        description: `Age contributes toward a higher predicted ${target} risk.`,
      },
      {
        feature: "St Elevation",
        label: "ST elevation",
        group: "ecg",
        unit: null,
        value: 0,
        shap_value: -0.2,
        direction: "decreases",
        description: `ST elevation contributes toward a lower predicted ${target} risk.`,
      },
      {
        feature: "HTN",
        label: "Hypertension",
        group: "history",
        unit: null,
        value: 1,
        shap_value: 0.1,
        direction: "increases",
        description: `Hypertension contributes toward a higher predicted ${target} risk.`,
      },
    ],
  };
}

export const explanationFixture: ExplanationResponse = {
  model_version: "0.1.0",
  timestamp: "2026-01-01T00:00:00Z",
  explanations: { CAD: explanation("CAD"), LAD: explanation("LAD"), LCX: explanation("LCX"), RCA: explanation("RCA") },
  note: "Feature contributions show how this model used the input values. They are not causal.",
  disclaimer: "",
};

function metadata(target: TargetName, auc: number): ModelMetadata {
  const summary = (mean: number) => ({ mean, std: 0.05 });
  const metrics = {
    accuracy: 0.8,
    balanced_accuracy: 0.78,
    precision: 0.82,
    recall: 0.85,
    specificity: 0.7,
    f1: 0.83,
    roc_auc: auc,
    brier: 0.15,
    log_loss: 0.45,
    confusion_matrix: { tn: 14, fp: 6, fn: 5, tp: 36 },
    threshold: 0.5,
    n: 61,
  };
  return {
    target,
    label: LABELS[target],
    algorithm: "logistic_regression",
    candidate: "logistic_regression[C=0.1|weights=none]",
    trained_at: "2026-01-01T00:00:00+00:00",
    decision_threshold: 0.5,
    selection_reason: "Selected by the documented cross-validation rule.",
    calibration: {
      method: "none",
      reason: "No calibration adopted.",
      threshold_reason: "Kept the 0.5 threshold.",
      reliability_curve: { mean_predicted: [0.2, 0.5, 0.8], observed_rate: [0.25, 0.45, 0.85] },
    },
    training: {
      n_development: 242,
      n_holdout: 61,
      development_class_counts: { positive: 150, negative: 92 },
      holdout_class_counts: { positive: 41, negative: 20 },
      cross_validation: { n_splits: 5, n_repeats: 5 },
    },
    cross_validation: Object.fromEntries(
      ["accuracy", "precision", "recall", "f1", "roc_auc", "brier"].map((key) => [key, summary(0.8)]),
    ),
    final_configuration_cross_validation: Object.fromEntries(
      ["accuracy", "precision", "recall", "f1", "roc_auc", "brier"].map((key) => [key, summary(0.8)]),
    ),
    holdout: {
      n: 61,
      class_counts: { positive: 41, negative: 20 },
      metrics,
      confidence_intervals_95: Object.fromEntries(
        ["accuracy", "precision", "recall", "f1", "roc_auc", "brier"].map((key) => [
          key,
          { lower: 0.7, upper: 0.9 },
        ]),
      ),
      bootstrap_resamples: 2000,
      reference_baseline: { predicted_probability: 0.62, accuracy: 0.67, brier: 0.22, roc_auc: 0.5 },
      roc_curve: { false_positive_rate: [0, 0.2, 1], true_positive_rate: [0, 0.8, 1] },
      reliability_curve: { mean_predicted: [0.2, 0.5, 0.8], observed_rate: [0.3, 0.5, 0.8] },
    },
    global_importance: {
      output_space: "log_odds",
      n_rows: 242,
      computed_on: "development set",
      features: [
        { feature: "Age", label: "Age", group: "demographic", mean_abs_shap: 0.5, mean_shap: 0.1 },
        { feature: "HTN", label: "Hypertension", group: "history", mean_abs_shap: 0.2, mean_shap: 0.0 },
      ],
    },
    explanation_output_space: "log_odds",
  };
}

export const modelInfoFixture: ModelInfo = {
  model_version: "0.1.0",
  models_available: { CAD: true, LAD: true, LCX: true, RCA: true },
  targets: {
    CAD: metadata("CAD", 0.9),
    LAD: metadata("LAD", 0.83),
    LCX: metadata("LCX", 0.76),
    RCA: metadata("RCA", 0.67),
  },
  class_distribution: {
    CAD: { n_positive: 216, n_negative: 87, n_total: 303, positive_rate: 0.713, positive_label: "CAD", negative_label: "Normal" },
    LAD: { n_positive: 177, n_negative: 126, n_total: 303, positive_rate: 0.584, positive_label: "Stenotic", negative_label: "Normal" },
    LCX: { n_positive: 119, n_negative: 184, n_total: 303, positive_rate: 0.393, positive_label: "Stenotic", negative_label: "Normal" },
    RCA: { n_positive: 114, n_negative: 189, n_total: 303, positive_rate: 0.376, positive_label: "Stenotic", negative_label: "Normal" },
  },
  risk_categories: [
    { key: "low", label: "Low", min: 0, max: 0.25 },
    { key: "moderate", label: "Moderate", min: 0.25, max: 0.5 },
    { key: "high", label: "High", min: 0.5, max: 0.75 },
    { key: "very_high", label: "Very high", min: 0.75, max: 1 },
  ],
  risk_category_note: "Risk categories are visualization bands for this prototype. They are not clinically validated risk thresholds.",
  disclaimer: "",
};

/** A fake API client whose calls can be inspected and overridden per test. */
export function createApiMock(overrides: Partial<Api> = {}): Api {
  return {
    health: vi.fn(async () => ({
      status: "ok" as const,
      models: { CAD: true, LAD: true, LCX: true, RCA: true },
      model_version: "0.1.0",
    })),
    featureSchema: vi.fn(async () => schemaFixture),
    modelInfo: vi.fn(async () => modelInfoFixture),
    predict: vi.fn(async () => predictionFixture()),
    explain: vi.fn(async () => explanationFixture),
    ...overrides,
  };
}
