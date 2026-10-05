import { RiskGauge } from "@/components/dashboard/RiskGauge";
import { categoryFor, formatPercent, RISK_COLORS } from "@/lib/constants";
import type { ModelMetadata, RiskCategory, TargetPrediction } from "@/types/prediction";

interface RiskOverviewProps {
  prediction: TargetPrediction;
  categories: RiskCategory[];
  metadata?: ModelMetadata;
  stale?: boolean;
}

export function holdoutSummary(metadata?: ModelMetadata): string | null {
  const holdout = metadata?.holdout;
  if (!holdout) return null;
  const interval = holdout.confidence_intervals_95.roc_auc;
  const range = interval ? ` (95% interval ${interval.lower.toFixed(2)}–${interval.upper.toFixed(2)})` : "";
  return `Holdout ROC-AUC ${holdout.metrics.roc_auc.toFixed(2)}${range}, n = ${holdout.n}`;
}

/** Overall CAD model output. Worded as a model prediction, never a diagnosis. */
export function RiskOverview({ prediction, categories, metadata, stale = false }: RiskOverviewProps) {
  const category = categoryFor(prediction.probability, categories);
  const evidence = holdoutSummary(metadata);
  return (
    <div className="overview" data-stale={stale ? "true" : undefined}>
      <RiskGauge probability={prediction.probability} categories={categories} label="Predicted CAD probability" />
      <div className="overview__value num" data-testid="cad-probability">
        {formatPercent(prediction.probability)}
      </div>
      <div className="overview__caption">Predicted probability of coronary artery disease</div>
      <div className="overview__row">
        <span className="chip" style={{ borderColor: RISK_COLORS[category.key], color: RISK_COLORS[category.key] }}>
          <span className="chip__dot" style={{ background: RISK_COLORS[category.key] }} aria-hidden="true" />
          {category.label} visualization category
        </span>
      </div>
      <dl className="facts">
        <div>
          <dt>Model prediction</dt>
          <dd>{prediction.predicted_label}</dd>
        </div>
        <div>
          <dt>Decision threshold</dt>
          <dd className="num">{formatPercent(prediction.decision_threshold)}</dd>
        </div>
        {evidence ? (
          <div>
            <dt>Model evidence</dt>
            <dd className="num">{evidence}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
