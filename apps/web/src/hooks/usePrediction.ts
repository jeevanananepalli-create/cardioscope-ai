"use client";

import { useCallback, useRef, useState } from "react";

import { type Api, ApiError, api as defaultApi, describeError } from "@/lib/api";
import type { PatientFeatures } from "@/types/patient";
import type { PredictionResponse } from "@/types/prediction";

export interface PredictionFailure {
  kind: ApiError["kind"] | "unknown";
  message: string;
  details: { field: string; message: string }[];
}

export interface PredictionState {
  status: "idle" | "loading" | "success" | "error";
  /** The most recent successful prediction; kept while a new request is in flight. */
  prediction: PredictionResponse | null;
  /** The inputs that produced `prediction`. */
  features: PatientFeatures | null;
  error: PredictionFailure | null;
}

const INITIAL: PredictionState = { status: "idle", prediction: null, features: null, error: null };

export function toFailure(error: unknown): PredictionFailure {
  if (error instanceof ApiError) {
    return { kind: error.kind, message: error.message, details: error.details };
  }
  return { kind: "unknown", message: describeError(error), details: [] };
}

/** Runs predictions and keeps the latest result. Out-of-order responses are discarded. */
export function usePrediction(api: Api = defaultApi) {
  const [state, setState] = useState<PredictionState>(INITIAL);
  const latestRequest = useRef(0);

  const analyze = useCallback(
    async (features: PatientFeatures): Promise<PredictionResponse | null> => {
      const requestId = ++latestRequest.current;
      setState((current) => ({ ...current, status: "loading", error: null }));
      try {
        const prediction = await api.predict(features);
        if (requestId !== latestRequest.current) return null;
        setState({ status: "success", prediction, features, error: null });
        return prediction;
      } catch (error) {
        if (requestId !== latestRequest.current) return null;
        // A failed request must not leave a stale result looking current.
        setState({ status: "error", prediction: null, features: null, error: toFailure(error) });
        return null;
      }
    },
    [api],
  );

  const reset = useCallback(() => {
    latestRequest.current += 1;
    setState(INITIAL);
  }, []);

  return { ...state, analyze, reset };
}
