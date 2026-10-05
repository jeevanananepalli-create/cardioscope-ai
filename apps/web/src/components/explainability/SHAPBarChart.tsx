import {
  DECREASE_COLOR,
  FeatureContribution,
  INCREASE_COLOR,
} from "@/components/explainability/FeatureContribution";
import type { FeatureSchema } from "@/types/patient";
import type { TargetExplanation } from "@/types/prediction";

interface SHAPBarChartProps {
  explanation: TargetExplanation;
  /** How many contributions to draw (largest first). */
  limit: number;
  schema?: FeatureSchema | null;
}

const UNITS = { log_odds: "log-odds", probability: "probability points" } as const;

/** Diverging bar chart of the largest SHAP contributions for one model's prediction. */
export function SHAPBarChart({ explanation, limit, schema }: SHAPBarChartProps) {
  const shown = explanation.contributions.slice(0, limit);
  const scale = Math.max(...shown.map((c) => Math.abs(c.shap_value)), 0);
  const rest = explanation.contributions.slice(limit);
  const restSum = rest.reduce((sum, c) => sum + c.shap_value, 0);
  return (
    <div className="shap">
      <div className="shap__legend small">
        <span>
          <span className="shap__swatch" style={{ background: DECREASE_COLOR }} aria-hidden="true" />
          Toward lower predicted risk
        </span>
        <span>
          <span className="shap__swatch" style={{ background: INCREASE_COLOR }} aria-hidden="true" />
          Toward higher predicted risk
        </span>
        <span className="muted">Units: {UNITS[explanation.output_space]} of the model’s raw score</span>
      </div>
      <ol className="shap__rows" aria-label={`Feature contributions to the ${explanation.target} model prediction`}>
        {shown.map((contribution) => (
          <FeatureContribution key={contribution.feature} contribution={contribution} scale={scale} schema={schema} />
        ))}
      </ol>
      {rest.length > 0 ? (
        <p className="small muted num">
          {rest.length} other features together contribute {restSum >= 0 ? "+" : "−"}
          {Math.abs(restSum).toFixed(3)}.
        </p>
      ) : null}
    </div>
  );
}
