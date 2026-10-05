import type { RiskCategoryKey, VesselName } from "@/types/prediction";

export type ViewMode = "heart" | "torso";

/** How one vessel is drawn. Derived from the model output; never from imaging. */
export interface VesselVisualState {
  vessel: VesselName;
  /** Predicted stenosis probability, or null before any prediction. */
  probability: number | null;
  category: RiskCategoryKey | null;
  categoryLabel: string | null;
  color: string;
}

export type VesselVisualStates = Record<VesselName, VesselVisualState>;

/**
 * Where the anatomy comes from.
 *
 * `placeholder` draws the built-in schematic. `gltf` loads a licensed model
 * from `url`; `nodes` names the meshes in that file for each part, so a real
 * asset can be dropped in without changing any component.
 */
export type AnatomySource =
  | { kind: "placeholder" }
  | {
      kind: "gltf";
      url: string;
      attribution: string;
      nodes: {
        heart: string[];
        torso: string[];
        vessels: Record<VesselName, string[]>;
      };
    };

export interface AnatomySceneProps {
  source: AnatomySource;
  mode: ViewMode;
  vessels: VesselVisualStates;
  selected: VesselName | null;
  hovered: VesselName | null;
  /** Increment to return the camera to the default position for the current mode. */
  resetSignal: number;
  onSelect: (vessel: VesselName | null) => void;
  onHover: (vessel: VesselName | null) => void;
}
