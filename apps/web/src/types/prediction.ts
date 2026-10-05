/** Mirrors the API response schemas (apps/api/app/schemas). */

export type TargetName = "CAD" | "LAD" | "LCX" | "RCA";
export type VesselName = "LAD" | "LCX" | "RCA";
export type RiskCategoryKey = "low" | "moderate" | "high" | "very_high";

export const TARGETS: TargetName[] = ["CAD", "LAD", "LCX", "RCA"];
export const VESSELS: VesselName[] = ["LAD", "LCX", "RCA"];

export interface TargetPrediction {
  target: TargetName;
  label: string;
  probability: number;
  predicted_class: 0 | 1;
  predicted_label: string;
  decision_threshold: number;
  risk_category: RiskCategoryKey;
  risk_category_label: string;
  calibration: string;
}

export interface InputWarning {
  field: string;
  message: string;
}

export interface PredictionResponse {
  model_version: string;
  timestamp: string;
  cad: TargetPrediction;
  vessels: Record<VesselName, TargetPrediction>;
  derived_features: Record<string, number>;
  warnings: InputWarning[];
  disclaimer: string;
}

export interface RiskCategory {
  key: RiskCategoryKey;
  label: string;
  min: number;
  max: number;
}

export interface FeatureContribution {
  feature: string;
  label: string;
  group: string;
  unit: string | null;
  value: number | string | null;
  shap_value: number;
  direction: "increases" | "decreases" | "neutral";
  description: string;
}

export interface TargetExplanation {
  target: TargetName;
  output_space: "log_odds" | "probability";
  output_space_description: string;
  base_value: number;
  raw_score: number;
  n_features: number;
  contributions: FeatureContribution[];
}

export interface ExplanationResponse {
  model_version: string;
  timestamp: string;
  explanations: Partial<Record<TargetName, TargetExplanation>>;
  note: string;
  disclaimer: string;
}

export interface MetricSummary {
  mean: number;
  std: number;
}

export interface ConfusionMatrix {
  tn: number;
  fp: number;
  fn: number;
  tp: number;
}

export interface MetricSet {
  accuracy: number;
  balanced_accuracy: number;
  precision: number;
  recall: number;
  specificity: number;
  f1: number;
  roc_auc: number;
  brier: number;
  log_loss: number;
  confusion_matrix: ConfusionMatrix;
  threshold: number;
  n: number;
}

export interface ReliabilityCurve {
  mean_predicted: number[];
  observed_rate: number[];
}

export interface HoldoutEvaluation {
  n: number;
  class_counts: { positive: number; negative: number };
  metrics: MetricSet;
  confidence_intervals_95: Record<string, { lower: number; upper: number }>;
  bootstrap_resamples: number;
  reference_baseline: { predicted_probability: number; accuracy: number; brier: number; roc_auc: number };
  roc_curve: { false_positive_rate: number[]; true_positive_rate: number[] };
  reliability_curve: ReliabilityCurve;
}

export interface GlobalImportance {
  output_space: "log_odds" | "probability";
  n_rows: number;
  computed_on: string;
  features: { feature: string; label: string; group: string; mean_abs_shap: number; mean_shap: number }[];
}

export interface ModelMetadata {
  target: TargetName;
  label: string;
  algorithm: string;
  candidate: string;
  trained_at: string;
  decision_threshold: number;
  selection_reason: string;
  calibration: {
    method: string;
    reason: string;
    threshold_reason: string | null;
    reliability_curve: ReliabilityCurve | null;
  };
  training: {
    n_development: number;
    n_holdout: number;
    development_class_counts: { positive: number; negative: number };
    holdout_class_counts: { positive: number; negative: number };
    cross_validation: { n_splits: number; n_repeats: number };
  };
  cross_validation: Record<string, MetricSummary>;
  final_configuration_cross_validation: Record<string, MetricSummary> | null;
  holdout: HoldoutEvaluation | null;
  global_importance: GlobalImportance | null;
  explanation_output_space: "log_odds" | "probability" | null;
}

export interface ClassDistributionEntry {
  n_positive: number;
  n_negative: number;
  n_total: number;
  positive_rate: number;
  positive_label: string;
  negative_label: string;
}

export interface ModelInfo {
  model_version: string | null;
  models_available: Record<TargetName, boolean>;
  targets: Partial<Record<TargetName, ModelMetadata>>;
  class_distribution: Partial<Record<TargetName, ClassDistributionEntry>> | null;
  risk_categories: RiskCategory[];
  risk_category_note: string;
  disclaimer: string;
}

export interface HealthResponse {
  status: "ok" | "degraded";
  models: Record<TargetName, boolean>;
  model_version: string | null;
}
