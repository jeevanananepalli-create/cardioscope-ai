import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

// jsdom has no WebGL. By default the canvas reports that, so components take their
// "3D unavailable" path; tests that exercise the scene stub getContext themselves.
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => null);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
