import { categoryFor, formatPercent, RISK_COLORS } from "@/lib/constants";
import type { RiskCategory } from "@/types/prediction";

interface RiskGaugeProps {
  probability: number;
  categories: RiskCategory[];
  label: string;
}

const RADIUS = 80;
const CENTER_X = 100;
const CENTER_Y = 96;

function point(fraction: number, radius = RADIUS): [number, number] {
  const angle = Math.PI * (1 - fraction);
  return [CENTER_X + radius * Math.cos(angle), CENTER_Y - radius * Math.sin(angle)];
}

function arc(from: number, to: number): string {
  const [x1, y1] = point(from);
  const [x2, y2] = point(to);
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${RADIUS} ${RADIUS} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

/** Half-circle gauge whose coloured segments are the configured visualization bands. */
export function RiskGauge({ probability, categories, label }: RiskGaugeProps) {
  const category = categoryFor(probability, categories);
  const [needleX, needleY] = point(probability, RADIUS - 16);
  return (
    <svg
      className="gauge"
      viewBox="0 0 200 112"
      role="img"
      aria-label={`${label}: ${formatPercent(probability)}, ${category.label} visualization category`}
    >
      {categories.map((band) => (
        <path
          key={band.key}
          d={arc(band.min + 0.004, band.max - 0.004)}
          fill="none"
          stroke={RISK_COLORS[band.key]}
          strokeWidth={band.key === category.key ? 14 : 9}
          opacity={band.key === category.key ? 1 : 0.35}
        />
      ))}
      <line x1={CENTER_X} y1={CENTER_Y} x2={needleX} y2={needleY} stroke="#15202b" strokeWidth={2.5} strokeLinecap="round" />
      <circle cx={CENTER_X} cy={CENTER_Y} r={4.5} fill="#15202b" />
      <text x={12} y={110} className="gauge__tick">
        0%
      </text>
      <text x={188} y={110} textAnchor="end" className="gauge__tick">
        100%
      </text>
    </svg>
  );
}
