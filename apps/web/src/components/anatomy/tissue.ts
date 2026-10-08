import type { MeshStandardMaterial, WebGLRenderer } from "three";

/**
 * Surface detail that makes tissue read as living tissue instead of painted plastic:
 * uneven colour, a fine grain that catches the light, and a warm glow at grazing angles
 * (a cheap stand-in for light scattering inside the tissue).
 *
 * It is procedural decoration, the same on every heart and for every input. It adds no
 * anatomical feature (no fat, scars or lesions) and is never changed by a prediction.
 */
export interface TissueLook {
  /** How much the colour varies across the surface, 0 to 1. */
  mottle: number;
  /** Height of the surface grain in scene units; 0 for a smooth surface. */
  grain: number;
  /** Strength of the glow at grazing angles. */
  rim: number;
}

/**
 * True when the browser draws WebGL on the processor instead of a graphics chip. The
 * detailed shading is far too slow there, so the scene falls back to plain materials.
 */
export function isSoftwareRenderer(renderer: WebGLRenderer): boolean {
  try {
    const context = renderer.getContext();
    const info = context.getExtension("WEBGL_debug_renderer_info");
    const name = String(context.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : context.RENDERER));
    return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
  } catch {
    return false;
  }
}

export const HEART_LOOK: TissueLook = { mottle: 1, grain: 0.011, rim: 0.42 };
/** Large vessels: smooth walls, a little colour variation. */
export const VESSEL_LOOK: TissueLook = { mottle: 0.45, grain: 0, rim: 0.3 };
/** The three modelled vessels keep a flat colour so the risk colour reads exactly. */
export const MODELLED_VESSEL_LOOK: TissueLook = { mottle: 0, grain: 0, rim: 0.18 };

const NOISE = `
varying vec3 vTissuePosition;
uniform float uTissueMottle;
uniform float uTissueGrain;
uniform float uTissueRim;
// Fine detail, computed once per pixel and used for both colour and grain.
float tissueFine;
float tissueHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float tissueNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(tissueHash(i), tissueHash(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(tissueHash(i + vec3(0.0, 1.0, 0.0)), tissueHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(tissueHash(i + vec3(0.0, 0.0, 1.0)), tissueHash(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(tissueHash(i + vec3(0.0, 1.0, 1.0)), tissueHash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}
float tissueFbm(vec3 p) {
  float amplitude = 0.5;
  float total = 0.0;
  for (int octave = 0; octave < 3; octave++) {
    total += amplitude * tissueNoise(p);
    p *= 2.03;
    amplitude *= 0.5;
  }
  return total / 0.875;
}
`;

const COLOUR = `
{
  float tissueBroad = tissueFbm(vTissuePosition * 3.2);
  tissueFine = tissueFbm(vTissuePosition * 24.0);
  float tissueShade = mix(0.74, 1.2, tissueBroad) * mix(0.92, 1.07, tissueFine);
  diffuseColor.rgb *= mix(1.0, tissueShade, uTissueMottle);
}
`;

// Bump mapping from a procedural height, as three.js does for bump textures.
const GRAIN = `
if (uTissueGrain > 0.0) {
  float tissueHeight = tissueFine * uTissueGrain;
  vec3 tissueDx = dFdx(-vViewPosition);
  vec3 tissueDy = dFdy(-vViewPosition);
  vec3 tissueR1 = cross(tissueDy, normal);
  vec3 tissueR2 = cross(normal, tissueDx);
  float tissueDet = dot(tissueDx, tissueR1);
  vec3 tissueGradient = sign(tissueDet) * (dFdx(tissueHeight) * tissueR1 + dFdy(tissueHeight) * tissueR2);
  normal = normalize(abs(tissueDet) * normal - tissueGradient);
}
`;

const RIM = `
{
  float tissueFacing = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
  totalEmissiveRadiance += diffuseColor.rgb * pow(1.0 - tissueFacing, 2.6) * uTissueRim;
}
`;

/** Add the tissue look to a material. Safe to combine with the blood-flow effect. */
export function addTissueLook(material: MeshStandardMaterial, look: TissueLook): void {
  const previousCompile = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile.call(material, shader, renderer);
    shader.uniforms.uTissueMottle = { value: look.mottle };
    shader.uniforms.uTissueGrain = { value: look.grain };
    shader.uniforms.uTissueRim = { value: look.rim };

    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vTissuePosition;")
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvTissuePosition = (modelMatrix * vec4(transformed, 1.0)).xyz;",
      );

    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${NOISE}`)
      .replace("#include <color_fragment>", `#include <color_fragment>\n${COLOUR}`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>\n${GRAIN}`)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>\n${RIM}`);
  };
  // Strengths are uniforms, so one compiled program serves every look.
  material.customProgramCacheKey = () => `${previousKey.call(material)}|cardioscope-tissue`;
}
