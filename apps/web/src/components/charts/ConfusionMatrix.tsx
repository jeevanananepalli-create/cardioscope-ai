import type { ClassDistributionEntry, ConfusionMatrix as Matrix, TargetName } from "@/types/prediction";

import { TARGET_COLORS } from "./RocChart";

interface ConfusionMatrixProps {
  target: TargetName;
  matrix: Matrix;
  threshold: number;
}

/** Holdout confusion matrix: rows are the recorded outcome, columns the model prediction. */
export function ConfusionMatrix({ target, matrix, threshold }: ConfusionMatrixProps) {
  const total = matrix.tn + matrix.fp + matrix.fn + matrix.tp;
  const cells: { key: keyof Matrix; label: string; correct: boolean }[] = [
    { key: "tn", label: "True negative", correct: true },
    { key: "fp", label: "False positive", correct: false },
    { key: "fn", label: "False negative", correct: false },
    { key: "tp", label: "True positive", correct: true },
  ];
  return (
    <table className="confusion" aria-label={`Confusion matrix for the ${target} model on the holdout set`}>
      <caption className="small muted">
        Holdout set, n = {total}, decision threshold {(threshold * 100).toFixed(0)}%
      </caption>
      <thead>
        <tr>
          <td />
          <th scope="col">Predicted negative</th>
          <th scope="col">Predicted positive</th>
        </tr>
      </thead>
      <tbody>
        {[0, 1].map((row) => (
          <tr key={row}>
            <th scope="row">{row === 0 ? "Recorded negative" : "Recorded positive"}</th>
            {cells.slice(row * 2, row * 2 + 2).map((cell) => (
              <td
                key={cell.key}
                className="confusion__cell num"
                data-correct={cell.correct ? "true" : "false"}
                data-testid={`confusion-${target}-${cell.key}`}
                style={{ background: `rgba(31, 78, 121, ${(0.08 + 0.5 * (matrix[cell.key] / Math.max(total, 1))).toFixed(3)})` }}
              >
                <span className="confusion__count">{matrix[cell.key]}</span>
                <span className="confusion__label">{cell.label}</span>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

interface ClassDistributionProps {
  distribution: Partial<Record<TargetName, ClassDistributionEntry>>;
}

/** Positive and negative record counts per target in the full dataset. */
export function ClassDistribution({ distribution }: ClassDistributionProps) {
  const targets = Object.keys(distribution) as TargetName[];
  return (
    <ul className="distribution" aria-label="Class distribution in the full dataset">
      {targets.map((target) => {
        const entry = distribution[target]!;
        const share = entry.n_total > 0 ? (entry.n_positive / entry.n_total) * 100 : 0;
        return (
          <li key={target}>
            <span className="distribution__name">{target}</span>
            <span
              className="distribution__bar"
              role="img"
              aria-label={`${target}: ${entry.n_positive} ${entry.positive_label}, ${entry.n_negative} ${entry.negative_label}`}
            >
              <span style={{ width: `${share}%`, background: TARGET_COLORS[target] }} />
            </span>
            <span className="small num">
              {entry.n_positive} {entry.positive_label.toLowerCase()} · {entry.n_negative}{" "}
              {entry.negative_label.toLowerCase()} <span className="muted">({share.toFixed(1)}% positive)</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
