import type { ColorScheme } from "@/types/anatomy";

/** How one anatomical structure is drawn. */
export interface TissueStyle {
  color: string;
  roughness: number;
  /** Below 1 the structure is drawn translucent so the heart stays visible behind it. */
  opacity?: number;
  /** A thin glossy coat, for wet tissue. */
  sheen?: number;
}

/**
 * Conventional anatomical colours: oxygenated blood red, deoxygenated blood blue,
 * nerves yellow, bone ivory, and so on. These are illustration conventions; they
 * are not measurements, and none of them is model output.
 */
const REALISTIC: Record<string, TissueStyle> = {
  heart: { color: "#a3352e", roughness: 0.46, sheen: 0.7 },
  skin: { color: "#e3b9a1", roughness: 0.85, opacity: 0.15 },
  // Systemic arteries and pulmonary veins carry oxygenated blood.
  arteries: { color: "#c0221b", roughness: 0.36, sheen: 0.65 },
  pulmonary_veins: { color: "#cc4034", roughness: 0.36, sheen: 0.65 },
  coronary: { color: "#d1342a", roughness: 0.34, sheen: 0.65 },
  // Systemic veins and pulmonary arteries carry deoxygenated blood.
  veins: { color: "#2c46b4", roughness: 0.36, sheen: 0.65 },
  pulmonary_artery: { color: "#3a54c2", roughness: 0.36, sheen: 0.65 },
  cns_brain: { color: "#dbaea6", roughness: 0.6, sheen: 0.3 },
  cns_spinal: { color: "#f0dfa6", roughness: 0.6 },
  peripheral_nerves: { color: "#f2d56b", roughness: 0.55 },
  skeleton_bone: { color: "#ebe4d0", roughness: 0.8, opacity: 0.55 },
  skeleton_cartilage: { color: "#cfe1e8", roughness: 0.7, opacity: 0.5 },
  skeleton_teeth: { color: "#f8f6ef", roughness: 0.35 },
  organs_lungs: { color: "#dc9a98", roughness: 0.7, opacity: 0.38 },
  organs_airways: { color: "#e6dcc9", roughness: 0.65, opacity: 0.8 },
  organs_liver: { color: "#7b3625", roughness: 0.5, sheen: 0.4 },
  organs_biliary: { color: "#5f8c3c", roughness: 0.5, sheen: 0.4 },
  organs_digestive: { color: "#dba791", roughness: 0.6, sheen: 0.3 },
  organs_pancreas: { color: "#e3c48e", roughness: 0.6 },
  organs_glands: { color: "#c98d70", roughness: 0.6 },
  organs_urogenital: { color: "#d9a3a3", roughness: 0.6 },
  organs_other: { color: "#cdb9aa", roughness: 0.7 },
};

/**
 * Muted greys and pastels kept clear of the green / amber / orange / red risk palette,
 * for when the only colour on screen should be the models' output.
 */
const MUTED: Record<string, TissueStyle> = {
  heart: { color: "#a39193", roughness: 0.7 },
  skin: { color: "#9db3ca", roughness: 0.9, opacity: 0.13 },
  arteries: { color: "#cdb0a8", roughness: 0.55 },
  pulmonary_veins: { color: "#c3aaa6", roughness: 0.55 },
  coronary: { color: "#d3d8de", roughness: 0.45 },
  veins: { color: "#8697b6", roughness: 0.55 },
  pulmonary_artery: { color: "#a9b8d0", roughness: 0.55 },
  cns_brain: { color: "#cfc4ea", roughness: 0.75 },
  cns_spinal: { color: "#c3b6e8", roughness: 0.7 },
  peripheral_nerves: { color: "#b3a0e6", roughness: 0.6 },
  skeleton_bone: { color: "#dcd8cb", roughness: 0.85, opacity: 0.42 },
  skeleton_cartilage: { color: "#d3d9dc", roughness: 0.85, opacity: 0.42 },
  skeleton_teeth: { color: "#e6e4dc", roughness: 0.6 },
};
const MUTED_ORGAN: TissueStyle = { color: "#8ea6ad", roughness: 0.8, opacity: 0.4 };
const FALLBACK: TissueStyle = { color: "#b9b2ac", roughness: 0.7 };

/** Style for a structure, by its node name in the anatomy files. */
export function tissueStyle(node: string, scheme: ColorScheme): TissueStyle {
  if (scheme === "muted") return MUTED[node] ?? (node.startsWith("organs_") ? MUTED_ORGAN : FALLBACK);
  return REALISTIC[node] ?? FALLBACK;
}

export const COLOR_LEGEND: Record<ColorScheme, string> = {
  realistic:
    "Colours follow anatomical convention: red for vessels carrying oxygenated blood, blue for deoxygenated, yellow for nerves.",
  muted: "Context structures are drawn in muted colours so that only model output is coloured.",
};
