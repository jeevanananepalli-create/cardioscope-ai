"use client";

import { useGLTF } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { Color, DoubleSide, type Mesh, MeshPhysicalMaterial, MeshStandardMaterial, type Object3D } from "three";

import { addFlow, type FlowConfig } from "@/components/anatomy/flow";
import { type TissueStyle, tissueStyle } from "@/lib/anatomyColors";
import type { ColorScheme, GltfAnatomySource, LayerVisibility, VesselVisualStates } from "@/types/anatomy";
import { type VesselName, VESSELS } from "@/types/prediction";

interface GltfAnatomyProps {
  source: GltfAnatomySource;
  showBody: boolean;
  layers: LayerVisibility;
  colorScheme: ColorScheme;
  vessels: VesselVisualStates;
  selected: VesselName | null;
  hovered: VesselName | null;
  onSelect: (vessel: VesselName | null) => void;
  onHover: (vessel: VesselName | null) => void;
  onLoaded: () => void;
}

type Role = "heart" | "body" | "arteries" | "veins" | "neutralCoronary" | "vessel" | "hit";

function isMesh(object: Object3D): object is Mesh {
  return (object as Mesh).isMesh === true;
}

const NO_RAYCAST = () => null;

/** Which entry of the colour table a node uses. */
function styleKey(role: Role, node: string): string {
  if (role === "body") return "skin";
  if (role === "neutralCoronary" || role === "vessel") return "coronary";
  return node;
}

export function tissueMaterial(style: TissueStyle): MeshStandardMaterial {
  const translucent = style.opacity !== undefined && style.opacity < 1;
  const common = {
    color: style.color,
    roughness: style.roughness,
    metalness: 0.02,
    transparent: translucent,
    opacity: style.opacity ?? 1,
    depthWrite: !translucent,
  };
  // A light clear coat gives vessels and muscle the slightly wet look of living tissue.
  return style.sheen
    ? new MeshPhysicalMaterial({ ...common, clearcoat: style.sheen, clearcoatRoughness: 0.45 })
    : new MeshStandardMaterial(common);
}

/**
 * Anatomy from a licensed glTF/GLB file. Nodes are matched to their roles by the names in
 * the anatomy source. Only the three modelled vessels are interactive and coloured by model
 * output; the heart blocks the pointer so a vessel behind it cannot be picked through it,
 * and every other mesh ignores the pointer.
 */
export function GltfAnatomy({
  source,
  showBody,
  layers,
  colorScheme,
  vessels,
  selected,
  hovered,
  onSelect,
  onHover,
  onLoaded,
}: GltfAnatomyProps) {
  const { scene } = useGLTF(source.url);

  const lookup = useMemo(() => {
    const roles = new Map<string, Role>();
    const vesselByNode = new Map<string, VesselName>();
    const { nodes } = source;
    for (const name of nodes.heart) roles.set(name, "heart");
    for (const name of nodes.body) roles.set(name, "body");
    for (const name of nodes.arteries) roles.set(name, "arteries");
    for (const name of nodes.veins) roles.set(name, "veins");
    for (const name of nodes.neutralCoronary) roles.set(name, "neutralCoronary");
    for (const vessel of VESSELS) {
      for (const name of nodes.vessels[vessel]) {
        roles.set(name, "vessel");
        vesselByNode.set(name, vessel);
      }
      for (const name of nodes.hit[vessel]) {
        roles.set(name, "hit");
        vesselByNode.set(name, vessel);
      }
    }
    /** The named ancestor (or self) that gives an object its role. */
    return (object: Object3D | null): { role: Role; node: string; vessel: VesselName | null } | null => {
      for (let current = object; current; current = current.parent) {
        const role = roles.get(current.name);
        if (role) return { role, node: current.name, vessel: vesselByNode.get(current.name) ?? null };
      }
      return null;
    };
  }, [source]);

  const model = useMemo(() => {
    const flowFor = (node: string, role: Role): FlowConfig | null => {
      const flow = source.flow;
      if (role === "vessel" || role === "neutralCoronary") {
        return { origin: flow.aorticRoot, direction: 1, pulsatile: true };
      }
      if (role === "arteries") {
        // The pulmonary arteries leave the right side of the heart; the rest leave by the aorta.
        const origin = node.includes("pulmonary") ? source.heartCenter : flow.aorticRoot;
        return { origin, direction: 1, pulsatile: true };
      }
      if (role === "veins") {
        const origin = node.includes("pulmonary") ? source.heartCenter : flow.rightAtriumInflow;
        return { origin, direction: -1, pulsatile: false };
      }
      return null;
    };

    const clone = scene.clone(true);
    clone.traverse((object) => {
      if (!isMesh(object)) return;
      const description = lookup(object);
      if (!description) {
        object.visible = false;
        object.raycast = NO_RAYCAST;
        return;
      }
      const { role, node, vessel } = description;
      let material: MeshStandardMaterial;
      if (role === "hit") {
        // Invisible pointing target, also drawn as a faint halo in the vessel's risk colour.
        material = new MeshStandardMaterial({ transparent: true, opacity: 0, depthWrite: false, roughness: 1 });
      } else {
        material = tissueMaterial(tissueStyle(styleKey(role, node), colorScheme));
        if (role === "body") material.side = DoubleSide;
        const flow = flowFor(node, role);
        if (flow) addFlow(material, flow);
      }
      object.material = material;
      object.userData.role = role;
      object.userData.vessel = vessel;
      if (role !== "hit" && role !== "heart") object.raycast = NO_RAYCAST;
      if (role === "body") object.renderOrder = 2;
    });
    return clone;
  }, [scene, lookup, colorScheme, source]);

  useEffect(() => {
    onLoaded();
  }, [model, onLoaded]);

  useEffect(() => {
    const neutral = new Color(tissueStyle("coronary", colorScheme).color);
    model.traverse((object) => {
      if (!isMesh(object)) return;
      const role = object.userData.role as Role | undefined;
      if (role === "body") object.visible = showBody;
      else if (role === "arteries") object.visible = layers.arteries;
      else if (role === "veins") object.visible = layers.veins;
      if (role !== "vessel" && role !== "hit") return;

      const vessel = object.userData.vessel as VesselName;
      const state = vessels[vessel];
      const predicted = state.probability !== null;
      const material = object.material as MeshStandardMaterial;
      const risk = new Color(state.color);

      if (role === "hit") {
        // The halo appears only once there is model output to show.
        material.color.copy(risk);
        material.emissive.copy(risk);
        material.emissiveIntensity = 0.6;
        if (!predicted) material.opacity = selected === vessel || hovered === vessel ? 0.18 : 0;
        else if (selected === vessel) material.opacity = 0.45;
        else if (hovered === vessel) material.opacity = 0.34;
        else material.opacity = selected ? 0.08 : 0.22;
        material.needsUpdate = true;
        return;
      }
      // Before a prediction the vessel looks like any other coronary artery.
      const color = predicted ? risk : neutral;
      material.color.copy(color);
      material.emissive.copy(color);
      if (!predicted) material.emissiveIntensity = 0.05;
      else material.emissiveIntensity = selected === vessel ? 0.8 : hovered === vessel ? 0.5 : 0.2;
      material.transparent = selected !== null && selected !== vessel;
      material.opacity = material.transparent ? 0.45 : 1;
      material.needsUpdate = true;
    });
  }, [model, vessels, selected, hovered, showBody, layers, colorScheme]);

  function vesselUnderPointer(event: ThreeEvent<PointerEvent | MouseEvent>): VesselName | null {
    return (event.object.userData.vessel as VesselName | null | undefined) ?? null;
  }

  return (
    <primitive
      object={model}
      onPointerOver={(event: ThreeEvent<PointerEvent>) => {
        event.stopPropagation();
        const vessel = vesselUnderPointer(event);
        document.body.style.cursor = vessel ? "pointer" : "";
        onHover(vessel);
      }}
      onPointerOut={() => {
        document.body.style.cursor = "";
        onHover(null);
      }}
      onClick={(event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation();
        onSelect(vesselUnderPointer(event));
      }}
    />
  );
}
