import type { FeatureSchema } from "@/types/patient";
import type { FeatureContribution as Contribution } from "@/types/prediction";

export const INCREASE_COLOR = "#c0504a";
export const DECREASE_COLOR = "#3f72b3";

/** The patient's value as shown to the user; yes/no inputs read "Yes"/"No" when the schema is known. */
export function formatValue(contribution: Contribution, schema?: FeatureSchema | null): string {
  const { value, unit } = contribution;
  if (value === null) return "—";
  const kind = schema?.features.find((feature) => feature.name === contribution.feature)?.kind;
  if (kind === "binary") return String(value) === "1" ? "Yes" : "No";
  if (typeof value === "number") {
    const text = Number.isInteger(value) ? String(value) : value.toFixed(1);
    return unit ? `${text} ${unit}` : text;
  }
  return value === "N" ? "None" : value;
}

export function formatShap(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(3)}`;
}

interface FeatureContributionProps {
  contribution: Contribution;
  /** Largest absolute contribution in the chart, which sets the bar scale. */
  scale: number;
  schema?: FeatureSchema | null;
}

/** One row of the contribution chart: a bar to the right (raises) or left (lowers). */
export function FeatureContribution({ contribution, scale, schema }: FeatureContributionProps) {
  const fraction = scale > 0 ? Math.min(1, Math.abs(contribution.shap_value) / scale) : 0;
  const positive = contribution.shap_value > 0;
  const width = `${(fraction * 50).toFixed(2)}%`;
  return (
    <li className="contribution" title={contribution.description}>
      <span className="contribution__label">
        {contribution.label}
        <span className="contribution__value num"> = {formatValue(contribution, schema)}</span>
      </span>
      <span className="contribution__track" aria-hidden="true">
        <span className="contribution__axis" />
        <span
          className="contribution__bar"
          style={{
            width,
            background: positive ? INCREASE_COLOR : DECREASE_COLOR,
            left: positive ? "50%" : undefined,
            right: positive ? undefined : "50%",
          }}
        />
      </span>
      <span className="contribution__number num" style={{ color: positive ? INCREASE_COLOR : DECREASE_COLOR }}>
        {formatShap(contribution.shap_value)}
      </span>
      <span className="visually-hidden">{contribution.description}</span>
    </li>
  );
}
