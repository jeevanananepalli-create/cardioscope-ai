import { categoryFor, formatPercent, RISK_COLORS } from "@/lib/constants";
import { type PredictionResponse, type RiskCategory, type TargetName, TARGETS } from "@/types/prediction";

interface QuickViewProps {
  prediction: PredictionResponse;
  categories: RiskCategory[];
}

/** The four model outputs side by side. Repeats the figures above; adds nothing new. */
export function QuickView({ prediction, categories }: QuickViewProps) {
  const outputs: Record<TargetName, number> = {
    CAD: prediction.cad.probability,
    LAD: prediction.vessels.LAD.probability,
    LCX: prediction.vessels.LCX.probability,
    RCA: prediction.vessels.RCA.probability,
  };
  return (
    <ul className="quick" aria-label="All four model outputs">
      {TARGETS.map((target) => {
        const category = categoryFor(outputs[target], categories);
        return (
          <li key={target} className="quick__tile" style={{ ["--tile" as string]: RISK_COLORS[category.key] }}>
            <span className="quick__name">{target}</span>
            <span className="quick__value num">{formatPercent(outputs[target])}</span>
            <span className="quick__band">{category.label}</span>
          </li>
        );
      })}
    </ul>
  );
}
