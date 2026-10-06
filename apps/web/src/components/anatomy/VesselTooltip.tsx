import { formatPercent } from "@/lib/constants";
import type { VesselVisualState } from "@/types/anatomy";

interface VesselTooltipProps {
  state: VesselVisualState;
  /** Show the probability and category as well as the name. */
  expanded: boolean;
}

/** In-scene tag for a vessel: its name and predicted probability, plus the band on hover or selection. */
export function VesselTooltip({ state, expanded }: VesselTooltipProps) {
  return (
    <div
      className="vessel-label"
      data-expanded={expanded ? "true" : undefined}
      data-predicted={state.probability === null ? undefined : "true"}
      data-category={state.category ?? undefined}
      style={{ ["--tag" as string]: state.color }}
    >
      <span className="vessel-label__name">{state.vessel}</span>
      {state.probability !== null ? (
        <span className="vessel-label__value num">{formatPercent(state.probability)}</span>
      ) : null}
      {expanded ? (
        <span className="vessel-label__detail">
          {state.probability === null ? "No prediction yet" : state.categoryLabel}
        </span>
      ) : null}
    </div>
  );
}
