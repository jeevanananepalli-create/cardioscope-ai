import { categoryFor, formatPercent, RISK_COLORS, TARGET_NAMES } from "@/lib/constants";
import {
  type ModelMetadata,
  type RiskCategory,
  type TargetPrediction,
  type VesselName,
  VESSELS,
} from "@/types/prediction";

interface VesselRiskCardsProps {
  vessels: Record<VesselName, TargetPrediction>;
  categories: RiskCategory[];
  metadata?: Partial<Record<VesselName, ModelMetadata>>;
  selected?: VesselName | null;
  onSelect?: (vessel: VesselName) => void;
}

/** One card per coronary vessel with the model's predicted stenosis probability. */
export function VesselRiskCards({ vessels, categories, metadata, selected = null, onSelect }: VesselRiskCardsProps) {
  return (
    <ul className="vessel-cards" aria-label="Vessel stenosis predictions">
      {VESSELS.map((name) => {
        const prediction = vessels[name];
        const category = categoryFor(prediction.probability, categories);
        const color = RISK_COLORS[category.key];
        const holdout = metadata?.[name]?.holdout;
        const body = (
          <>
            <div className="vessel-card__head">
              <span className="vessel-card__name">{name}</span>
              <span className="vessel-card__value num" data-testid={`${name}-probability`}>
                {formatPercent(prediction.probability)}
              </span>
            </div>
            <div className="vessel-card__full">{TARGET_NAMES[name]}</div>
            <div
              className="meter"
              role="img"
              aria-label={`${name} predicted stenosis probability ${formatPercent(prediction.probability)}`}
            >
              <div className="meter__fill" style={{ width: `${prediction.probability * 100}%`, background: color }} />
              <div
                className="meter__mark"
                style={{ left: `${prediction.decision_threshold * 100}%` }}
                title={`Decision threshold ${formatPercent(prediction.decision_threshold)}`}
              />
            </div>
            <div className="vessel-card__foot">
              <span className="chip chip--small" style={{ borderColor: color }}>
                <span className="chip__dot" style={{ background: color }} aria-hidden="true" />
                {category.label}
              </span>
              <span className="small">{prediction.predicted_label}</span>
            </div>
            {holdout ? (
              <div className="vessel-card__evidence small muted num">
                Holdout ROC-AUC {holdout.metrics.roc_auc.toFixed(2)}
                {holdout.confidence_intervals_95.roc_auc
                  ? ` (${holdout.confidence_intervals_95.roc_auc.lower.toFixed(2)}–${holdout.confidence_intervals_95.roc_auc.upper.toFixed(2)})`
                  : ""}
              </div>
            ) : null}
          </>
        );
        return (
          <li key={name}>
            {onSelect ? (
              <button
                type="button"
                className="vessel-card"
                aria-pressed={selected === name}
                onClick={() => onSelect(name)}
              >
                {body}
              </button>
            ) : (
              <div className="vessel-card">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
