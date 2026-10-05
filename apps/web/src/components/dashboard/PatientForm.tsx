"use client";

import { type FormEvent, useId, useMemo } from "react";

import { Panel } from "@/components/common/Panel";
import { inputFeatures, outsideTrainingRange, previewBmi } from "@/lib/validation";
import type {
  DemoProfile,
  DemoProfiles,
  FeatureDescription,
  FeatureSchema,
  FieldErrors,
  FormValues,
} from "@/types/patient";

interface PatientFormProps {
  schema: FeatureSchema;
  values: FormValues;
  errors: FieldErrors;
  busy: boolean;
  disabled?: boolean;
  onChange: (name: string, value: string) => void;
  onSubmit: () => void;
  onFillTypical: () => void;
  onClear: () => void;
  /** Synthetic demo profiles; omitted when they are not available. */
  demo?: DemoProfiles | null;
  /** Id of the demo profile currently loaded and unedited, if any. */
  activeDemoId?: string | null;
  onLoadDemo?: (profile: DemoProfile) => void;
}

/** How a category level is shown. Stored values are never changed. */
export function levelLabel(feature: FeatureDescription, level: string | number): string {
  if (feature.kind === "binary") return String(level) === "1" ? "Yes" : "No";
  if (level === "N") return "None";
  return String(level);
}

function fieldId(base: string, name: string): string {
  return `${base}-${name.replace(/\W+/g, "-")}`;
}

interface FieldProps {
  feature: FeatureDescription;
  value: string;
  error?: string;
  baseId: string;
  onChange: (name: string, value: string) => void;
}

function Field({ feature, value, error, baseId, onChange }: FieldProps) {
  const id = fieldId(baseId, feature.name);
  const errorId = `${id}-error`;
  const describedBy = error ? errorId : undefined;

  if (feature.kind === "binary") {
    return (
      <div className="field" role="group" aria-labelledby={`${id}-label`}>
        <span className="field__label" id={`${id}-label`}>
          {feature.label}
        </span>
        <div className="segmented" data-invalid={error ? "true" : undefined}>
          {feature.categories.map((level) => (
            <label key={String(level)}>
              <input
                type="radio"
                name={id}
                value={String(level)}
                checked={value === String(level)}
                aria-describedby={describedBy}
                onChange={() => onChange(feature.name, String(level))}
              />
              {levelLabel(feature, level)}
            </label>
          ))}
        </div>
        {error ? (
          <span className="field__error" id={errorId}>
            {error}
          </span>
        ) : null}
      </div>
    );
  }

  const outside = outsideTrainingRange(feature, value);
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        <span>{feature.label}</span>
        {feature.unit ? <span className="field__unit">{feature.unit}</span> : null}
      </label>
      {feature.kind === "numeric" ? (
        <input
          id={id}
          className="field__control num"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={describedBy}
          onChange={(event) => onChange(feature.name, event.target.value)}
        />
      ) : (
        <select
          id={id}
          className="field__control"
          value={value}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={describedBy}
          onChange={(event) => onChange(feature.name, event.target.value)}
        >
          <option value="">Select…</option>
          {feature.categories.map((level) => (
            <option key={String(level)} value={String(level)}>
              {levelLabel(feature, level)}
            </option>
          ))}
        </select>
      )}
      {error ? (
        <span className="field__error" id={errorId}>
          {error}
        </span>
      ) : outside && feature.observed ? (
        <span className="field__hint">
          Outside the range seen in training ({feature.observed.min}–{feature.observed.max}).
        </span>
      ) : null}
    </div>
  );
}

function DerivedBmi({ values }: { values: FormValues }) {
  const bmi = previewBmi(values);
  return (
    <div className="field field--wide">
      <span className="field__label">
        <span>Body mass index and obesity flag</span>
        <span className="field__unit">computed</span>
      </span>
      <output className="field__control num" aria-label="Computed body mass index">
        {bmi === null ? "—" : `${bmi.toFixed(1)} kg/m² · Obesity (BMI ≥ 25): ${bmi >= 25 ? "Yes" : "No"}`}
      </output>
      <span className="field__note">Calculated from weight and height, as in the dataset.</span>
    </div>
  );
}

export function PatientForm({
  schema,
  values,
  errors,
  busy,
  disabled = false,
  onChange,
  onSubmit,
  onFillTypical,
  onClear,
  demo = null,
  activeDemoId = null,
  onLoadDemo,
}: PatientFormProps) {
  const baseId = useId();
  const features = useMemo(() => inputFeatures(schema), [schema]);
  const errorCount = Object.keys(errors).length;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <Panel
      title="Patient profile"
      subtitle={`${features.length} clinical inputs`}
      flush
      actions={
        <div className="button-row">
          <button className="button button--quiet" type="button" onClick={onFillTypical}>
            Fill typical values
          </button>
          <button className="button button--quiet" type="button" onClick={onClear}>
            Clear
          </button>
        </div>
      }
    >
      <form className="form" onSubmit={handleSubmit} noValidate aria-label="Patient clinical information">
        {demo && demo.profiles.length > 0 && onLoadDemo ? (
          <section className="demo" aria-label="Demo mode">
            <div className="demo__head">
              <span className="eyebrow">Demo mode</span>
              <span className="badge badge--research">Synthetic · not real patients</span>
            </div>
            <div className="demo__profiles">
              {demo.profiles.map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  className="demo__profile"
                  aria-pressed={activeDemoId === profile.id}
                  disabled={busy || disabled}
                  title={profile.summary}
                  onClick={() => onLoadDemo(profile)}
                >
                  {profile.name}
                </button>
              ))}
            </div>
            <p className="field__note">
              {activeDemoId
                ? `${demo.profiles.find((profile) => profile.id === activeDemoId)?.summary ?? ""} `
                : ""}
              {demo.note}
            </p>
          </section>
        ) : null}
        <div className="form__scroll">
          {schema.groups.map((group, index) => {
            const groupFeatures = features.filter((feature) => feature.group === group.key);
            if (groupFeatures.length === 0) return null;
            const groupErrors = groupFeatures.filter((feature) => errors[feature.name]).length;
            return (
              <details className="form-group" key={group.key} open={index < 2 || groupErrors > 0}>
                <summary>
                  <span className="form-group__title">{group.title}</span>
                  {groupErrors > 0 ? (
                    <span className="form-group__errors">
                      {groupErrors} to fix
                    </span>
                  ) : (
                    <span className="form-group__count">{groupFeatures.length}</span>
                  )}
                </summary>
                <div className="form-group__fields">
                  {groupFeatures.map((feature) => (
                    <Field
                      key={feature.name}
                      feature={feature}
                      value={values[feature.name] ?? ""}
                      error={errors[feature.name]}
                      baseId={baseId}
                      onChange={onChange}
                    />
                  ))}
                  {group.key === "demographic" ? <DerivedBmi values={values} /> : null}
                </div>
              </details>
            );
          })}
        </div>
        <div className="form__actions">
          {errorCount > 0 ? (
            <p className="field__error" role="alert">
              {errorCount} field{errorCount === 1 ? "" : "s"} need{errorCount === 1 ? "s" : ""} attention before
              the patient can be analyzed.
            </p>
          ) : null}
          <button className="button button--primary button--block" type="submit" disabled={busy || disabled}>
            {busy ? "Analyzing…" : "Analyze Patient"}
          </button>
          <p className="field__note">
            “Fill typical values” enters the median or most common value of each input in the training data.
            It is a convenience for exploring the tool, not a patient.
          </p>
        </div>
      </form>
    </Panel>
  );
}
