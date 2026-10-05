import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AnatomyViewer } from "@/components/anatomy/AnatomyViewer";
import { useAnatomy } from "@/hooks/useAnatomy";
import {
  heartProfile,
  heartRadius,
  heartSurfacePoint,
  PLACEHOLDER_NOTICE,
  VESSEL_PATHS,
  vesselVisualStates,
} from "@/lib/anatomy";
import { FALLBACK_RISK_CATEGORIES, NO_PREDICTION_COLOR, RISK_COLORS } from "@/lib/constants";
import type { AnatomySceneProps, AnatomySource } from "@/types/anatomy";
import type { TargetPrediction, VesselName } from "@/types/prediction";

import { predictionFixture } from "./fixtures";

// The WebGL scene cannot run in jsdom. This stand-in exposes exactly what the scene is told
// to draw, and lets a test trigger the same callbacks a pointer would.
vi.mock("@/components/anatomy/AnatomyScene", () => ({
  default: (props: AnatomySceneProps & { onAssetError: () => void }) => (
    <div
      data-testid="scene"
      data-mode={props.mode}
      data-source={props.source.kind}
      data-selected={props.selected ?? ""}
      data-hovered={props.hovered ?? ""}
      data-reset={props.resetSignal}
    >
      {(["LAD", "LCX", "RCA"] as const).map((name) => (
        <button
          key={name}
          data-testid={`mesh-${name}`}
          data-color={props.vessels[name].color}
          data-category={props.vessels[name].category ?? ""}
          onClick={() => props.onSelect(name)}
          onMouseEnter={() => props.onHover(name)}
        >
          mesh {name}
        </button>
      ))}
      <button onClick={() => props.onSelect(null)}>empty space</button>
      <button onClick={props.onAssetError}>fail asset</button>
    </div>
  ),
}));

function enableWebgl() {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => ({}) as unknown as RenderingContext,
  );
}

function Harness({
  vessels,
  source,
}: {
  vessels: Record<VesselName, TargetPrediction> | null;
  source?: AnatomySource;
}) {
  const anatomy = useAnatomy();
  return (
    <>
      <AnatomyViewer vessels={vessels} categories={FALLBACK_RISK_CATEGORIES} anatomy={anatomy} source={source} />
      <output data-testid="selected">{anatomy.selected ?? "none"}</output>
    </>
  );
}

describe("vessel visual state", () => {
  it("is neutral before any prediction", () => {
    const states = vesselVisualStates(null, FALLBACK_RISK_CATEGORIES);
    for (const name of ["LAD", "LCX", "RCA"] as const) {
      expect(states[name]).toMatchObject({ probability: null, category: null, color: NO_PREDICTION_COLOR });
    }
  });

  it("maps each probability to its band colour", () => {
    const states = vesselVisualStates(predictionFixture().vessels, FALLBACK_RISK_CATEGORIES);
    expect(states.LAD).toMatchObject({ probability: 0.84, category: "very_high", color: RISK_COLORS.very_high });
    expect(states.LCX).toMatchObject({ category: "moderate", color: RISK_COLORS.moderate });
    expect(states.RCA).toMatchObject({ category: "low", color: RISK_COLORS.low });
  });

  it("follows reconfigured thresholds", () => {
    const strict = [
      { key: "low" as const, label: "Low", min: 0, max: 0.05 },
      { key: "moderate" as const, label: "Moderate", min: 0.05, max: 0.1 },
      { key: "high" as const, label: "High", min: 0.1, max: 0.2 },
      { key: "very_high" as const, label: "Very high", min: 0.2, max: 1 },
    ];
    expect(vesselVisualStates(predictionFixture().vessels, strict).RCA.category).toBe("high");
  });
});

describe("schematic geometry", () => {
  it("draws three distinct vessel paths on the heart surface", () => {
    const starts = new Set(Object.values(VESSEL_PATHS).map((p) => p[p.length - 1]!.join(",")));
    expect(starts.size).toBe(3);
    for (const points of Object.values(VESSEL_PATHS)) {
      expect(points.length).toBeGreaterThanOrEqual(4);
      for (const [x, y, z] of points) {
        expect(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)).toBe(true);
        expect(Math.abs(y)).toBeLessThanOrEqual(1.1);
      }
    }
  });

  it("keeps vessel points just outside the heart surface", () => {
    const [x, y, z] = heartSurfacePoint(40, 0.5);
    expect(Math.hypot(x, z)).toBeGreaterThan(heartRadius(0.5));
    expect(y).toBeCloseTo(0, 6);
    expect(heartProfile()[0]![0]).toBe(0);
  });
});

describe("AnatomyViewer", () => {
  it("renders the scene with neutral vessels and the placeholder label before prediction", async () => {
    enableWebgl();
    render(<Harness vessels={null} />);
    const scene = await screen.findByTestId("scene");
    expect(scene).toHaveAttribute("data-source", "placeholder");
    expect(screen.getByTestId("mesh-LAD")).toHaveAttribute("data-color", NO_PREDICTION_COLOR);
    expect(screen.getByText(new RegExp(PLACEHOLDER_NOTICE.slice(0, 40)))).toBeInTheDocument();
    expect(screen.getByText(/not medical imaging/)).toBeInTheDocument();
  });

  it("colours each vessel from its predicted probability and updates when predictions change", async () => {
    enableWebgl();
    const { rerender } = render(<Harness vessels={predictionFixture().vessels} />);
    await screen.findByTestId("scene");
    expect(screen.getByTestId("mesh-LAD")).toHaveAttribute("data-color", RISK_COLORS.very_high);
    expect(screen.getByTestId("mesh-LCX")).toHaveAttribute("data-color", RISK_COLORS.moderate);
    expect(screen.getByTestId("mesh-RCA")).toHaveAttribute("data-color", RISK_COLORS.low);
    expect(screen.getByRole("button", { name: /LAD 84%/ })).toBeInTheDocument();

    rerender(<Harness vessels={predictionFixture({ CAD: 0.3, LAD: 0.2, LCX: 0.9, RCA: 0.6 }).vessels} />);
    expect(screen.getByTestId("mesh-LAD")).toHaveAttribute("data-color", RISK_COLORS.low);
    expect(screen.getByTestId("mesh-LCX")).toHaveAttribute("data-color", RISK_COLORS.very_high);
    expect(screen.getByTestId("mesh-RCA")).toHaveAttribute("data-color", RISK_COLORS.high);
    expect(screen.getByRole("button", { name: /LCX 90%/ })).toBeInTheDocument();
  });

  it("selects a vessel from the 3D scene and from the vessel buttons", async () => {
    enableWebgl();
    render(<Harness vessels={predictionFixture().vessels} />);
    await screen.findByTestId("scene");
    await userEvent.click(screen.getByTestId("mesh-LCX"));
    expect(screen.getByTestId("selected")).toHaveTextContent("LCX");
    expect(screen.getByRole("button", { name: /LCX 41%/ })).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(screen.getByRole("button", { name: /RCA 12%/ }));
    expect(screen.getByTestId("scene")).toHaveAttribute("data-selected", "RCA");

    await userEvent.click(screen.getByRole("button", { name: /RCA 12%/ }));
    expect(screen.getByTestId("selected")).toHaveTextContent("none");

    await userEvent.click(screen.getByTestId("mesh-LAD"));
    await userEvent.click(screen.getByText("empty space"));
    expect(screen.getByTestId("selected")).toHaveTextContent("none");
  });

  it("tracks hover from the scene and from the buttons", async () => {
    enableWebgl();
    render(<Harness vessels={predictionFixture().vessels} />);
    await screen.findByTestId("scene");
    await userEvent.hover(screen.getByTestId("mesh-LAD"));
    expect(screen.getByRole("button", { name: /LAD 84%/ })).toHaveAttribute("data-hovered", "true");
    await userEvent.hover(screen.getByRole("button", { name: /RCA 12%/ }));
    expect(screen.getByTestId("scene")).toHaveAttribute("data-hovered", "RCA");
  });

  it("switches between heart focus and torso context, and resets the camera", async () => {
    enableWebgl();
    render(<Harness vessels={null} />);
    const scene = await screen.findByTestId("scene");
    expect(scene).toHaveAttribute("data-mode", "heart");
    await userEvent.click(screen.getByRole("button", { name: "Torso context" }));
    expect(scene).toHaveAttribute("data-mode", "torso");
    expect(screen.getByRole("button", { name: "Torso context" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Reset view" }));
    expect(scene).toHaveAttribute("data-reset", "1");
  });

  it("falls back to the placeholder and says so when a supplied asset fails to load", async () => {
    enableWebgl();
    const source: AnatomySource = {
      kind: "gltf",
      url: "/models/heart/missing.glb",
      attribution: "Test asset",
      nodes: { heart: [], torso: [], vessels: { LAD: ["LAD"], LCX: ["LCX"], RCA: ["RCA"] } },
    };
    render(<Harness vessels={predictionFixture().vessels} source={source} />);
    const scene = await screen.findByTestId("scene");
    expect(scene).toHaveAttribute("data-source", "gltf");
    await userEvent.click(screen.getByText("fail asset"));
    expect(screen.getByText("The 3D anatomy asset could not be loaded.")).toBeInTheDocument();
    expect(screen.getByTestId("scene")).toHaveAttribute("data-source", "placeholder");
    expect(screen.getByTestId("mesh-LAD")).toHaveAttribute("data-color", RISK_COLORS.very_high);
  });

  it("stays usable without WebGL", async () => {
    render(<Harness vessels={predictionFixture().vessels} />);
    await waitFor(() =>
      expect(screen.getByText("The 3D view is not available in this browser.")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("scene")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /LAD 84%/ }));
    expect(screen.getByTestId("selected")).toHaveTextContent("LAD");
  });
});
