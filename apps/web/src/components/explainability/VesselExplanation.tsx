import { EmptyState, Notice } from "@/components/common/Notice";
import { formatShap, formatValue } from "@/components/explainability/FeatureContribution";
import type { ExplanationState } from "@/hooks/useExplanation";
import { categoryFor, formatPercent, RISK_COLORS, TARGET_NAMES } from "@/lib/constants";
import type { FeatureSchema } from "@/types/patient";
import type {
  ModelMetadata,
  PredictionResponse,
  RiskCategory,
  VesselName,
} from "@/types/prediction";

interface VesselExplanationProps {
  vessel: VesselName | null;
  prediction: PredictionResponse | null;
  explanation: ExplanationState;
  categories: RiskCategory[];
  metadata?: ModelMetadata;
  onShowFullExplanation: () => void;
  schema?: FeatureSchema | null;
}

const TOP_CONTRIBUTORS = 4;

/** Details for the vessel selected in the 3D view: prediction, category and top contributors. */
export function VesselExplanation({
  vessel,
  prediction,
  explanation,
  categories,
  metadata,
  onShowFullExplanation,
  schema,
}: VesselExplanationProps) {
  if (!vessel) {
    return (
      <EmptyState title="No vessel selected">
        Select LAD, LCX or RCA in the 3D view to see that model’s prediction and what contributed to it.
      </EmptyState>
    );
  }
  if (!prediction) {
    return (
      <EmptyState title={`${vessel} · ${TARGET_NAMES[vessel]}`}>
        Analyze a patient to see the model’s prediction for this vessel.
      </EmptyState>
    );
  }

  const result = prediction.vessels[vessel];
  const category = categoryFor(result.probability, categories);
  const color = RISK_COLORS[category.key];
  const contributions = explanation.explanation?.explanations[vessel]?.contributions.slice(0, TOP_CONTRIBUTORS);
  const holdout = metadata?.holdout;

  return (
    <div className="vessel-detail" data-testid="vessel-detail">
      <div className="vessel-detail__head">
        <div>
          <div className="vessel-detail__name">{vessel}</div>
          <div className="small muted">{TARGET_NAMES[vessel]}</div>
        </div>
        <div className="vessel-detail__value num" style={{ color }}>
          {formatPercent(result.probability)}
        </div>
      </div>
      <dl className="facts">
        <div>
          <dt>Predicted stenosis probability</dt>
          <dd className="num">{formatPercent(result.probability, 1)}</dd>
        </div>
        <div>
          <dt>Model prediction</dt>
          <dd>{result.predicted_label}</dd>
        </div>
        <div>
          <dt>Visualization category</dt>
          <dd>
            <span className="chip chip--small" style={{ borderColor: color, color }}>
              <span className="chip__dot" style={{ background: color }} aria-hidden="true" />
              {category.label}
            </span>
          </dd>
        </div>
        {holdout ? (
          <div>
            <dt>Model evidence</dt>
            <dd className="num">
              Holdout ROC-AUC {holdout.metrics.roc_auc.toFixed(2)}
              {holdout.confidence_intervals_95.roc_auc
                ? ` (${holdout.confidence_intervals_95.roc_auc.lower.toFixed(2)}–${holdout.confidence_intervals_95.roc_auc.upper.toFixed(2)})`
                : ""}
            </dd>
          </div>
        ) : null}
      </dl>

      <h3 className="eyebrow vessel-detail__heading">Top contributors and their measurements</h3>
      {explanation.status === "error" ? (
        <Notice tone="error" title="The explanation could not be loaded.">
          The prediction above is unaffected.
        </Notice>
      ) : !contributions ? (
        <div className="skeleton" style={{ height: 96 }} aria-label="Computing the explanation" />
      ) : (
        <>
          <table className="table table--compact">
            <thead>
              <tr>
                <th scope="col">Feature</th>
                <th scope="col" className="num">
                  Patient value
                </th>
                <th scope="col" className="num">
                  Contribution
                </th>
              </tr>
            </thead>
            <tbody>
              {contributions.map((contribution) => (
                <tr key={contribution.feature}>
                  <th scope="row">{contribution.label}</th>
                  <td className="num">{formatValue(contribution, schema)}</td>
                  <td className="num" title={contribution.description}>
                    {formatShap(contribution.shap_value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="vessel-detail__sentences small">
            {contributions.slice(0, 2).map((contribution) => (
              <li key={contribution.feature}>{contribution.description}</li>
            ))}
          </ul>
        </>
      )}
      <p className="small muted">
        Contributions describe how the model used these inputs. They are not causal and do not indicate a
        lesion in this vessel.
      </p>
      <button className="button button--quiet" type="button" onClick={onShowFullExplanation}>
        See the full {vessel} explanation
      </button>
    </div>
  );
}
