"use client";

import { useState } from "react";

import { EmptyState, Notice } from "@/components/common/Notice";
import { Tabs } from "@/components/common/Tabs";
import { SHAPBarChart } from "@/components/explainability/SHAPBarChart";
import type { ExplanationState } from "@/hooks/useExplanation";
import { formatPercent } from "@/lib/constants";
import type { FeatureSchema } from "@/types/patient";
import { type PredictionResponse, type TargetName, TARGETS } from "@/types/prediction";

interface ExplanationPanelProps {
  state: ExplanationState;
  prediction: PredictionResponse | null;
  /** Which model's explanation is shown. */
  target: TargetName;
  onTargetChange: (target: TargetName) => void;
  onRetry: () => void;
  schema?: FeatureSchema | null;
}

const DEFAULT_LIMIT = 10;

function probabilityOf(prediction: PredictionResponse, target: TargetName): number {
  return target === "CAD" ? prediction.cad.probability : prediction.vessels[target].probability;
}

/** "Why this prediction?" — SHAP contributions for the chosen model. */
export function ExplanationPanel({ state, prediction, target, onTargetChange, onRetry, schema }: ExplanationPanelProps) {
  const [showAll, setShowAll] = useState(false);

  if (!prediction) {
    return (
      <EmptyState title="No explanation yet">
        After analysis, this shows which input values moved each model’s prediction up or down.
      </EmptyState>
    );
  }

  const explanation = state.explanation?.explanations[target];
  return (
    <Tabs
      label="Model to explain"
      variant="pill"
      items={TARGETS.map((name) => ({ key: name, label: name, badge: formatPercent(probabilityOf(prediction, name)) }))}
      active={target}
      onChange={onTargetChange}
    >
      {state.status === "loading" || state.status === "idle" ? (
        <div className="skeleton" style={{ height: 260 }} aria-label="Computing the explanation" />
      ) : state.status === "error" || !explanation ? (
        <Notice
          tone="error"
          title="The explanation could not be loaded."
          action={
            <button className="button" type="button" onClick={onRetry}>
              Try again
            </button>
          }
        >
          {state.error?.message ?? `No explanation was returned for the ${target} model.`} The prediction itself
          is unaffected.
        </Notice>
      ) : (
        <div className="explanation">
          <p className="explanation__lead">
            Input values that moved the <strong>{target}</strong> model’s prediction the most for this patient.
          </p>
          <SHAPBarChart
            explanation={explanation}
            limit={showAll ? explanation.contributions.length : DEFAULT_LIMIT}
            schema={schema}
          />
          {explanation.contributions.length > DEFAULT_LIMIT ? (
            <button className="button button--quiet" type="button" onClick={() => setShowAll((value) => !value)}>
              {showAll ? `Show the top ${DEFAULT_LIMIT} only` : `Show all ${explanation.contributions.length} features`}
            </button>
          ) : null}
          <p className="small muted">
            {state.explanation?.note} {explanation.output_space_description} Contributions start from the
            model’s average score ({explanation.base_value.toFixed(3)}) and add up to its raw score for this
            patient ({explanation.raw_score.toFixed(3)}).
          </p>
        </div>
      )}
    </Tabs>
  );
}
