"use client";

import { useCallback, useEffect, useState } from "react";

import { AnatomyViewer } from "@/components/anatomy/AnatomyViewer";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { EmptyState, Notice } from "@/components/common/Notice";
import { Panel } from "@/components/common/Panel";
import { Tabs } from "@/components/common/Tabs";
import { ClinicalMeasurements } from "@/components/dashboard/ClinicalMeasurements";
import { ModelPerformance } from "@/components/dashboard/ModelPerformance";
import { PatientForm } from "@/components/dashboard/PatientForm";
import { RiskLegend } from "@/components/dashboard/RiskLegend";
import { RiskOverview } from "@/components/dashboard/RiskOverview";
import { SafetyDisclaimer } from "@/components/dashboard/SafetyDisclaimer";
import { VesselRiskCards } from "@/components/dashboard/VesselRiskCards";
import { ExplanationPanel } from "@/components/explainability/ExplanationPanel";
import { VesselExplanation } from "@/components/explainability/VesselExplanation";
import { AppHeader, type ServiceStatus } from "@/components/layout/AppHeader";
import { WHAT_IF_LABEL, WhatIfSimulator } from "@/components/what-if/WhatIfSimulator";
import { useAnatomy } from "@/hooks/useAnatomy";
import { useExplanation } from "@/hooks/useExplanation";
import { type PredictionFailure, usePrediction } from "@/hooks/usePrediction";
import { useServiceData } from "@/hooks/useServiceData";
import { useTheme } from "@/hooks/useTheme";
import { useWhatIf } from "@/hooks/useWhatIf";
import type { Api } from "@/lib/api";
import { FALLBACK_RISK_CATEGORIES } from "@/lib/constants";
import { emptyFormValues, toFormValues, typicalFormValues, validatePatient } from "@/lib/validation";
import type { DemoProfile, FeatureSchema, FieldErrors, FormValues } from "@/types/patient";
import type { TargetName } from "@/types/prediction";

type BottomTab = "why" | "measurements" | "whatif" | "performance";

interface DashboardProps {
  /** Injected in tests; defaults to the real API client. */
  api?: Api;
}

const FAILURE_TITLES: Record<PredictionFailure["kind"], string> = {
  network: "The prediction service is not reachable.",
  model_unavailable: "The prediction models are not available.",
  invalid_input: "The service did not accept the patient data.",
  malformed_response: "The service returned an unexpected response.",
  explanation_failed: "The explanation could not be computed.",
  server: "The prediction could not be completed.",
  unknown: "The prediction could not be completed.",
};

/** Field errors reported by the API, mapped onto the form (only for fields the form has). */
function fieldErrorsFrom(failure: PredictionFailure, schema: FeatureSchema): FieldErrors {
  const known = new Set(schema.features.map((feature) => feature.name));
  const errors: FieldErrors = {};
  for (const detail of failure.details) {
    if (known.has(detail.field)) errors[detail.field] = detail.message;
  }
  return errors;
}

export function Dashboard({ api }: DashboardProps) {
  const { data, reload } = useServiceData(api);
  const prediction = usePrediction(api);
  const anatomy = useAnatomy();
  const { theme, toggleTheme } = useTheme();
  const [values, setValues] = useState<FormValues | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [edited, setEdited] = useState(false);
  const [activeDemoId, setActiveDemoId] = useState<string | null>(null);
  const [bottomTab, setBottomTab] = useState<BottomTab>("why");
  const [explainTarget, setExplainTarget] = useState<TargetName>("CAD");
  // One explanation request per prediction, covering all four models, and only while a
  // panel that shows it is on screen (the explanation tab, the measurements highlight, or
  // the selected-vessel details).
  const explanationVisible = bottomTab === "why" || bottomTab === "measurements" || anatomy.selected !== null;
  const explanation = useExplanation(prediction.features, explanationVisible, api);
  const whatIf = useWhatIf(prediction.features, api);

  // Selecting a vessel in the 3D view points the explanation at that vessel's model.
  const selectedVessel = anatomy.selected;
  useEffect(() => {
    if (selectedVessel) setExplainTarget(selectedVessel);
  }, [selectedVessel]);

  const schema = data.state === "ready" ? data.schema : null;
  const modelInfo = data.state === "ready" ? data.modelInfo : null;
  const categories = modelInfo?.risk_categories.length ? modelInfo.risk_categories : FALLBACK_RISK_CATEGORIES;
  const formValues = values ?? (schema ? emptyFormValues(schema) : {});
  const { analyze, reset } = prediction;

  const handleChange = useCallback(
    (name: string, value: string) => {
      setValues((current) => ({ ...(current ?? formValues), [name]: value }));
      setEdited(true);
      // Once edited, the inputs are no longer the demo profile.
      setActiveDemoId(null);
      setErrors((current) => {
        if (!current[name]) return current;
        const { [name]: _removed, ...rest } = current;
        return rest;
      });
    },
    [formValues],
  );

  const handleSubmit = useCallback(async () => {
    if (!schema) return;
    const result = validatePatient(schema, formValues);
    setErrors(result.errors);
    if (!result.features) return;
    setEdited(false);
    await analyze(result.features);
  }, [schema, formValues, analyze]);

  /** Load a synthetic demo profile into the form and run the models on it. */
  const handleLoadDemo = useCallback(
    async (profile: DemoProfile) => {
      setValues(toFormValues(profile.features));
      setErrors({});
      setEdited(false);
      setActiveDemoId(profile.id);
      await analyze(profile.features);
    },
    [analyze],
  );

  const status: ServiceStatus =
    data.state === "loading"
      ? "checking"
      : data.state === "error"
        ? "unreachable"
        : prediction.error?.kind === "network"
          ? "unreachable"
          : data.modelsReady && prediction.error?.kind !== "model_unavailable"
            ? "ok"
            : "models_unavailable";

  const failure = prediction.error;
  const serverFieldErrors = failure && schema ? fieldErrorsFrom(failure, schema) : {};
  const shownErrors = { ...serverFieldErrors, ...errors };
  const result = prediction.prediction;
  const stale = edited && result !== null;
  // While a simulation has output, the 3D view shows it (and says so); otherwise the analyzed patient.
  const simulated = whatIf.active && whatIf.result ? whatIf.result : null;
  const shownVessels = simulated?.vessels ?? result?.vessels ?? null;

  return (
    <div className="app">
      <a className="skip-link" href="#results">
        Skip to results
      </a>
      <AppHeader
        status={status}
        modelVersion={modelInfo?.model_version ?? null}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
      <SafetyDisclaimer />
      <main className="workspace">
        <div className="workspace__left">
          {data.state === "loading" ? (
            <Panel title="Patient profile">
              <div className="skeleton" style={{ height: 320 }} aria-label="Loading the patient form" />
            </Panel>
          ) : data.state === "error" ? (
            <Panel title="Patient profile">
              <Notice
                tone="error"
                title="The patient form could not be loaded."
                action={
                  <button className="button" type="button" onClick={reload}>
                    Try again
                  </button>
                }
              >
                {data.message}
              </Notice>
            </Panel>
          ) : (
            <ErrorBoundary label="The patient form">
              <PatientForm
                schema={data.schema}
                values={formValues}
                errors={shownErrors}
                busy={prediction.status === "loading"}
                onChange={handleChange}
                onSubmit={handleSubmit}
                demo={data.demo}
                activeDemoId={activeDemoId}
                onLoadDemo={handleLoadDemo}
                onFillTypical={() => {
                  setValues(typicalFormValues(data.schema));
                  setErrors({});
                  setEdited(true);
                  setActiveDemoId(null);
                }}
                onClear={() => {
                  setValues(emptyFormValues(data.schema));
                  setErrors({});
                  setEdited(false);
                  setActiveDemoId(null);
                  reset();
                }}
              />
            </ErrorBoundary>
          )}
        </div>

        <div className="workspace__center">
          <Panel
            title="Coronary anatomy"
            subtitle="Interactive 3D view · visualization of model output"
            className="panel--hero"
          >
            <AnatomyViewer
              vessels={shownVessels}
              categories={categories}
              anatomy={anatomy}
              banner={simulated ? WHAT_IF_LABEL : null}
            />
          </Panel>

          <Panel title="Selected vessel" subtitle="Prediction and top contributors">
            <ErrorBoundary label="The vessel details">
              <VesselExplanation
                vessel={anatomy.selected}
                prediction={result}
                explanation={explanation}
                categories={categories}
                metadata={anatomy.selected ? modelInfo?.targets[anatomy.selected] : undefined}
                onShowFullExplanation={() => setBottomTab("why")}
                schema={schema}
              />
            </ErrorBoundary>
          </Panel>
        </div>

        <div className="workspace__right" id="results" tabIndex={-1}>
          {data.state === "ready" && !data.modelsReady ? (
            <Notice tone="warning" title="The prediction models are not available.">
              The service is running but has no trained models. Train them with{" "}
              <code>python -m ml.scripts.train_all</code>, restart the API, then reload this page.
            </Notice>
          ) : null}

          <Panel title="Overall CAD risk" subtitle="Model prediction">
            <ErrorBoundary label="The risk summary">
              {failure ? (
                <Notice
                  tone="error"
                  title={FAILURE_TITLES[failure.kind]}
                  action={
                    failure.kind === "invalid_input" ? null : (
                      <button className="button" type="button" onClick={handleSubmit}>
                        Try again
                      </button>
                    )
                  }
                >
                  {failure.message}
                  {failure.details.length > 0 && failure.kind === "invalid_input" ? (
                    <ul>
                      {failure.details.slice(0, 6).map((detail) => (
                        <li key={detail.field}>
                          {detail.field}: {detail.message}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </Notice>
              ) : result ? (
                <>
                  {stale ? (
                    <Notice tone="warning" title="Inputs have changed since this prediction.">
                      Choose “Analyze Patient” to update the results.
                    </Notice>
                  ) : null}
                  {activeDemoId ? (
                    <Notice tone="info" title="Synthetic demo profile">
                      These inputs are not a real patient. The prediction is the models’ actual output for them.
                    </Notice>
                  ) : null}
                  <RiskOverview
                    prediction={result.cad}
                    categories={categories}
                    metadata={modelInfo?.targets.CAD}
                    stale={stale}
                  />
                </>
              ) : prediction.status === "loading" ? (
                <div className="skeleton" style={{ height: 220 }} aria-label="Running the models" />
              ) : (
                <EmptyState title="No prediction yet">
                  Enter the patient’s clinical information and choose “Analyze Patient”.
                </EmptyState>
              )}
            </ErrorBoundary>
          </Panel>

          <Panel title="Vessel risk" subtitle="Predicted stenosis probability per vessel">
            <ErrorBoundary label="The vessel predictions">
              {result ? (
                <VesselRiskCards
                  vessels={result.vessels}
                  categories={categories}
                  metadata={modelInfo?.targets}
                  selected={anatomy.selected}
                  onSelect={anatomy.toggle}
                />
              ) : (
                <EmptyState title="LAD · LCX · RCA">Vessel predictions appear after analysis.</EmptyState>
              )}
              <RiskLegend categories={categories} note={modelInfo?.risk_category_note} />
            </ErrorBoundary>
          </Panel>

          {result && result.warnings.length > 0 ? (
            <Notice tone="warning" title="Some inputs are outside the training data.">
              <ul>
                {result.warnings.map((warning) => (
                  <li key={warning.field}>{warning.message}</li>
                ))}
              </ul>
            </Notice>
          ) : null}
        </div>
      </main>

      <div className="bottom" role="region" aria-label="Analysis details and model performance">
        <section className="panel" aria-label="Analysis details">
          <Tabs
            label="Analysis details"
            items={[
              { key: "why", label: "Why this prediction?" },
              { key: "measurements", label: "Clinical measurements" },
              { key: "whatif", label: "What-if simulation", badge: whatIf.active ? "on" : null },
              { key: "performance", label: "Model performance" },
            ]}
            active={bottomTab}
            onChange={setBottomTab}
          >
            {bottomTab === "why" ? (
              <ErrorBoundary label="The explanation">
                <ExplanationPanel
                  state={explanation}
                  prediction={result}
                  target={explainTarget}
                  onTargetChange={setExplainTarget}
                  onRetry={explanation.retry}
                  schema={schema}
                />
              </ErrorBoundary>
            ) : null}
            {bottomTab === "measurements" ? (
              <ErrorBoundary label="The measurements table">
                {result && prediction.features && schema ? (
                  <ClinicalMeasurements
                    schema={schema}
                    features={prediction.features}
                    derived={result.derived_features}
                    highlight={explanation.explanation?.explanations[explainTarget]?.contributions
                      .slice(0, 5)
                      .map((contribution) => contribution.feature)}
                  />
                ) : (
                  <EmptyState title="No measurements to show">
                    The values used for a prediction are listed here after analysis.
                  </EmptyState>
                )}
              </ErrorBoundary>
            ) : null}
            {bottomTab === "whatif" ? (
              <ErrorBoundary label="The what-if simulator">
                <WhatIfSimulator
                  schema={schema}
                  baseline={prediction.features}
                  prediction={result}
                  whatIf={whatIf}
                  categories={categories}
                  modelInfo={modelInfo}
                />
              </ErrorBoundary>
            ) : null}
            {bottomTab === "performance" ? (
              <ErrorBoundary label="The model performance view">
                <ModelPerformance modelInfo={modelInfo} />
              </ErrorBoundary>
            ) : null}
          </Tabs>
        </section>
      </div>

      <footer className="app-footer">
        CardioScope AI is a research and education prototype. Model outputs are predictions from clinical
        features, not diagnoses. Vessel highlighting visualizes model output; it is not medical imaging.
        <span className="app-footer__credit"> Developed by Jeevana Nanepalli.</span>
      </footer>
    </div>
  );
}
