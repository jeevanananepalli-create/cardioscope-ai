import { categoryFor, formatPercent, RISK_COLORS } from "@/lib/constants";
import type { RiskCategory } from "@/types/prediction";

interface RiskGaugeProps {
  probability: number;
  categories: RiskCategory[];
  label: string;
}

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Ring filled to the predicted probability, in the colour of its visualization band. */
export function RiskGauge({ probability, categories, label }: RiskGaugeProps) {
  const category = categoryFor(probability, categories);
  const filled = Math.min(Math.max(probability, 0), 1) * CIRCUMFERENCE;
  return (
    <svg
      className="gauge"
      viewBox="0 0 128 128"
      role="img"
      aria-label={`${label}: ${formatPercent(probability)}, ${category.label} visualization category`}
    >
      <circle className="gauge__track" cx={64} cy={64} r={RADIUS} fill="none" strokeWidth={9} />
      <circle
        cx={64}
        cy={64}
        r={RADIUS}
        fill="none"
        stroke={RISK_COLORS[category.key]}
        strokeWidth={9}
        strokeLinecap="round"
        strokeDasharray={`${filled.toFixed(2)} ${CIRCUMFERENCE.toFixed(2)}`}
        transform="rotate(-90 64 64)"
      />
    </svg>
  );
}
