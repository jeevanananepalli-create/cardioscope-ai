import { api, ApiError, isPredictionResponse } from "@/lib/api";

import { predictionFixture, validFeatures } from "./fixtures";

function respond(status: number, body: unknown): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }
  throw new Error("expected the call to fail");
}

describe("API client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("posts features to /predict and returns the validated response", async () => {
    const fetchMock = vi.fn(async () => respond(200, predictionFixture()));
    vi.stubGlobal("fetch", fetchMock);
    const result = await api.predict(validFeatures);
    expect(result.cad.probability).toBe(0.81);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/predict$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ features: validFeatures });
  });

  it("reports an unreachable backend as a network error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    const error = await failure(api.predict(validFeatures));
    expect(error.kind).toBe("network");
    expect(error.message).toMatch(/could not be reached/);
    expect(error.message).not.toMatch(/Failed to fetch/);
  });

  it("maps the API error envelope, including field details", async () => {
    const body = {
      error: {
        code: "INVALID_INPUT",
        message: "The request has 1 invalid field(s). Correct them and try again.",
        details: [{ field: "Age", message: "Must be at most 110." }],
      },
    };
    vi.stubGlobal("fetch", vi.fn(async () => respond(422, body)));
    const error = await failure(api.predict(validFeatures));
    expect(error.kind).toBe("invalid_input");
    expect(error.details).toEqual([{ field: "Age", message: "Must be at most 110." }]);
    expect(error.status).toBe(422);
  });

  it("recognises unavailable models", async () => {
    const body = { error: { code: "MODEL_UNAVAILABLE", message: "Prediction models are not available.", details: [] } };
    vi.stubGlobal("fetch", vi.fn(async () => respond(503, body)));
    expect((await failure(api.predict(validFeatures))).kind).toBe("model_unavailable");
  });

  it("does not surface raw server output for an unrecognised error body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond(500, "Traceback (most recent call last): boom")));
    const error = await failure(api.predict(validFeatures));
    expect(error.kind).toBe("server");
    expect(error.message).not.toMatch(/Traceback/);
  });

  it.each([
    ["not JSON", "<html>gateway</html>"],
    ["missing vessels", { model_version: "1", cad: predictionFixture().cad, warnings: [] }],
    ["probability out of range", { ...predictionFixture(), cad: { ...predictionFixture().cad, probability: 1.7 } }],
    ["probability as text", { ...predictionFixture(), cad: { ...predictionFixture().cad, probability: "high" } }],
    ["missing a vessel", { ...predictionFixture(), vessels: { LAD: predictionFixture().vessels.LAD } }],
  ])("rejects a malformed response: %s", async (_name, body) => {
    vi.stubGlobal("fetch", vi.fn(async () => respond(200, body)));
    const error = await failure(api.predict(validFeatures));
    expect(error.kind).toBe("malformed_response");
  });

  it("accepts a well-formed prediction", () => {
    expect(isPredictionResponse(predictionFixture())).toBe(true);
    expect(isPredictionResponse(null)).toBe(false);
  });
});
