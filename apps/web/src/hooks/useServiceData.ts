"use client";

import { useCallback, useEffect, useState } from "react";

import { type Api, ApiError, api as defaultApi, describeError } from "@/lib/api";
import type { FeatureSchema } from "@/types/patient";
import type { ModelInfo } from "@/types/prediction";

export type ServiceData =
  | { state: "loading" }
  | { state: "error"; kind: ApiError["kind"] | "unknown"; message: string }
  | { state: "ready"; schema: FeatureSchema; modelInfo: ModelInfo; modelsReady: boolean };

/** Loads what the dashboard needs before any prediction: feature schema and model info. */
export function useServiceData(api: Api = defaultApi): { data: ServiceData; reload: () => void } {
  const [data, setData] = useState<ServiceData>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setData({ state: "loading" });
    Promise.all([api.featureSchema(), api.modelInfo()])
      .then(([schema, modelInfo]) => {
        if (cancelled) return;
        const modelsReady = Object.values(modelInfo.models_available ?? {}).every(Boolean);
        setData({ state: "ready", schema, modelInfo, modelsReady });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setData({
          state: "error",
          kind: error instanceof ApiError ? error.kind : "unknown",
          message: describeError(error),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [api, attempt]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);
  return { data, reload };
}
