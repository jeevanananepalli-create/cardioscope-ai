import { formatPercent, RISK_COLORS } from "@/lib/constants";
import type { RiskCategory } from "@/types/prediction";

interface RiskLegendProps {
  categories: RiskCategory[];
  note?: string;
}

/** The configured visualization bands, with the statement that they are not clinical thresholds. */
export function RiskLegend({ categories, note }: RiskLegendProps) {
  return (
    <div className="legend">
      <ul className="legend__bands" aria-label="Visualization categories">
        {categories.map((category) => (
          <li key={category.key}>
            <span className="legend__swatch" style={{ background: RISK_COLORS[category.key] }} aria-hidden="true" />
            <span>{category.label}</span>
            <span className="muted num">
              {formatPercent(category.min)}–{formatPercent(category.max)}
            </span>
          </li>
        ))}
      </ul>
      <p className="small muted">
        {note ??
          "Risk categories are visualization bands for this prototype. They are not clinically validated risk thresholds."}
      </p>
    </div>
  );
}
