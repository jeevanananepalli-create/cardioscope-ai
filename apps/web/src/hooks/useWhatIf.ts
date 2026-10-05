"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { type PredictionFailure, toFailure } from "@/hooks/usePrediction";
import { type Api, api as defaultApi } from "@/lib/api";
import type { FeatureValue, PatientFeatures } from "@/types/patient";
import type { PredictionResponse } from "@/types/prediction";

export const WHAT_IF_DEBOUNCE_MS = 250;

export interface WhatIfState {
  /** What-if mode is switched on. */
  active: boolean;
  /** Inputs changed from the analyzed patient, keyed by feature name. */
  overrides: Record<string, FeatureValue>;
  /** Model output for the modified inputs; null until something has been changed. */
  result: PredictionResponse | null;
  status: "idle" | "loading" | "success" | "error";
  error: PredictionFailure | null;
}

/**
 * Exploratory model simulation: re-runs the models with some inputs changed.
 *
 * It measures how sensitive the models are to their inputs. It says nothing
 * about what would happen to a patient if a value were changed.
 */
export function useWhatIf(baseline: PatientFeatures | null, api: Api = defaultApi) {
  const [active, setActive] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, FeatureValue>>({});
  const [result, setResult] = useState<PredictionResponse | null>(null);
  const [status, setStatus] = useState<WhatIfState["status"]>("idle");
  const [error, setError] = useState<PredictionFailure | null>(null);
  const latest = useRef(0);

  // A new analysis (or none) invalidates any simulation built on the previous one.
  useEffect(() => {
    latest.current += 1;
    setOverrides({});
    setResult(null);
    setStatus("idle");
    setError(null);
    if (!baseline) setActive(false);
  }, [baseline]);

  const changed = useMemo(
    () => Object.keys(overrides).filter((name) => baseline && overrides[name] !== baseline[name]),
    [overrides, baseline],
  );

  useEffect(() => {
    if (!active || !baseline) return;
    const requestId = ++latest.current;
    if (changed.length === 0) {
      setResult(null);
      setStatus("idle");
      setError(null);
      return;
    }
    setStatus("loading");
    const timer = setTimeout(() => {
      api
        .predict({ ...baseline, ...overrides })
        .then((prediction) => {
          if (requestId !== latest.current) return;
          setResult(prediction);
          setStatus("success");
          setError(null);
        })
        .catch((failure: unknown) => {
          if (requestId !== latest.current) return;
          setResult(null);
          setStatus("error");
          setError(toFailure(failure));
        });
    }, WHAT_IF_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [api, active, baseline, overrides, changed]);

  const setOverride = useCallback((name: string, value: FeatureValue) => {
    setOverrides((current) => ({ ...current, [name]: value }));
  }, []);

  const reset = useCallback(() => setOverrides({}), []);

  const toggle = useCallback(() => setActive((value) => !value), []);

  return { active, toggle, setActive, overrides, changed, setOverride, reset, result, status, error };
}

export type WhatIf = ReturnType<typeof useWhatIf>;
