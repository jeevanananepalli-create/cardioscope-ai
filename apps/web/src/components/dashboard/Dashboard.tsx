"use client";

import { useCallback, useState } from "react";

import { AnatomyViewer } from "@/components/anatomy/AnatomyViewer";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { EmptyState, Notice } from "@/components/common/Notice";
import { Panel } from "@/components/common/Panel";
import { ClinicalMeasurements } from "@/components/dashboard/ClinicalMeasurements";
import { PatientForm } from "@/components/dashboard/PatientForm";
import { RiskLegend } from "@/components/dashboard/RiskLegend";
import { RiskOverview } from "@/components/dashboard/RiskOverview";
import { SafetyDisclaimer } from "@/components/dashboard/SafetyDisclaimer";
import { VesselRiskCards } from "@/components/dashboard/VesselRiskCards";
import { AppHeader, type ServiceStatus } from "@/components/layout/AppHeader";
import { useAnatomy } from "@/hooks/useAnatomy";
import { type PredictionFailure, usePrediction } from "@/hooks/usePrediction";
import { useServiceData } from "@/hooks/useServiceData";
import type { Api } from "@/lib/api";
import { FALLBACK_RISK_CATEGORIES } from "@/lib/constants";
import { emptyFormValues, typicalFormValues, validatePatient } from "@/lib/validation";
import type { FeatureSchema, FieldErrors, FormValues } from "@/types/patient";

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
  const [values, setValues] = useState<FormValues | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [edited, setEdited] = useState(false);

  const schema = data.state === "ready" ? data.schema : null;
  const modelInfo = data.state === "ready" ? data.modelInfo : null;
  const categories = modelInfo?.risk_categories.length ? modelInfo.risk_categories : FALLBACK_RISK_CATEGORIES;
  const formValues = values ?? (schema ? emptyFormValues(schema) : {});
  const { analyze, reset } = prediction;

  const handleChange = useCallback(
    (name: string, value: string) => {
      setValues((current) => ({ ...(current ?? formValues), [name]: value }));
      setEdited(true);
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

  return (
    <div className="app">
      <AppHeader status={status} modelVersion={modelInfo?.model_version ?? null} />
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
                onFillTypical={() => {
                  setValues(typicalFormValues(data.schema));
                  setErrors({});
                  setEdited(true);
                }}
                onClear={() => {
                  setValues(emptyFormValues(data.schema));
                  setErrors({});
                  setEdited(false);
                  reset();
                }}
              />
            </ErrorBoundary>
          )}
        </div>

        <div className="workspace__center">
          <Panel title="Coronary anatomy" subtitle="Interactive 3D view · visualization of model output">
            <AnatomyViewer vessels={null} categories={categories} anatomy={anatomy} />
          </Panel>
        </div>

        <div className="workspace__right">
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
                <VesselRiskCards vessels={result.vessels} categories={categories} metadata={modelInfo?.targets} />
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

      <div className="bottom">
        <Panel title="Clinical measurements" subtitle="Inputs used for the current prediction">
          <ErrorBoundary label="The measurements table">
            {result && prediction.features && schema ? (
              <ClinicalMeasurements schema={schema} features={prediction.features} derived={result.derived_features} />
            ) : (
              <EmptyState title="No measurements to show">
                The values used for a prediction are listed here after analysis.
              </EmptyState>
            )}
          </ErrorBoundary>
        </Panel>
      </div>

      <footer className="app-footer">
        CardioScope AI is a research and education prototype. Model outputs are predictions from clinical
        features, not diagnoses. Vessel highlighting visualizes model output; it is not medical imaging.
      </footer>
    </div>
  );
}
