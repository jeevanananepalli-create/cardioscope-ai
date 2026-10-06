import { type MeshStandardMaterial, Vector3 } from "three";

import type { Point3 } from "@/types/anatomy";

/**
 * Illustrative blood-flow animation.
 *
 * Bright bands travel along a vessel, away from the heart in arteries and toward it in
 * veins. It shows the direction of normal circulation only. It is identical for every
 * input, is not computed from the patient's data, and is never changed by a prediction:
 * a vessel with a high predicted probability is animated exactly like any other.
 */
export interface FlowConfig {
  /** Where the flow starts (arteries) or ends (veins), in scene coordinates. */
  origin: Point3;
  /** +1: bands move away from `origin`. -1: bands move toward it. */
  direction: 1 | -1;
  /** Arterial flow pulses with the heartbeat; venous flow is steady. */
  pulsatile: boolean;
}

/** Shared by every flow material; advanced once per frame while the animation runs. */
export const flowClock = { value: 0 };
/** 1 while the animation is on, 0 otherwise (the vessels then look static). */
export const flowAmount = { value: 0 };

const BANDS_PER_UNIT = 9.0;
const BAND_SPEED = 5.0;
/** Radians per second for a resting rate of about 70 beats per minute (display only). */
const BEAT_RATE = (2 * Math.PI * 70) / 60;

/** Add the travelling-band effect to a vessel material. Call once, before first render. */
export function addFlow(material: MeshStandardMaterial, config: FlowConfig): void {
  const origin = new Vector3(...config.origin);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFlowTime = flowClock;
    shader.uniforms.uFlowAmount = flowAmount;
    shader.uniforms.uFlowOrigin = { value: origin };
    shader.uniforms.uFlowDirection = { value: config.direction };
    shader.uniforms.uFlowPulsatile = { value: config.pulsatile ? 1 : 0 };

    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vFlowWorld;")
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvFlowWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;",
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        [
          "#include <common>",
          "varying vec3 vFlowWorld;",
          "uniform float uFlowTime;",
          "uniform float uFlowAmount;",
          "uniform vec3 uFlowOrigin;",
          "uniform float uFlowDirection;",
          "uniform float uFlowPulsatile;",
        ].join("\n"),
      )
      .replace(
        "#include <emissivemap_fragment>",
        [
          "#include <emissivemap_fragment>",
          "{",
          "  float flowDistance = distance(vFlowWorld, uFlowOrigin);",
          `  float flowWave = 0.5 + 0.5 * sin(flowDistance * ${BANDS_PER_UNIT.toFixed(1)} - uFlowDirection * uFlowTime * ${BAND_SPEED.toFixed(1)});`,
          "  float flowBand = smoothstep(0.62, 1.0, flowWave);",
          `  float flowBeat = mix(0.75, 0.5 + 0.5 * pow(0.5 + 0.5 * sin(uFlowTime * ${BEAT_RATE.toFixed(3)}), 3.0), uFlowPulsatile);`,
          "  totalEmissiveRadiance += diffuseColor.rgb * flowBand * flowBeat * 1.1 * uFlowAmount;",
          "}",
        ].join("\n"),
      );
  };
  // One compiled program per kind of flow; origin and direction are uniforms.
  material.customProgramCacheKey = () => `cardioscope-flow-${config.direction}-${config.pulsatile ? 1 : 0}`;
}
