"use client";

import { useMemo, useState } from "react";

import { EmptyState, Notice } from "@/components/common/Notice";
import { FeatureSlider } from "@/components/what-if/FeatureSlider";
import { PredictionComparison } from "@/components/what-if/PredictionComparison";
import type { WhatIf } from "@/hooks/useWhatIf";
import { inputFeatures } from "@/lib/validation";
import type { FeatureSchema, PatientFeatures } from "@/types/patient";
import type { ModelInfo, PredictionResponse, RiskCategory } from "@/types/prediction";

export const WHAT_IF_LABEL = "Exploratory model simulation";

interface WhatIfSimulatorProps {
  schema: FeatureSchema | null;
  /** The analyzed patient and its prediction; the simulation starts from these. */
  baseline: PatientFeatures | null;
  prediction: PredictionResponse | null;
  whatIf: WhatIf;
  categories: RiskCategory[];
  modelInfo: ModelInfo | null;
}

const DEFAULT_CONTROLS = 6;

/** Inputs the models rely on most (mean global importance rank), to offer first. */
export function suggestedFeatures(schema: FeatureSchema, modelInfo: ModelInfo | null, count: number): string[] {
  const adjustable = new Set(inputFeatures(schema).map((feature) => feature.name));
  const score = new Map<string, number>();
  for (const metadata of Object.values(modelInfo?.targets ?? {})) {
    const features = metadata?.global_importance?.features ?? [];
    const total = features.reduce((sum, feature) => sum + feature.mean_abs_shap, 0) || 1;
    for (const feature of features) {
      score.set(feature.feature, (score.get(feature.feature) ?? 0) + feature.mean_abs_shap / total);
    }
  }
  const ranked = [...score.entries()]
    .filter(([name]) => adjustable.has(name))
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);
  const fallback = inputFeatures(schema).map((feature) => feature.name);
  return [...new Set([...ranked, ...fallback])].slice(0, count);
}

/** What-if mode: change inputs, re-run the models, compare with the analyzed patient. */
export function WhatIfSimulator({ schema, baseline, prediction, whatIf, categories, modelInfo }: WhatIfSimulatorProps) {
  const [added, setAdded] = useState<string[]>([]);
  const suggested = useMemo(
    () => (schema ? suggestedFeatures(schema, modelInfo, DEFAULT_CONTROLS) : []),
    [schema, modelInfo],
  );

  if (!schema || !baseline || !prediction) {
    return (
      <EmptyState title={WHAT_IF_LABEL}>
        Analyze a patient first. You can then change inputs and see how the model outputs respond.
      </EmptyState>
    );
  }

  const shownNames = [...new Set([...suggested, ...added, ...Object.keys(whatIf.overrides)])];
  const byName = new Map(inputFeatures(schema).map((feature) => [feature.name, feature]));
  const remaining = inputFeatures(schema).filter((feature) => !shownNames.includes(feature.name));

  return (
    <div className="whatif">
      <div className="whatif__intro">
        <div>
          <span className="badge badge--research">{WHAT_IF_LABEL}</span>
          <p className="small whatif__caveat">
            This shows how sensitive the models are to their inputs. It is not treatment advice and not a
            prediction of what would happen to a patient if a value changed; the models describe statistical
            association, not cause and effect.
          </p>
        </div>
        <div className="button-row">
          <button
            type="button"
            className={`button${whatIf.active ? "" : " button--primary"}`}
            aria-pressed={whatIf.active}
            onClick={whatIf.toggle}
          >
            {whatIf.active ? "Turn off what-if mode" : "Turn on what-if mode"}
          </button>
          {whatIf.active ? (
            <button type="button" className="button" onClick={whatIf.reset} disabled={whatIf.changed.length === 0}>
              Reset to analyzed values
            </button>
          ) : null}
        </div>
      </div>

      {whatIf.active ? (
        <div className="whatif__body">
          <div className="whatif__controls" role="group" aria-label="Inputs to change">
            {shownNames.map((name) => {
              const feature = byName.get(name);
              const original = baseline[name];
              if (!feature || original === undefined) return null;
              return (
                <FeatureSlider
                  key={name}
                  feature={feature}
                  original={original}
                  value={whatIf.overrides[name] ?? original}
                  onChange={whatIf.setOverride}
                />
              );
            })}
            {remaining.length > 0 ? (
              <label className="whatif__add small">
                <span>Change another input</span>
                <select
                  className="field__control"
                  value=""
                  onChange={(event) => {
                    if (event.target.value) setAdded((current) => [...current, event.target.value]);
                  }}
                >
                  <option value="">Choose an input…</option>
                  {remaining.map((feature) => (
                    <option key={feature.name} value={feature.name}>
                      {feature.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>

          <div className="whatif__results">
            {whatIf.error ? (
              <Notice tone="error" title="The simulation could not be run.">
                {whatIf.error.message}
              </Notice>
            ) : null}
            <PredictionComparison
              before={prediction}
              after={whatIf.result}
              categories={categories}
              pending={whatIf.status === "loading"}
            />
            <p className="small muted" role="status">
              {whatIf.changed.length === 0
                ? "No inputs changed yet. Adjust an input to run the simulation."
                : whatIf.status === "loading"
                  ? "Running the models…"
                  : `${whatIf.changed.length} input${whatIf.changed.length === 1 ? "" : "s"} changed: ${whatIf.changed
                      .map((name) => byName.get(name)?.label ?? name)
                      .join(", ")}. The 3D view shows the simulated output.`}
            </p>
            {whatIf.result && "BMI" in whatIf.result.derived_features ? (
              <p className="small muted num">
                Simulated BMI {whatIf.result.derived_features.BMI!.toFixed(1)} kg/m² (recomputed from weight and
                height).
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="small muted">
          What-if mode is off. The dashboard shows the prediction for the analyzed patient.
        </p>
      )}
    </div>
  );
}
