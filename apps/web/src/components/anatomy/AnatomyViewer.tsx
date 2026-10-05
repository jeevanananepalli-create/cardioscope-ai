"use client";

import { lazy, Suspense, useEffect, useMemo, useState } from "react";

import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { Notice } from "@/components/common/Notice";
import type { AnatomyState } from "@/hooks/useAnatomy";
import { ANATOMY_SOURCE, PLACEHOLDER_NOTICE, vesselVisualStates } from "@/lib/anatomy";
import { formatPercent } from "@/lib/constants";
import type { AnatomySource, ViewMode } from "@/types/anatomy";
import { type RiskCategory, type TargetPrediction, type VesselName, VESSELS } from "@/types/prediction";

// three.js is loaded only in the browser, and only when the viewer is shown.
const AnatomyScene = lazy(() => import("@/components/anatomy/AnatomyScene"));

interface AnatomyViewerProps {
  /** Vessel predictions to visualise, or null before any prediction. */
  vessels: Record<VesselName, TargetPrediction> | null;
  categories: RiskCategory[];
  anatomy: AnatomyState;
  /** Shown over the view, e.g. "Exploratory model simulation". */
  banner?: string | null;
  source?: AnatomySource;
}

const MODES: { key: ViewMode; label: string }[] = [
  { key: "heart", label: "Heart focus" },
  { key: "torso", label: "Torso context" },
];

function webglAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

/**
 * Interactive 3D view. Vessel colour is a visualization of model output, not imaging.
 * The vessel buttons mirror the 3D selection, so every vessel is reachable by keyboard
 * and the view stays usable if WebGL or the 3D asset is unavailable.
 */
export function AnatomyViewer({ vessels, categories, anatomy, banner = null, source = ANATOMY_SOURCE }: AnatomyViewerProps) {
  const [canRender, setCanRender] = useState<boolean | null>(null);
  const [assetFailed, setAssetFailed] = useState(false);
  useEffect(() => setCanRender(webglAvailable()), []);

  const states = useMemo(() => vesselVisualStates(vessels, categories), [vessels, categories]);
  const usingPlaceholder = source.kind === "placeholder" || assetFailed;

  const unavailable = (
    <div className="viewer__fallback">
      <Notice tone="warning" title="The 3D view is not available in this browser.">
        Predictions are unaffected. Use the vessel buttons above to inspect LAD, LCX and RCA.
      </Notice>
    </div>
  );

  return (
    <div className="viewer">
      <div className="viewer__toolbar">
        <div className="toggle" role="group" aria-label="View mode">
          {MODES.map((mode) => (
            <button
              key={mode.key}
              type="button"
              className="toggle__option"
              aria-pressed={anatomy.mode === mode.key}
              onClick={() => anatomy.setMode(mode.key)}
            >
              {mode.label}
            </button>
          ))}
        </div>
        <button type="button" className="button" onClick={anatomy.resetCamera}>
          Reset view
        </button>
      </div>

      <div className="viewer__vessels" role="group" aria-label="Select a vessel">
        {VESSELS.map((name) => {
          const state = states[name];
          return (
            <button
              key={name}
              type="button"
              className="vessel-chip"
              aria-pressed={anatomy.selected === name}
              aria-label={
                state.probability === null
                  ? `${name}, no prediction yet`
                  : `${name} ${formatPercent(state.probability)}, ${state.categoryLabel} category`
              }
              data-hovered={anatomy.hovered === name ? "true" : undefined}
              data-category={state.category ?? "none"}
              onClick={() => anatomy.toggle(name)}
              onMouseEnter={() => anatomy.setHovered(name)}
              onMouseLeave={() => anatomy.setHovered(null)}
              onFocus={() => anatomy.setHovered(name)}
              onBlur={() => anatomy.setHovered(null)}
            >
              <span className="vessel-chip__dot" style={{ background: state.color }} aria-hidden="true" />
              <span className="vessel-chip__name">{name}</span>
              <span className="vessel-chip__value num">
                {state.probability === null ? "—" : formatPercent(state.probability)}
              </span>            </button>
          );
        })}
      </div>

      <div className="viewer__stage" data-testid="anatomy-stage">
        {banner ? <div className="viewer__banner">{banner}</div> : null}
        {canRender === false ? (
          unavailable
        ) : canRender ? (
          <ErrorBoundary label="The 3D view" fallback={unavailable}>
            <Suspense fallback={<div className="viewer__loading">Loading 3D view…</div>}>
              <AnatomyScene
                source={assetFailed ? { kind: "placeholder" } : source}
                mode={anatomy.mode}
                vessels={states}
                selected={anatomy.selected}
                hovered={anatomy.hovered}
                resetSignal={anatomy.resetSignal}
                onSelect={anatomy.select}
                onHover={anatomy.setHovered}
                onAssetError={() => setAssetFailed(true)}
              />
            </Suspense>
          </ErrorBoundary>
        ) : (
          <div className="viewer__loading">Loading 3D view…</div>
        )}
        <div className="viewer__hint">Drag to rotate · scroll to zoom · right-drag to pan · click a vessel</div>
      </div>

      {assetFailed ? (
        <Notice tone="warning" title="The 3D anatomy asset could not be loaded.">
          Showing the schematic placeholder instead. Predictions are unaffected.
        </Notice>
      ) : null}
      <p className="viewer__caption small muted">
        {usingPlaceholder ? `${PLACEHOLDER_NOTICE} ` : `Anatomy: ${source.kind === "gltf" ? source.attribution : ""}. `}
        Vessel colour shows the model’s predicted stenosis probability. It is a visualization of model
        output, not medical imaging, and does not locate a lesion.
      </p>
    </div>
  );
}
