/**
 * End to end: patient input -> API -> prediction -> dashboard -> 3D update.
 *
 * Runs against the real API with the real trained models. Nothing is mocked except
 * where a test deliberately breaks the network to check an error state.
 */
import { expect, type Page, test } from "@playwright/test";

const API = "http://localhost:8000/api/v1";

const RISK_COLORS: Record<string, string> = {
  low: "rgb(47, 158, 110)",
  moderate: "rgb(217, 165, 20)",
  high: "rgb(224, 117, 45)",
  very_high: "rgb(207, 63, 63)",
};

interface Output {
  probability: number;
  risk_category: string;
  predicted_label: string;
}

interface Prediction {
  cad: Output;
  vessels: Record<"LAD" | "LCX" | "RCA", Output>;
}

function percent(probability: number): string {
  const text = (probability * 100).toFixed(0);
  if (Number(text) >= 100 && probability < 1) return ">99%";
  if (Number(text) <= 0 && probability > 0) return "<1%";
  return `${text}%`;
}

async function open(page: Page) {
  await page.goto("/");
  // The site opens on the landing page.
  await page.getByRole("button", { name: "Start Analysis" }).click();
  await expect(page.getByRole("button", { name: "Analyze Patient" })).toBeVisible();
}

/** Fill the form, analyze, and return what the API actually answered. */
async function analyzeTypical(page: Page): Promise<Prediction> {
  await page.getByRole("button", { name: "Fill typical values" }).click();
  const response = page.waitForResponse((r) => r.url().endsWith("/predict") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Analyze Patient" }).click();
  const prediction = (await (await response).json()) as Prediction;
  await expect(page.getByTestId("cad-probability")).toBeVisible();
  return prediction;
}

test.beforeAll(async ({ request }) => {
  const health = await request.get(`${API}/health`);
  expect(health.ok(), "the API must be running").toBeTruthy();
  expect((await health.json()).status, "the API must have all four trained models").toBe("ok");
});

test("safety disclaimer is visible as soon as the app opens", async ({ page }) => {
  await open(page);
  const note = page.getByRole("note", { name: "Safety disclaimer" });
  await expect(note).toBeVisible();
  await expect(note).toContainText("It is not a medical device");
  await expect(note).toContainText("does not replace professional clinical evaluation");
  await expect(page.getByText("Models ready")).toBeVisible();
});

test("patient input reaches the API and the dashboard shows exactly what the models returned", async ({ page }) => {
  await open(page);
  const prediction = await analyzeTypical(page);

  await expect(page.getByTestId("cad-probability")).toHaveText(percent(prediction.cad.probability));
  await expect(page.getByText(prediction.cad.predicted_label, { exact: true }).first()).toBeVisible();
  for (const vessel of ["LAD", "LCX", "RCA"] as const) {
    await expect(page.getByTestId(`${vessel}-probability`)).toHaveText(percent(prediction.vessels[vessel].probability));
  }
  await expect(page.getByText(/not clinically validated risk thresholds/)).toBeVisible();
});

test("the 3D view renders and its vessels take the colour of the predicted category", async ({ page }) => {
  await open(page);
  const stage = page.getByTestId("anatomy-stage");
  await expect(stage.locator("canvas")).toBeVisible();
  await expect(stage.getByText("Loading anatomy…")).toBeHidden({ timeout: 30_000 });

  const lad = page.getByRole("button", { name: /^LAD/ }).first();
  await expect(lad).toHaveAccessibleName("LAD, no prediction yet");

  const prediction = await analyzeTypical(page);
  for (const vessel of ["LAD", "LCX", "RCA"] as const) {
    const output = prediction.vessels[vessel];
    const chip = page.locator(".vessel-chip", { hasText: vessel });
    await expect(chip).toHaveAttribute("data-category", output.risk_category);
    await expect(chip.locator(".vessel-chip__dot")).toHaveCSS("background-color", RISK_COLORS[output.risk_category]!);
    await expect(chip).toContainText(percent(output.probability));
  }

  // The canvas has really drawn something. A flat background compresses to a tiny PNG;
  // a rendered heart with vessels does not.
  const blank = await page.getByRole("note", { name: "Safety disclaimer" }).screenshot();
  const rendered = await stage.locator("canvas").screenshot();
  expect(rendered.length, "the 3D canvas should contain more than a flat background").toBeGreaterThan(
    Math.max(20_000, blank.length),
  );

  await expect(page.getByText(/not this patient’s heart or vessels/)).toBeVisible();
  await expect(page.getByRole("link", { name: /BodyParts3D/ }).first()).toBeVisible();
});

test("selecting a vessel shows its prediction and a non-causal explanation", async ({ page }) => {
  await open(page);
  const prediction = await analyzeTypical(page);

  await page.locator(".vessel-chip", { hasText: "LAD" }).click();
  const detail = page.getByTestId("vessel-detail");
  await expect(detail).toContainText("Left anterior descending artery");
  await expect(detail).toContainText(prediction.vessels.LAD.predicted_label);
  await expect(detail.getByRole("row")).toHaveCount(5); // header + four top contributors
  await expect(detail).toContainText("do not indicate a lesion");

  await expect(page.getByRole("tab", { name: /^LAD/ })).toHaveAttribute("aria-selected", "true");
  const contributions = page.getByRole("list", { name: /contributions to the LAD model/ });
  await expect(contributions.getByRole("listitem")).toHaveCount(10);

  const text = (await page.locator("body").innerText()).toLowerCase();
  for (const banned of ["diagnosis confirmed", "proves that", "is blocked", "blockage detected"]) {
    expect(text).not.toContain(banned);
  }
});

test("what-if mode re-runs the models and labels the result as exploratory", async ({ page }) => {
  await open(page);
  const baseline = await analyzeTypical(page);

  await page.getByRole("tab", { name: /What-if simulation/ }).click();
  const panel = page.getByRole("tabpanel", { name: /What-if simulation/ });
  await expect(panel.getByText("Exploratory model simulation")).toBeVisible();
  await expect(panel.getByText(/not treatment advice/)).toBeVisible();
  await panel.getByRole("button", { name: "Turn on what-if mode" }).click();

  const response = page.waitForResponse((r) => r.url().endsWith("/predict") && r.request().method() === "POST");
  await panel.getByRole("combobox", { name: "Typical chest pain" }).selectOption({ label: "No" });
  const simulated = (await (await response).json()) as Prediction;

  const cadRow = page.getByTestId("comparison-CAD");
  await expect(cadRow).toContainText(percent(baseline.cad.probability));
  await expect(cadRow).toContainText(percent(simulated.cad.probability));
  expect(simulated.cad.probability).not.toBe(baseline.cad.probability);

  await expect(page.getByTestId("anatomy-stage").getByText("Exploratory model simulation")).toBeVisible();
  await expect(page.locator(".vessel-chip", { hasText: "LAD" })).toContainText(percent(simulated.vessels.LAD.probability));
  // The risk summary still reports the analyzed patient.
  await expect(page.getByTestId("cad-probability")).toHaveText(percent(baseline.cad.probability));
});

test("model performance shows the metrics served by the API", async ({ page, request }) => {
  const info = await (await request.get(`${API}/model-info`)).json();
  await open(page);
  await page.getByRole("tab", { name: "Model performance" }).click();
  for (const target of ["CAD", "LAD", "LCX", "RCA"]) {
    const metrics = info.targets[target].holdout.metrics;
    await expect(page.getByTestId(`holdout-${target}-roc_auc`)).toContainText(metrics.roc_auc.toFixed(3));
    await expect(page.getByTestId(`holdout-${target}-accuracy`)).toContainText(metrics.accuracy.toFixed(3));
  }
  await expect(page.getByText(/not evidence of clinical performance/)).toBeVisible();
});

test("invalid input is explained and never sent", async ({ page }) => {
  await open(page);
  let requests = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/predict")) requests += 1;
  });
  await page.getByRole("button", { name: "Analyze Patient" }).click();
  await expect(page.getByText("Age is required.")).toBeVisible();

  await page.getByRole("button", { name: "Fill typical values" }).click();
  await page.getByLabel(/^Age/).fill("500");
  await page.getByRole("button", { name: "Analyze Patient" }).click();
  await expect(page.getByText("Age must be between 18 and 110 years.")).toBeVisible();
  await expect(page.getByLabel(/^Age/)).toHaveValue("500");
  expect(requests).toBe(0);
});

test("an unreachable backend produces a clear message, not a blank screen", async ({ page }) => {
  await open(page);
  await page.route("**/api/v1/predict", (route) => route.abort("connectionrefused"));
  await page.getByRole("button", { name: "Fill typical values" }).click();
  await page.getByRole("button", { name: "Analyze Patient" }).click();
  await expect(page.getByText("The prediction service is not reachable.")).toBeVisible();
  await expect(page.getByRole("note", { name: "Safety disclaimer" })).toBeVisible();
  await expect(page.getByTestId("cad-probability")).toHaveCount(0);

  await page.unroute("**/api/v1/predict");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByTestId("cad-probability")).toBeVisible();
});

test("demo mode loads a labelled synthetic profile and shows the models' real output for it", async ({ page, request }) => {
  const demo = await (await request.get(`${API}/demo-profiles`)).json();
  const profile = demo.profiles.find((p: { id: string }) => p.id === "demo-b");
  const expected = (await (await request.post(`${API}/predict`, { data: { features: profile.features } })).json()) as Prediction;

  await open(page);
  const section = page.getByRole("region", { name: "Demo mode" });
  await expect(section.getByText("Synthetic · not real patients")).toBeVisible();
  await section.getByRole("button", { name: profile.name }).click();

  await expect(page.getByTestId("cad-probability")).toHaveText(percent(expected.cad.probability));
  await expect(page.getByText("Synthetic demo profile")).toBeVisible();
  await expect(page.getByText(expected.cad.predicted_label, { exact: true }).first()).toBeVisible();
  for (const vessel of ["LAD", "LCX", "RCA"] as const) {
    await expect(page.locator(".vessel-chip", { hasText: vessel })).toHaveAttribute(
      "data-category",
      expected.vessels[vessel].risk_category,
    );
  }
});

test("blood flow animates when on, is still when off, and is labelled illustrative", async ({ page }) => {
  await open(page);
  const stage = page.getByTestId("anatomy-stage");
  await expect(stage.getByText("Loading anatomy…")).toBeHidden({ timeout: 30_000 });
  const canvas = stage.locator("canvas");
  const flow = page.getByRole("checkbox", { name: "Blood flow" });
  await expect(flow).toBeChecked();
  await expect(page.getByText(/blood-flow animation is illustrative/)).toBeVisible();
  await expect(page.getByText(/is not affected by any prediction/)).toBeVisible();

  // Two frames a moment apart differ while the animation runs...
  const first = await canvas.screenshot();
  await page.waitForTimeout(450);
  const second = await canvas.screenshot();
  expect(first.equals(second), "the canvas should change between frames while blood flow is on").toBe(false);

  // ...and are identical once it is switched off.
  await flow.uncheck();
  // The scene may still be finishing a frame, so wait until two frames a moment apart match.
  await expect
    .poll(
      async () => {
        const third = await canvas.screenshot();
        await page.waitForTimeout(450);
        const fourth = await canvas.screenshot();
        return third.equals(fourth);
      },
      { message: "the canvas should be still while blood flow is off", timeout: 12_000 },
    )
    .toBe(true);
});

test("realistic colours can be switched to muted context colours", async ({ page }) => {
  await open(page);
  const stage = page.getByTestId("anatomy-stage");
  await expect(stage.getByText("Loading anatomy…")).toBeHidden({ timeout: 30_000 });
  await page.getByRole("checkbox", { name: "Blood flow" }).uncheck();
  const realistic = page.getByRole("checkbox", { name: "Realistic colours" });
  await expect(realistic).toBeChecked();
  await expect(page.getByText(/red for vessels carrying oxygenated blood/)).toBeVisible();
  await page.waitForTimeout(400);
  const before = await stage.locator("canvas").screenshot();
  await realistic.uncheck();
  await expect(page.getByText(/only model output is coloured/)).toBeVisible();
  await page.waitForTimeout(600);
  const after = await stage.locator("canvas").screenshot();
  expect(before.equals(after)).toBe(false);
});
