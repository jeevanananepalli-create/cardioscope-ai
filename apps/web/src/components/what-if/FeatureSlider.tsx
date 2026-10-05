"use client";

import { useId } from "react";

import { levelLabel } from "@/components/dashboard/PatientForm";
import type { FeatureDescription, FeatureValue } from "@/types/patient";

interface FeatureSliderProps {
  feature: FeatureDescription;
  /** Value in the analyzed patient. */
  original: FeatureValue;
  /** Value in the simulation. */
  value: FeatureValue;
  onChange: (name: string, value: FeatureValue) => void;
}

function describe(feature: FeatureDescription, value: FeatureValue): string {
  if (feature.kind !== "numeric") return levelLabel(feature, value);
  const number = Number(value);
  const text = Number.isInteger(number) ? String(number) : number.toFixed(1);
  return feature.unit ? `${text} ${feature.unit}` : text;
}

/**
 * One adjustable input. Numeric inputs are sliders limited to the range seen in
 * training, so the simulation never asks the models to extrapolate.
 */
export function FeatureSlider({ feature, original, value, onChange }: FeatureSliderProps) {
  const id = useId();
  const changed = value !== original;
  const header = (
    <div className="whatif-control__head">
      <label className="whatif-control__label" htmlFor={id}>
        {feature.label}
      </label>
      <span className="whatif-control__value num" data-changed={changed ? "true" : undefined}>
        {describe(feature, value)}
      </span>
    </div>
  );
  const footer = (
    <div className="whatif-control__foot small muted num">
      <span>Analyzed: {describe(feature, original)}</span>
      {changed ? (
        <button type="button" className="button button--quiet" onClick={() => onChange(feature.name, original)}>
          Undo
        </button>
      ) : null}
    </div>
  );

  if (feature.kind === "numeric") {
    const observed = feature.observed;
    const min = observed?.min ?? feature.input_limits?.[0] ?? 0;
    const max = observed?.max ?? feature.input_limits?.[1] ?? 100;
    const step = feature.integer_valued ? 1 : 0.1;
    return (
      <div className="whatif-control" data-changed={changed ? "true" : undefined}>
        {header}
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={Math.min(max, Math.max(min, Number(value)))}
          aria-valuetext={describe(feature, value)}
          onChange={(event) => onChange(feature.name, Number(event.target.value))}
        />
        <div className="whatif-control__range small muted num">
          <span>{min}</span>
          <span>training range</span>
          <span>{max}</span>
        </div>
        {footer}
      </div>
    );
  }

  return (
    <div className="whatif-control" data-changed={changed ? "true" : undefined}>
      {header}
      <select
        id={id}
        className="field__control"
        value={String(value)}
        onChange={(event) => {
          const match = feature.categories.find((level) => String(level) === event.target.value);
          if (match !== undefined) onChange(feature.name, match);
        }}
      >
        {feature.categories.map((level) => (
          <option key={String(level)} value={String(level)}>
            {levelLabel(feature, level)}
          </option>
        ))}
      </select>
      {footer}
    </div>
  );
}
