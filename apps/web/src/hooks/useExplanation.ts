"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { type Api, api as defaultApi } from "@/lib/api";
import { type PredictionFailure, toFailure } from "@/hooks/usePrediction";
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
 * One request (all four models) is made per set of inputs, and only when
 * `enabled`; passing `features = null` clears the explanation.
 */
export function useExplanation(features: PatientFeatures | null, enabled = true, api: Api = defaultApi) {
  const [state, setState] = useState<ExplanationState>(IDLE);
  const [attempt, setAttempt] = useState(0);
  const latest = useRef(0);

  useEffect(() => {
    const requestId = ++latest.current;
    if (!features || !enabled) {
      setState(IDLE);
      return;
    }
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
