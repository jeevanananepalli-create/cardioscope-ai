import type { RiskCategoryKey, VesselName } from "@/types/prediction";

export type ViewMode = "heart" | "torso";

export type Point3 = [number, number, number];

/** Optional anatomy layers the user can show or hide. None of them carries model output. */
export type AnatomyLayer = "arteries" | "veins" | "nerves" | "skeleton" | "organs";
/** Layers that live in their own file and are downloaded only when switched on. */
export type ContextLayerName = "nerves" | "skeleton" | "organs";

export interface ContextLayerAsset {
  url: string;
  attribution: string;
  licenseUrl?: string;
}
export type LayerVisibility = Record<AnatomyLayer, boolean>;

export interface CameraView {
  position: Point3;
  target: Point3;
  minDistance: number;
  maxDistance: number;
}

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

export interface GltfAnatomySource {
  kind: "gltf";
  url: string;
  /** Required credit line for the asset, shown under the view. */
  attribution: string;
  licenseUrl?: string;
  /** Names of the nodes in the file that make up each part. */
  nodes: {
    heart: string[];
    /** Body outline, shown in torso context. */
    body: string[];
    arteries: string[];
    veins: string[];
    /** Coronary segments that no model predicts (drawn neutral). */
    neutralCoronary: string[];
    vessels: Record<VesselName, string[]>;
    /** Invisible, enlarged copies of the vessels used only for pointing. */
    hit: Record<VesselName, string[]>;
  };
  /** Optional layers stored in separate files. A missing entry means "not available". */
  layerAssets: Partial<Record<ContextLayerName, ContextLayerAsset>>;
  /** A point on each vessel where its label is pinned, and the heart's centre. */
  labelAnchors: Record<VesselName, Point3>;
  heartCenter: Point3;
  camera: Record<ViewMode, CameraView>;
}

/**
 * Where the anatomy comes from: the built-in schematic placeholder, or a
 * licensed glTF/GLB model described by its node names.
 */
export type AnatomySource = { kind: "placeholder" } | GltfAnatomySource;

export interface AnatomySceneProps {
  source: AnatomySource;
  mode: ViewMode;
  layers: LayerVisibility;
  vessels: VesselVisualStates;
  selected: VesselName | null;
  hovered: VesselName | null;
  /** Increment to return the camera to the default position for the current mode. */
  resetSignal: number;
  onSelect: (vessel: VesselName | null) => void;
  onHover: (vessel: VesselName | null) => void;
}
