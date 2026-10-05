import { defineConfig } from "@playwright/test";

/**
 * End-to-end tests against the real API and the real web app.
 *
 * Both servers are started if they are not already running. The API needs trained
 * models (`python -m ml.scripts.train_all`), which in turn need the dataset.
 *
 * Locally the installed Chrome is used, so no browser download is needed. Set
 * E2E_BROWSER_CHANNEL=chromium (after `npx playwright install chromium`) to use
 * Playwright's own browser, as CI does.
 */
const channel = process.env.E2E_BROWSER_CHANNEL ?? "chrome";
const python = process.env.E2E_PYTHON ?? (process.platform === "win32" ? ".venv\\Scripts\\python.exe" : ".venv/bin/python");

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    viewport: { width: 1440, height: 900 },
    ...(channel === "chromium" ? {} : { channel }),
    // Software WebGL so the 3D view renders on machines and CI runners without a GPU.
    launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] },
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: `${python} -m uvicorn apps.api.app.main:app --port 8000`,
      cwd: "../..",
      url: "http://localhost:8000/api/v1/health",
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: "npm run dev",
      url: "http://localhost:3000",
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
