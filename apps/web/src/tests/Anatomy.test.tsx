import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AnatomyViewer } from "@/components/anatomy/AnatomyViewer";
import { useAnatomy } from "@/hooks/useAnatomy";
import asset from "@/lib/anatomyAsset.json";
import { tissueStyle } from "@/lib/anatomyColors";
import {
  ANATOMY_SOURCE,
  availableLayers,
  BODYPARTS3D_SOURCE,
  heartProfile,
  heartRadius,
  heartSurfacePoint,
  modeForZoom,
  PLACEHOLDER_NOTICE,
  VESSEL_PATHS,
  vesselVisualStates,
} from "@/lib/anatomy";
import { FALLBACK_RISK_CATEGORIES, NO_PREDICTION_COLOR, RISK_COLORS } from "@/lib/constants";

/** Hue in degrees and saturation (0-1) of a #rrggbb colour. */
function hueAndSaturation(hex: string): { hue: number; saturation: number } {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let hue = 0;
  if (delta > 0) {
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
  }
  return { hue: (hue * 60 + 360) % 360, saturation: max === 0 ? 0 : delta / max };
}

const isRed = (hex: string) => {
  const { hue, saturation } = hueAndSaturation(hex);
  return (hue < 20 || hue > 340) && saturation > 0.5;
};
const isBlue = (hex: string) => {
  const { hue, saturation } = hueAndSaturation(hex);
  return hue > 200 && hue < 250 && saturation > 0.5;
};
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
    expect(Object.keys(asset.layers.nerves.nodes).sort()).toEqual(["cns_brain", "cns_spinal", "peripheral_nerves"]);
    expect(Object.keys(asset.layers.organs.nodes)).toContain("organs_liver");
    expect(Object.keys(asset.layers.skeleton.nodes)).toContain("skeleton_bone");
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

describe("anatomical colours", () => {
  it("follows the oxygenated-red, deoxygenated-blue convention in the realistic scheme", () => {
    for (const node of ["arteries", "pulmonary_veins", "coronary"]) {
      expect(isRed(tissueStyle(node, "realistic").color), node).toBe(true);
    }
    for (const node of ["veins", "pulmonary_artery"]) {
      expect(isBlue(tissueStyle(node, "realistic").color), node).toBe(true);
    }
  });

  it("gives every built structure its own realistic style", () => {
    const nodes = [
      ...Object.keys(asset.nodes).filter((name) => !name.startsWith("coronary_")),
      ...Object.values(asset.layers).flatMap((layer) => Object.keys(layer.nodes)),
    ];
    const fallback = tissueStyle("no-such-structure", "realistic").color;
    for (const node of nodes) {
      expect(tissueStyle(node, "realistic").color, node).not.toBe(fallback);
    }
    expect(tissueStyle("organs_liver", "realistic").color).not.toBe(tissueStyle("organs_lungs", "realistic").color);
    expect(tissueStyle("peripheral_nerves", "realistic").color).not.toBe(tissueStyle("skeleton_bone", "realistic").color);
  });

  it("uses no saturated red or blue for context in the muted scheme", () => {
    for (const node of ["heart", "arteries", "veins", "pulmonary_artery", "pulmonary_veins", "peripheral_nerves", "organs_liver"]) {
      expect(hueAndSaturation(tissueStyle(node, "muted").color).saturation, node).toBeLessThan(0.4);
    }
  });

  it("keeps translucent the structures that surround the heart", () => {
    for (const node of ["skin", "skeleton_bone", "organs_lungs"]) {
      expect(tissueStyle(node, "realistic").opacity, node).toBeLessThan(1);
    }
    expect(tissueStyle("heart", "realistic").opacity ?? 1).toBe(1);
  });
});

describe("display options", () => {
  it("starts with realistic colours and blood flow, each with its caveat", async () => {
    enableWebgl();
    render(<Harness vessels={null} />);
    const scene = await screen.findByTestId("scene");
    expect(scene).toHaveAttribute("data-scheme", "realistic");
    await waitFor(() => expect(scene).toHaveAttribute("data-flow", "on"));
    expect(screen.getByRole("checkbox", { name: "Realistic colours" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Blood flow" })).toBeChecked();
    expect(screen.getByText(/red for vessels carrying oxygenated blood, blue for deoxygenated/)).toBeInTheDocument();
    expect(screen.getByText(/blood-flow animation is illustrative/)).toBeInTheDocument();
    expect(screen.getByText(/is not affected by any prediction/)).toBeInTheDocument();
    expect(screen.getByText(/glowing outline marks the three vessels that carry model output/)).toBeInTheDocument();
  });

  it("can switch to muted colours and turn the flow off", async () => {
    enableWebgl();
    render(<Harness vessels={predictionFixture().vessels} />);
    const scene = await screen.findByTestId("scene");
    await waitFor(() => expect(scene).toHaveAttribute("data-flow", "on"));
    await userEvent.click(screen.getByRole("checkbox", { name: "Realistic colours" }));
    expect(scene).toHaveAttribute("data-scheme", "muted");
    expect(screen.getByText(/muted colours so that only model output is coloured/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: "Blood flow" }));
    expect(scene).toHaveAttribute("data-flow", "off");
    expect(screen.queryByText(/blood-flow animation is illustrative/)).not.toBeInTheDocument();
    // Neither option changes what the modelled vessels show.
    expect(screen.getByTestId("mesh-LAD")).toHaveAttribute("data-color", RISK_COLORS.very_high);
  });

  it("leaves the flow off when the system asks for reduced motion", async () => {
    enableWebgl();
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({ matches: query.includes("reduce"), addEventListener() {}, removeEventListener() {} })),
    );
    render(<Harness vessels={null} />);
    const scene = await screen.findByTestId("scene");
    expect(scene).toHaveAttribute("data-flow", "off");
    expect(screen.getByRole("checkbox", { name: "Blood flow" })).not.toBeChecked();
    vi.unstubAllGlobals();
  });

  it("animates the flow identically whatever the predictions are", async () => {
    enableWebgl();
    const { rerender } = render(<Harness vessels={predictionFixture().vessels} />);
    const scene = await screen.findByTestId("scene");
    await waitFor(() => expect(scene).toHaveAttribute("data-flow", "on"));
    rerender(<Harness vessels={predictionFixture({ CAD: 0.1, LAD: 0.05, LCX: 0.05, RCA: 0.05 }).vessels} />);
    expect(scene).toHaveAttribute("data-flow", "on");
    expect(asset.flow.aortic_root.point).toHaveLength(3);
  });
});

describe("zoom-driven view mode", () => {
  const views = {
    heart: { position: [0, 0, 2] as [number, number, number], target: [0, 0, 0] as [number, number, number], minDistance: 1, maxDistance: 5 },
    torso: { position: [0, 0, 8] as [number, number, number], target: [0, 0, 0] as [number, number, number], minDistance: 2, maxDistance: 14 },
  };

  it("switches to the torso when zooming out of the heart view, and back when zooming in", () => {
    // Defaults are 2 and 8 apart: out past 4, back in below 3.
    expect(modeForZoom(2, "heart", views)).toBe("heart");
    expect(modeForZoom(3.9, "heart", views)).toBe("heart");
    expect(modeForZoom(4.1, "heart", views)).toBe("torso");
    expect(modeForZoom(3.5, "torso", views)).toBe("torso");
    expect(modeForZoom(2.9, "torso", views)).toBe("heart");
  });

  it("puts each default view in its own mode", () => {
    expect(modeForZoom(2, "torso", views)).toBe("heart");
    expect(modeForZoom(8, "heart", views)).toBe("torso");
  });
});
