"use client";

import { useCallback, useEffect, useState } from "react";

import { type Api, ApiError, api as defaultApi, describeError } from "@/lib/api";
import type { DemoProfiles, FeatureSchema } from "@/types/patient";
import type { ModelInfo } from "@/types/prediction";

export type ServiceData =
  | { state: "loading" }
  | { state: "error"; kind: ApiError["kind"] | "unknown"; message: string }
  | {
      state: "ready";
      schema: FeatureSchema;
      modelInfo: ModelInfo;
      modelsReady: boolean;
      /** Null if the demo profiles could not be loaded; the dashboard works without them. */
      demo: DemoProfiles | null;
    };

/** Loads what the dashboard needs before any prediction: feature schema and model info. */
export function useServiceData(api: Api = defaultApi): { data: ServiceData; reload: () => void } {
  const [data, setData] = useState<ServiceData>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setData({ state: "loading" });
    // Demo profiles are a convenience: if they fail to load, carry on without them.
    const demoProfiles = api.demoProfiles().catch(() => null);
    Promise.all([api.featureSchema(), api.modelInfo(), demoProfiles])
      .then(([schema, modelInfo, demo]) => {
        if (cancelled) return;
        const modelsReady = Object.values(modelInfo.models_available ?? {}).every(Boolean);
        setData({ state: "ready", schema, modelInfo, modelsReady, demo });
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
