import { categoryFor, formatPercent, RISK_COLORS } from "@/lib/constants";
import {
  type PredictionResponse,
  type RiskCategory,
  type TargetName,
  type TargetPrediction,
  TARGETS,
} from "@/types/prediction";

interface PredictionComparisonProps {
  before: PredictionResponse;
  /** Null until an input has been changed. */
  after: PredictionResponse | null;
  categories: RiskCategory[];
  pending: boolean;
}

function output(prediction: PredictionResponse, target: TargetName): TargetPrediction {
  return target === "CAD" ? prediction.cad : prediction.vessels[target];
}

function formatChange(points: number): string {
  if (Math.abs(points) < 0.05) return "no change";
  return `${points > 0 ? "+" : "−"}${Math.abs(points).toFixed(1)} pts`;
}

/** Before / after model outputs for all four targets. */
export function PredictionComparison({ before, after, categories, pending }: PredictionComparisonProps) {
  return (
    <table className="table comparison" aria-busy={pending} data-pending={pending ? "true" : undefined}>
      <caption className="visually-hidden">Model predictions before and after the simulated changes</caption>
      <thead>
        <tr>
          <th scope="col">Model</th>
          <th scope="col" className="num">
            Before
          </th>
          <th scope="col" className="num">
            After
          </th>
          <th scope="col" className="num">
            Change
          </th>
          <th scope="col">Model prediction after</th>
        </tr>
      </thead>
      <tbody>
        {TARGETS.map((target) => {
          const original = output(before, target);
          const simulated = after ? output(after, target) : null;
          const points = simulated ? (simulated.probability - original.probability) * 100 : 0;
          const category = categoryFor((simulated ?? original).probability, categories);
          return (
            <tr key={target} data-testid={`comparison-${target}`}>
              <th scope="row">{target}</th>
              <td className="num">{formatPercent(original.probability)}</td>
              <td className="num comparison__after">
                {simulated ? (
                  <>
                    <span className="chip__dot" style={{ background: RISK_COLORS[category.key] }} aria-hidden="true" />{" "}
                    {formatPercent(simulated.probability)}
                  </>
                ) : (
                  "—"
                )}
              </td>
              <td className="num" data-direction={points > 0.05 ? "up" : points < -0.05 ? "down" : undefined}>
                {simulated ? formatChange(points) : "—"}
              </td>
              <td>
                {simulated
                  ? simulated.predicted_class === original.predicted_class
                    ? simulated.predicted_label
                    : `${simulated.predicted_label} (was: ${original.predicted_label.replace("Model predicts ", "")})`
                  : "—"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
