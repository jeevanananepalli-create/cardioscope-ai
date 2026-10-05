"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { type PredictionFailure, toFailure } from "@/hooks/usePrediction";
import { type Api, api as defaultApi } from "@/lib/api";
import type { PatientFeatures } from "@/types/patient";
import type { ExplanationResponse } from "@/types/prediction";

export interface ExplanationState {
  status: "idle" | "loading" | "success" | "error";
  explanation: ExplanationResponse | null;
  error: PredictionFailure | null;
}

const IDLE: ExplanationState = { status: "idle", explanation: null, error: null };

/**
 * SHAP explanations for the inputs behind the current prediction.
 *
 * SHAP is the most expensive call the dashboard makes, so it is requested at most
 * once per set of inputs (one request covers all four models), and only while
 * `enabled`, i.e. while something on screen shows it. A result already fetched is
 * kept when `enabled` goes false, so returning to it costs nothing.
 */
export function useExplanation(features: PatientFeatures | null, enabled = true, api: Api = defaultApi) {
  const [state, setState] = useState<ExplanationState>(IDLE);
  const [attempt, setAttempt] = useState(0);
  const latest = useRef(0);
  const requested = useRef<{ features: PatientFeatures | null; attempt: number }>({ features: null, attempt: 0 });

  useEffect(() => {
    const sameInputs = requested.current.features === features;
    if (!features) {
      latest.current += 1;
      requested.current = { features: null, attempt };
      setState(IDLE);
      return;
    }
    if (sameInputs && requested.current.attempt === attempt) return;
    if (!enabled) {
      // New inputs, but nothing is showing the explanation: drop the stale one and wait.
      if (!sameInputs) {
        latest.current += 1;
        setState(IDLE);
      }
      return;
    }
    const requestId = ++latest.current;
    requested.current = { features, attempt };
    setState({ status: "loading", explanation: null, error: null });
    api
      .explain(features)
      .then((explanation) => {
        if (requestId === latest.current) setState({ status: "success", explanation, error: null });
      })
      .catch((error: unknown) => {
        if (requestId === latest.current) {
          setState({ status: "error", explanation: null, error: toFailure(error) });
        }
      });
  }, [api, features, enabled, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { ...state, retry };
}
