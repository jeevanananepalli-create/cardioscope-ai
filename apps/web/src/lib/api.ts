import { API_BASE_URL, API_TIMEOUT_MS } from "@/lib/constants";
import type { DemoProfiles, FeatureSchema, PatientFeatures } from "@/types/patient";
import type {
  ExplanationResponse,
  HealthResponse,
  ModelInfo,
  PredictionResponse,
  TargetName,
  TargetPrediction,
} from "@/types/prediction";

export type ApiErrorKind =
  | "network" // backend unreachable or timed out
  | "model_unavailable" // backend up, models not trained/loaded
  | "invalid_input" // request rejected by validation
  | "malformed_response" // response was not the expected shape
  | "explanation_failed"
  | "server";

export interface ApiFieldError {
  field: string;
  message: string;
}

/** Every failure of an API call, with a message that is safe to show to the user. */
export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly details: ApiFieldError[];
  readonly status: number | null;

  constructor(kind: ApiErrorKind, message: string, details: ApiFieldError[] = [], status: number | null = null) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.details = details;
    this.status = status;
  }
}

const KIND_BY_CODE: Record<string, ApiErrorKind> = {
  MODEL_UNAVAILABLE: "model_unavailable",
  INVALID_INPUT: "invalid_input",
  EXPLANATION_FAILED: "explanation_failed",
};

const NETWORK_MESSAGE =
  "The prediction service could not be reached. Check that the API is running, then try again.";
const MALFORMED_MESSAGE =
  "The prediction service returned a response this application does not understand. " +
  "The API and the dashboard may be different versions.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isProbability(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isTargetPrediction(value: unknown): value is TargetPrediction {
  return (
    isRecord(value) &&
    typeof value.target === "string" &&
    isProbability(value.probability) &&
    (value.predicted_class === 0 || value.predicted_class === 1) &&
    typeof value.predicted_label === "string" &&
    isProbability(value.decision_threshold) &&
    typeof value.risk_category === "string"
  );
}

export function isPredictionResponse(value: unknown): value is PredictionResponse {
  if (!isRecord(value) || !isRecord(value.vessels)) return false;
  const vessels = value.vessels;
  return (
    typeof value.model_version === "string" &&
    isTargetPrediction(value.cad) &&
    (["LAD", "LCX", "RCA"] as const).every((name) => isTargetPrediction(vessels[name])) &&
    Array.isArray(value.warnings)
  );
}

export function isExplanationResponse(value: unknown): value is ExplanationResponse {
  if (!isRecord(value) || !isRecord(value.explanations)) return false;
  return Object.values(value.explanations).every(
    (explanation) =>
      isRecord(explanation) &&
      Array.isArray(explanation.contributions) &&
      explanation.contributions.every(
        (c) => isRecord(c) && typeof c.feature === "string" && typeof c.shap_value === "number",
      ),
  );
}

export function isFeatureSchema(value: unknown): value is FeatureSchema {
  return (
    isRecord(value) &&
    Array.isArray(value.groups) &&
    Array.isArray(value.features) &&
    value.features.every((f) => isRecord(f) && typeof f.name === "string" && typeof f.kind === "string")
  );
}

export function isDemoProfiles(value: unknown): value is DemoProfiles {
  return (
    isRecord(value) &&
    typeof value.note === "string" &&
    Array.isArray(value.profiles) &&
    value.profiles.every(
      (p) => isRecord(p) && typeof p.id === "string" && typeof p.name === "string" && p.synthetic === true && isRecord(p.features),
    )
  );
}

export function isModelInfo(value: unknown): value is ModelInfo {
  return isRecord(value) && isRecord(value.targets) && Array.isArray(value.risk_categories);
}

function isHealth(value: unknown): value is HealthResponse {
  return isRecord(value) && (value.status === "ok" || value.status === "degraded") && isRecord(value.models);
}

async function toApiError(response: Response): Promise<ApiError> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // fall through to the generic message
  }
  const error = isRecord(body) && isRecord(body.error) ? body.error : null;
  const code = error && typeof error.code === "string" ? error.code : "";
  const message =
    error && typeof error.message === "string"
      ? error.message
      : "The prediction service reported an error. Please try again.";
  const details = Array.isArray(error?.details)
    ? error.details.filter(
        (d): d is ApiFieldError => isRecord(d) && typeof d.field === "string" && typeof d.message === "string",
      )
    : [];
  return new ApiError(KIND_BY_CODE[code] ?? "server", message, details, response.status);
}

async function request<T>(
  path: string,
  guard: (value: unknown) => value is T,
  init?: RequestInit,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiError("network", NETWORK_MESSAGE);
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) throw await toApiError(response);
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ApiError("malformed_response", MALFORMED_MESSAGE, [], response.status);
  }
  if (!guard(body)) throw new ApiError("malformed_response", MALFORMED_MESSAGE, [], response.status);
  return body;
}

function post(body: unknown): RequestInit {
  return { method: "POST", body: JSON.stringify(body) };
}

export const api = {
  health: () => request("/health", isHealth),
  featureSchema: () => request("/feature-schema", isFeatureSchema),
  modelInfo: () => request("/model-info", isModelInfo),
  demoProfiles: () => request("/demo-profiles", isDemoProfiles),
  predict: (features: PatientFeatures) => request("/predict", isPredictionResponse, post({ features })),
  explain: (features: PatientFeatures, targets?: TargetName[]) =>
    request("/explain", isExplanationResponse, post(targets ? { features, targets } : { features })),
};

export type Api = typeof api;

/** A user-facing message for any thrown value. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return "Something went wrong. Please try again.";
}
