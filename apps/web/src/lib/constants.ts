import type { RiskCategory, RiskCategoryKey, TargetName } from "@/types/prediction";

export const PRODUCT_NAME = "CardioScope AI";
export const TAGLINE = "From clinical numbers to anatomical insight.";

/** Spec section 18. Shown at all times; must not be reworded. */
export const SAFETY_DISCLAIMER =
  "This prototype is intended for research, education, and decision-support demonstration only. " +
  "It is not a medical device and does not replace professional clinical evaluation, " +
  "diagnostic imaging, or physician judgment.";

export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1"
).replace(/\/+$/, "");

export const API_TIMEOUT_MS = 15000;

/**
 * Visualization bands used only until the API's own configuration has loaded
 * (GET /model-info is the source of truth). These are display categories for
 * the prototype, not clinically validated risk thresholds.
 */
export const FALLBACK_RISK_CATEGORIES: RiskCategory[] = [
  { key: "low", label: "Low", min: 0, max: 0.25 },
  { key: "moderate", label: "Moderate", min: 0.25, max: 0.5 },
  { key: "high", label: "High", min: 0.5, max: 0.75 },
  { key: "very_high", label: "Very high", min: 0.75, max: 1 },
];

/** One colour per visualization band, used by cards, charts and the 3D vessels. */
export const RISK_COLORS: Record<RiskCategoryKey, string> = {
  low: "#2f9e6e",
  moderate: "#d9a514",
  high: "#e0752d",
  very_high: "#cf3f3f",
};

export const NO_PREDICTION_COLOR = "#8793a1";

export const TARGET_NAMES: Record<TargetName, string> = {
  CAD: "Coronary artery disease",
  LAD: "Left anterior descending artery",
  LCX: "Left circumflex artery",
  RCA: "Right coronary artery",
};

/** Category for a probability, from the configured bands. */
export function categoryFor(probability: number, categories: RiskCategory[]): RiskCategory {
  const sorted = [...categories].sort((a, b) => a.min - b.min);
  const match = sorted.find((category) => probability < category.max);
  return match ?? sorted[sorted.length - 1]!;
}

/**
 * A probability as a percentage. A model never justifies a flat 0% or 100%, so values that
 * would round to those are shown as below 1% or above 99%.
 */
export function formatPercent(probability: number, digits = 0): string {
  const text = (probability * 100).toFixed(digits);
  if (Number(text) >= 100 && probability < 1) return ">99%";
  if (Number(text) <= 0 && probability > 0) return "<1%";
  return `${text}%`;
}
