"use client";

import { useCallback, useState } from "react";

import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { EmptyState, Notice } from "@/components/common/Notice";
import { Panel } from "@/components/common/Panel";
import { PatientForm } from "@/components/dashboard/PatientForm";
import { SafetyDisclaimer } from "@/components/dashboard/SafetyDisclaimer";
import { AppHeader, type ServiceStatus } from "@/components/layout/AppHeader";
import { useServiceData } from "@/hooks/useServiceData";
import type { Api } from "@/lib/api";
import { emptyFormValues, typicalFormValues, validatePatient } from "@/lib/validation";
import type { FieldErrors, FormValues, PatientFeatures } from "@/types/patient";

interface DashboardProps {
  /** Injected in tests; defaults to the real API client. */
  api?: Api;
}

export function Dashboard({ api }: DashboardProps) {
  const { data, reload } = useServiceData(api);
  const [values, setValues] = useState<FormValues | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitted, setSubmitted] = useState<PatientFeatures | null>(null);

  const schema = data.state === "ready" ? data.schema : null;
  const formValues = values ?? (schema ? emptyFormValues(schema) : {});

  const handleChange = useCallback(
    (name: string, value: string) => {
      setValues((current) => ({ ...(current ?? formValues), [name]: value }));
      setErrors((current) => {
        if (!current[name]) return current;
        const { [name]: _removed, ...rest } = current;
        return rest;
      });
    },
    [formValues],
  );

  const handleSubmit = useCallback(() => {
    if (!schema) return;
    const result = validatePatient(schema, formValues);
    setErrors(result.errors);
    setSubmitted(result.features);
  }, [schema, formValues]);

  const status: ServiceStatus =
    data.state === "loading"
      ? "checking"
      : data.state === "error"
        ? "unreachable"
        : data.modelsReady
          ? "ok"
          : "models_unavailable";

  return (
    <div className="app">
      <AppHeader status={status} modelVersion={data.state === "ready" ? data.modelInfo.model_version : null} />
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
                errors={errors}
                busy={false}
                onChange={handleChange}
                onSubmit={handleSubmit}
                onFillTypical={() => {
                  setValues(typicalFormValues(data.schema));
                  setErrors({});
                }}
                onClear={() => {
                  setValues(emptyFormValues(data.schema));
                  setErrors({});
                  setSubmitted(null);
                }}
              />
            </ErrorBoundary>
          )}
        </div>

        <div className="workspace__center">
          <Panel title="Coronary anatomy" subtitle="Interactive 3D view">
            <EmptyState title="3D anatomy view">Added in a later build phase.</EmptyState>
          </Panel>
        </div>

        <div className="workspace__right">
          <Panel title="Risk summary" subtitle="Model predictions">
            {submitted ? (
              <EmptyState title="Input validated">
                {Object.keys(submitted).length} inputs are ready. Prediction is connected in the next build phase.
              </EmptyState>
            ) : (
              <EmptyState title="No prediction yet">
                Enter the patient’s clinical information and choose “Analyze Patient”.
              </EmptyState>
            )}
          </Panel>
        </div>
      </main>
      <footer className="app-footer">
        CardioScope AI is a research and education prototype. Model outputs are predictions from clinical
        features, not diagnoses.
      </footer>
    </div>
  );
}
