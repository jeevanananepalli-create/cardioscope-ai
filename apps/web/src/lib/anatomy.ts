import { categoryFor, NO_PREDICTION_COLOR, RISK_COLORS } from "@/lib/constants";
import type { AnatomySource, VesselVisualStates } from "@/types/anatomy";
import { type RiskCategory, type TargetPrediction, type VesselName, VESSELS } from "@/types/prediction";

/**
 * The anatomy asset in use.
 *
 * No licensed anatomical model ships with this project, so the built-in
 * schematic placeholder is used. To use a real model, place a GLB under
 * apps/web/public/models/heart/ and replace this with a `gltf` source, e.g.
 *
 *   { kind: "gltf", url: "/models/heart/heart.glb", attribution: "Author, licence, source",
 *     nodes: { heart: ["Heart"], torso: ["Torso"],
 *              vessels: { LAD: ["LAD"], LCX: ["LCX"], RCA: ["RCA"] } } }
 *
 * The file needs separately named meshes for LAD, LCX and RCA.
 */
export const ANATOMY_SOURCE: AnatomySource = { kind: "placeholder" };

export const PLACEHOLDER_NOTICE =
  "Schematic placeholder anatomy. Shapes and vessel paths are illustrative and not anatomically accurate.";

/** Colour and category of each vessel for the current prediction (neutral before one exists). */
export function vesselVisualStates(
  vessels: Record<VesselName, TargetPrediction> | null,
  categories: RiskCategory[],
): VesselVisualStates {
  const states = {} as VesselVisualStates;
  for (const name of VESSELS) {
    const prediction = vessels?.[name];
    if (!prediction) {
      states[name] = { vessel: name, probability: null, category: null, categoryLabel: null, color: NO_PREDICTION_COLOR };
      continue;
    }
    const category = categoryFor(prediction.probability, categories);
    states[name] = {
      vessel: name,
      probability: prediction.probability,
      category: category.key,
      categoryLabel: category.label,
      color: RISK_COLORS[category.key],
    };
  }
  return states;
}

// ---- Schematic placeholder geometry ------------------------------------------------------
// The heart is a tapered ovoid of revolution. Vessel paths are drawn on its surface from
// (azimuth, t) pairs: azimuth in degrees around the long axis (0 = front, positive toward
// the patient's left), t from 0 (base, top) to 1 (apex). They are a diagram, not anatomy.

export type Point3 = [number, number, number];

const HEART_HALF_HEIGHT = 1.1;

export function heartRadius(t: number): number {
  const bulge = Math.sqrt(Math.max(0, 1 - 0.86 * (2 * t - 1) ** 2));
  return 0.98 * bulge * (1 - 0.42 * t);
}

export function heartHeight(t: number): number {
  return HEART_HALF_HEIGHT - 2 * HEART_HALF_HEIGHT * t;
}

/** Profile for a lathe geometry: [radius, y] from apex to base. */
export function heartProfile(segments = 28): [number, number][] {
  const profile: [number, number][] = [[0, heartHeight(1) - 0.02]];
  for (let i = segments; i >= 0; i -= 1) {
    const t = i / segments;
    profile.push([heartRadius(t), heartHeight(t)]);
  }
  profile.push([0, heartHeight(0) + 0.02]);
  return profile;
}

export function heartSurfacePoint(azimuthDeg: number, t: number, lift = 1.045): Point3 {
  const azimuth = (azimuthDeg * Math.PI) / 180;
  const radius = heartRadius(t) * lift;
  return [radius * Math.sin(azimuth), heartHeight(t), radius * Math.cos(azimuth)];
}

function path(points: [number, number][]): Point3[] {
  return points.map(([azimuth, t]) => heartSurfacePoint(azimuth, t));
}

/** Short common stem from which LAD and LCX branch in the schematic. */
export const LEFT_MAIN_PATH: Point3[] = path([
  [8, 0.1],
  [22, 0.13],
  [34, 0.16],
]);

export const VESSEL_PATHS: Record<VesselName, Point3[]> = {
  LAD: path([
    [34, 0.16],
    [30, 0.28],
    [24, 0.42],
    [19, 0.56],
    [14, 0.7],
    [9, 0.83],
    [5, 0.93],
  ]),
  LCX: path([
    [34, 0.16],
    [56, 0.2],
    [82, 0.25],
    [110, 0.31],
    [138, 0.38],
    [160, 0.47],
    [172, 0.58],
  ]),
  RCA: path([
    [-14, 0.1],
    [-40, 0.16],
    [-68, 0.23],
    [-98, 0.31],
    [-128, 0.4],
    [-152, 0.51],
    [-166, 0.64],
  ]),
};

export const VESSEL_RADIUS = 0.05;

/** Where each vessel's text label is anchored (a point along its path). */
export function vesselLabelAnchor(vessel: VesselName): Point3 {
  const points = VESSEL_PATHS[vessel];
  // LCX and RCA wrap behind the heart, so their labels sit near the visible front section.
  return points[vessel === "LAD" ? 3 : 2]!;
}

/** Heart placement inside the torso, and the tilt of its long axis. */
export const HEART_POSITION: Point3 = [0.3, 0.55, 0.2];
export const HEART_ROTATION: Point3 = [0.18, 0.3, 0.45];
export const HEART_SCALE = 0.42;

/** Torso silhouette profile for a lathe geometry: [radius, y] from waist to neck. */
export const TORSO_PROFILE: [number, number][] = [
  [0.0, -1.7],
  [0.92, -1.65],
  [0.98, -1.1],
  [1.06, -0.3],
  [1.16, 0.6],
  [1.24, 1.25],
  [1.12, 1.62],
  [0.55, 1.86],
  [0.3, 2.02],
  [0.28, 2.2],
  [0.0, 2.22],
];
export const TORSO_DEPTH_SCALE = 0.62;

export const CAMERA_BY_MODE = {
  heart: { position: [0.62, 0.72, 2.25] as Point3, target: HEART_POSITION, minDistance: 0.9, maxDistance: 5 },
  torso: { position: [0.9, 0.9, 7.2] as Point3, target: [0, 0.3, 0] as Point3, minDistance: 2.5, maxDistance: 14 },
};
