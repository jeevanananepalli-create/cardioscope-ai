import { formatPercent } from "@/lib/constants";
import type { VesselVisualState } from "@/types/anatomy";

interface VesselTooltipProps {
  state: VesselVisualState;
  /** Show the probability and category as well as the name. */
  expanded: boolean;
}

/** In-scene label for a vessel: always its name, plus the prediction on hover or selection. */
export function VesselTooltip({ state, expanded }: VesselTooltipProps) {
  return (
    <div className="vessel-label" data-expanded={expanded ? "true" : undefined}>
      <span className="vessel-label__dot" style={{ background: state.color }} aria-hidden="true" />
      <span className="vessel-label__name">{state.vessel}</span>
      {expanded ? (
        <span className="vessel-label__detail num">
          {state.probability === null
            ? "No prediction yet"
            : `${formatPercent(state.probability)} · ${state.categoryLabel}`}
        </span>
      ) : null}
    </div>
  );
}
