import type { HoldoutEvaluation, ReliabilityCurve, TargetName } from "@/types/prediction";

export const TARGET_COLORS: Record<TargetName, string> = {
  CAD: "#3f93dc",
  LAD: "#e2793f",
  LCX: "#2fb088",
  RCA: "#a184e6",
};

const SIZE = 240;
const PAD = { left: 38, right: 10, top: 10, bottom: 34 };
const INNER_W = SIZE - PAD.left - PAD.right;
const INNER_H = SIZE - PAD.top - PAD.bottom;
const TICKS = [0, 0.25, 0.5, 0.75, 1];

function x(value: number): number {
  return PAD.left + value * INNER_W;
}

function y(value: number): number {
  return PAD.top + (1 - value) * INNER_H;
}

function polyline(xs: number[], ys: number[]): string {
  return xs.map((value, index) => `${x(value).toFixed(1)},${y(ys[index] ?? 0).toFixed(1)}`).join(" ");
}

function Frame({ xLabel, yLabel }: { xLabel: string; yLabel: string }) {
  return (
    <g className="chart__frame">
      {TICKS.map((tick) => (
        <g key={tick}>
          <line x1={x(tick)} y1={y(0)} x2={x(tick)} y2={y(1)} className="chart__grid" />
          <line x1={x(0)} y1={y(tick)} x2={x(1)} y2={y(tick)} className="chart__grid" />
          <text x={x(tick)} y={y(0) + 12} textAnchor="middle" className="chart__tick">
            {tick}
          </text>
          <text x={x(0) - 5} y={y(tick) + 3} textAnchor="end" className="chart__tick">
            {tick}
          </text>
        </g>
      ))}
      <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} className="chart__reference" />
      <text x={x(0.5)} y={SIZE - 4} textAnchor="middle" className="chart__label">
        {xLabel}
      </text>
      <text transform={`translate(10 ${y(0.5)}) rotate(-90)`} textAnchor="middle" className="chart__label">
        {yLabel}
      </text>
    </g>
  );
}

interface RocChartProps {
  holdout: Partial<Record<TargetName, HoldoutEvaluation>>;
}

/** ROC curves of all models on the holdout set, from the evaluation pipeline's points. */
export function RocChart({ holdout }: RocChartProps) {
  const targets = (Object.keys(holdout) as TargetName[]).filter((target) => holdout[target]);
  const summary = targets
    .map((target) => `${target} AUC ${holdout[target]!.metrics.roc_auc.toFixed(2)}`)
    .join(", ");
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`ROC curves on the holdout set: ${summary}`}>
        <Frame xLabel="False positive rate" yLabel="True positive rate" />
        {targets.map((target) => {
          const curve = holdout[target]!.roc_curve;
          return (
            <polyline
              key={target}
              points={polyline(curve.false_positive_rate, curve.true_positive_rate)}
              fill="none"
              stroke={TARGET_COLORS[target]}
              strokeWidth={1.8}
              strokeLinejoin="round"
            />
          );
        })}
      </svg>
      <figcaption className="chart__legend small">
        {targets.map((target) => (
          <span key={target}>
            <span className="chart__swatch" style={{ background: TARGET_COLORS[target] }} aria-hidden="true" />
            {target} <span className="num muted">AUC {holdout[target]!.metrics.roc_auc.toFixed(2)}</span>
          </span>
        ))}
        <span className="muted">Dashed: no discrimination</span>
      </figcaption>
    </figure>
  );
}

interface ReliabilityChartProps {
  target: TargetName;
  crossValidated: ReliabilityCurve | null;
  holdout: ReliabilityCurve | null;
}

/** Predicted probability against observed rate: on the diagonal means well calibrated. */
export function ReliabilityChart({ target, crossValidated, holdout }: ReliabilityChartProps) {
  const color = TARGET_COLORS[target];
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`Calibration curve for the ${target} model`}>
        <Frame xLabel="Mean predicted probability" yLabel="Observed positive rate" />
        {crossValidated ? (
          <>
            <polyline
              points={polyline(crossValidated.mean_predicted, crossValidated.observed_rate)}
              fill="none"
              stroke={color}
              strokeWidth={1.8}
            />
            {crossValidated.mean_predicted.map((value, index) => (
              <circle key={index} cx={x(value)} cy={y(crossValidated.observed_rate[index] ?? 0)} r={2.4} fill={color} />
            ))}
          </>
        ) : null}
        {holdout
          ? holdout.mean_predicted.map((value, index) => (
              <rect
                key={index}
                x={x(value) - 3.5}
                y={y(holdout.observed_rate[index] ?? 0) - 3.5}
                width={7}
                height={7}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.3}
              />
            ))
          : null}
      </svg>
      <figcaption className="chart__legend small">
        <span>
          <span className="chart__swatch" style={{ background: color }} aria-hidden="true" />
          Cross-validation (pooled)
        </span>
        <span>
          <span className="chart__swatch chart__swatch--hollow" aria-hidden="true" />
          Holdout bins
        </span>
        <span className="muted">Dashed: perfect calibration</span>
      </figcaption>
    </figure>
  );
}
