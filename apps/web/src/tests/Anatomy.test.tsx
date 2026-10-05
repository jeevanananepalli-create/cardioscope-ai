import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AnatomyViewer } from "@/components/anatomy/AnatomyViewer";
import { useAnatomy } from "@/hooks/useAnatomy";
import asset from "@/lib/anatomyAsset.json";
import {
  ANATOMY_SOURCE,
  availableLayers,
  BODYPARTS3D_SOURCE,
  heartProfile,
  heartRadius,
  heartSurfacePoint,
  PLACEHOLDER_NOTICE,
  VESSEL_PATHS,
  vesselVisualStates,
} from "@/lib/anatomy";
import { FALLBACK_RISK_CATEGORIES, NO_PREDICTION_COLOR, RISK_COLORS } from "@/lib/constants";
import type { AnatomySource } from "@/types/anatomy";
import type { TargetPrediction, VesselName } from "@/types/prediction";

import { predictionFixture } from "./fixtures";
import { enableWebgl } from "./sceneMock";

vi.mock("@/components/anatomy/AnatomyScene", async () => import("./sceneMock"));

const PLACEHOLDER: AnatomySource = { kind: "placeholder" };

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
    render(<Harness vessels={null} source={PLACEHOLDER} />);
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
    const source: AnatomySource = { ...BODYPARTS3D_SOURCE, url: "/models/anatomy/missing.glb" };
    render(<Harness vessels={predictionFixture().vessels} source={source} />);
    const scene = await screen.findByTestId("scene");
    expect(scene).toHaveAttribute("data-source", "gltf");
    await userEvent.click(screen.getByText("fail asset"));
    expect(screen.getByText("The 3D anatomy asset could not be loaded.")).toBeInTheDocument();
    expect(screen.getByTestId("scene")).toHaveAttribute("data-source", "placeholder");
    expect(screen.getByTestId("mesh-LAD")).toHaveAttribute("data-color", RISK_COLORS.very_high);
    expect(screen.getByText(new RegExp(PLACEHOLDER_NOTICE.slice(0, 40)))).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /Arteries/ })).not.toBeInTheDocument();
  });

  it("uses the licensed anatomy by default, with its credit and a not-this-patient note", async () => {
    enableWebgl();
    render(<Harness vessels={null} />);
    const scene = await screen.findByTestId("scene");
    expect(scene).toHaveAttribute("data-source", "gltf");
    expect(screen.getByText("Loading anatomy…")).toBeInTheDocument();
    await userEvent.click(screen.getByText("asset loaded"));
    expect(screen.queryByText("Loading anatomy…")).not.toBeInTheDocument();
    const credit = screen.getByRole("link", { name: asset.attribution });
    expect(credit).toHaveAttribute("href", "https://creativecommons.org/licenses/by-sa/2.1/jp/");
    const contextCredit = screen.getByRole("link", { name: /Z-Anatomy/ });
    expect(contextCredit).toHaveTextContent("CC BY-SA 4.0");
    expect(contextCredit).toHaveTextContent("University of Dundee");
    expect(contextCredit).toHaveAttribute("href", "https://creativecommons.org/licenses/by-sa/4.0/");
    expect(screen.getByText(/Nerves are drawn thicker than life/)).toBeInTheDocument();
    expect(screen.getByText(/not this patient’s heart or vessels/)).toBeInTheDocument();
    expect(screen.getByText(/Only LAD, LCX and RCA are coloured by the models/)).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(PLACEHOLDER_NOTICE.slice(0, 40)))).not.toBeInTheDocument();
  });

  it("shows arteries by default and lets context layers be toggled", async () => {
    enableWebgl();
    render(<Harness vessels={predictionFixture().vessels} />);
    const scene = await screen.findByTestId("scene");
    expect(scene).toHaveAttribute("data-layers", "arteries");
    await userEvent.click(screen.getByRole("checkbox", { name: /Veins/ }));
    expect(scene).toHaveAttribute("data-layers", "arteries,veins");
    await userEvent.click(screen.getByRole("checkbox", { name: /Arteries/ }));
    expect(scene).toHaveAttribute("data-layers", "veins");
    // Context layers never change what the modelled vessels show.
    expect(screen.getByTestId("mesh-LAD")).toHaveAttribute("data-color", RISK_COLORS.very_high);
  });

  it("offers nervous system, skeleton and organ layers, off by default", async () => {
    enableWebgl();
    render(<Harness vessels={predictionFixture().vessels} />);
    const scene = await screen.findByTestId("scene");
    for (const name of [/Nervous system/, /Skeleton/, /Organs/]) {
      const box = screen.getByRole("checkbox", { name });
      expect(box).toBeEnabled();
      expect(box).not.toBeChecked();
    }
    await userEvent.click(screen.getByRole("checkbox", { name: /Nervous system/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Skeleton/ }));
    expect(scene).toHaveAttribute("data-layers", "arteries,nerves,skeleton");
    // Context layers never change what the modelled vessels show.
    expect(screen.getByTestId("mesh-LAD")).toHaveAttribute("data-color", RISK_COLORS.very_high);
    expect(availableLayers(BODYPARTS3D_SOURCE)).toEqual({
      arteries: true,
      veins: true,
      nerves: true,
      skeleton: true,
      organs: true,
    });
  });

  it("disables a layer the asset does not have", async () => {
    enableWebgl();
    const source: AnatomySource = { ...BODYPARTS3D_SOURCE, layerAssets: {} };
    render(<Harness vessels={null} source={source} />);
    await screen.findByTestId("scene");
    const nerves = screen.getByRole("checkbox", { name: /Nervous system/ });
    expect(nerves).toBeDisabled();
    expect(nerves).not.toBeChecked();
    expect(screen.getAllByText("(not available yet)")).toHaveLength(3);
    expect(screen.queryByRole("link", { name: /Z-Anatomy/ })).not.toBeInTheDocument();
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

describe("anatomy asset configuration", () => {
  it("maps the three modelled vessels to the nodes the build wrote", () => {
    expect(ANATOMY_SOURCE).toBe(BODYPARTS3D_SOURCE);
    for (const vessel of ["LAD", "LCX", "RCA"] as const) {
      const entry = asset.vessels[vessel];
      expect(BODYPARTS3D_SOURCE.nodes.vessels[vessel]).toEqual([entry.node]);
      expect(BODYPARTS3D_SOURCE.nodes.hit[vessel]).toEqual([entry.hit_node]);
      expect(Object.keys(asset.nodes)).toContain(entry.node);
      expect(BODYPARTS3D_SOURCE.labelAnchors[vessel]).toHaveLength(3);
    }
  });

  it("uses the anatomically named parts for each vessel", () => {
    const parts = (node: keyof typeof asset.nodes) => Object.values(asset.nodes[node].parts).join(" | ");
    expect(parts("coronary_LAD")).toMatch(/anterior interventricular branch of left coronary artery/);
    expect(parts("coronary_LCX")).toMatch(/circumflex branch of left coronary artery/);
    expect(parts("coronary_RCA")).toMatch(/trunk of right coronary artery/);
    expect(parts("coronary_RCA")).not.toMatch(/left coronary/);
  });

  it("carries the required attribution and stays within a browser-friendly size", () => {
    expect(asset.attribution).toBe(
      "BodyParts3D, © The Database Center for Life Science licensed under CC Attribution-Share Alike 2.1 Japan",
    );
    expect(asset.total_faces).toBeLessThan(200_000);
    expect(asset.file_bytes).toBeLessThan(6_000_000);
  });

  it("has a separate, lazily loaded file for each optional layer", () => {
    const layers = BODYPARTS3D_SOURCE.layerAssets;
    expect(Object.keys(layers).sort()).toEqual(["nerves", "organs", "skeleton"]);
    expect(layers.nerves!.url).toBe("/models/anatomy/layer-nervous-system.glb");
    expect(new Set(Object.values(layers).map((layer) => layer!.url)).size).toBe(3);
    expect(Object.keys(asset.layers.nerves.nodes).sort()).toEqual(["cns", "peripheral_nerves"]);
    for (const layer of Object.values(asset.layers)) {
      expect(layer.attribution).toMatch(/Z-Anatomy.*CC BY-SA 4\.0/);
      expect(layer.file_bytes).toBeLessThan(8_000_000);
    }
  });

  it("references only nodes that exist in the built file", () => {
    const built = new Set(Object.keys(asset.nodes));
    const { nodes } = BODYPARTS3D_SOURCE;
    for (const name of [...nodes.heart, ...nodes.body, ...nodes.arteries, ...nodes.veins, ...nodes.neutralCoronary]) {
      expect(built).toContain(name);
    }
  });
});
