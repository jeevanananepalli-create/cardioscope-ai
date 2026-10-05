"use client";

import { useGLTF } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { Color, DoubleSide, type Material, type Mesh, MeshStandardMaterial, type Object3D } from "three";

import type { GltfAnatomySource, LayerVisibility, VesselVisualStates } from "@/types/anatomy";
import { type VesselName, VESSELS } from "@/types/prediction";

interface GltfAnatomyProps {
  source: GltfAnatomySource;
  showBody: boolean;
  layers: LayerVisibility;
  vessels: VesselVisualStates;
  selected: VesselName | null;
  hovered: VesselName | null;
  onSelect: (vessel: VesselName | null) => void;
  onHover: (vessel: VesselName | null) => void;
  onLoaded: () => void;
}

type Role = "heart" | "body" | "arteries" | "pulmonary" | "veins" | "nerves" | "neutralCoronary" | "vessel" | "hit";

function isMesh(object: Object3D): object is Mesh {
  return (object as Mesh).isMesh === true;
}

const NO_RAYCAST = () => null;

/** Neutral, deliberately muted colours: only LAD, LCX and RCA carry the risk colours. */
function contextMaterial(role: Role): Material {
  switch (role) {
    case "heart":
      // Muted so that the risk colours on the three vessels stand out against it.
      return new MeshStandardMaterial({ color: "#a39193", roughness: 0.7, metalness: 0.02 });
    case "body":
      return new MeshStandardMaterial({
        color: "#9db3ca",
        transparent: true,
        opacity: 0.13,
        depthWrite: false,
        roughness: 0.9,
        side: DoubleSide,
      });
    case "arteries":
      return new MeshStandardMaterial({ color: "#cdb0a8", roughness: 0.55 });
    case "pulmonary":
      return new MeshStandardMaterial({ color: "#a9b8d0", roughness: 0.55 });
    case "veins":
      return new MeshStandardMaterial({ color: "#8697b6", roughness: 0.55 });
    case "nerves":
      return new MeshStandardMaterial({ color: "#d9cf9a", roughness: 0.6 });
    case "neutralCoronary":
      return new MeshStandardMaterial({ color: "#d3d8de", roughness: 0.45 });
    case "hit":
      // Also drawn as a faint halo in the vessel's colour, so thin vessels stay visible.
      return new MeshStandardMaterial({ transparent: true, opacity: 0.2, depthWrite: false, roughness: 1 });
    default:
      return new MeshStandardMaterial({ roughness: 0.35 });
  }
}

/**
 * Anatomy from a licensed glTF/GLB file. Nodes are matched to their roles by the
 * names in the anatomy source. Only the three modelled vessels are interactive and
 * coloured by model output; the heart blocks the pointer so a vessel behind it cannot
 * be picked through it, and every other mesh ignores the pointer.
 */
export function GltfAnatomy({
  source,
  showBody,
  layers,
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
    for (const name of nodes.arteries) roles.set(name, name.includes("pulmonary") ? "pulmonary" : "arteries");
    for (const name of nodes.veins) roles.set(name, "veins");
    for (const name of nodes.nerves) roles.set(name, "nerves");
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
    const describe = (object: Object3D | null): { role: Role; vessel: VesselName | null } | null => {
      for (let current = object; current; current = current.parent) {
        const role = roles.get(current.name);
        if (role) return { role, vessel: vesselByNode.get(current.name) ?? null };
      }
      return null;
    };
    return { describe };
  }, [source]);

  const model = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((object) => {
      if (!isMesh(object)) return;
      const description = lookup.describe(object);
      if (!description) {
        object.visible = false;
        object.raycast = NO_RAYCAST;
        return;
      }
      object.material = contextMaterial(description.role);
      object.userData.role = description.role;
      object.userData.vessel = description.vessel;
      if (description.role !== "hit" && description.role !== "heart") object.raycast = NO_RAYCAST;
      if (description.role === "body") object.renderOrder = 2;
    });
    return clone;
  }, [scene, lookup]);

  useEffect(() => {
    onLoaded();
  }, [model, onLoaded]);

  useEffect(() => {
    model.traverse((object) => {
      if (!isMesh(object)) return;
      const role = object.userData.role as Role | undefined;
      if (role === "body") object.visible = showBody;
      else if (role === "arteries" || role === "pulmonary") object.visible = layers.arteries;
      else if (role === "veins") object.visible = layers.veins;
      else if (role === "nerves") object.visible = layers.nerves;
      if (role !== "vessel" && role !== "hit") return;
      const vessel = object.userData.vessel as VesselName;
      const material = object.material as MeshStandardMaterial;
      const color = new Color(vessels[vessel].color);
      if (role === "hit") {
        material.color.copy(color);
        material.emissive.copy(color);
        material.emissiveIntensity = 0.6;
        material.opacity = selected === vessel ? 0.45 : hovered === vessel ? 0.34 : selected ? 0.08 : 0.2;
        material.needsUpdate = true;
        return;
      }
      material.color.copy(color);
      material.emissive.copy(color);
      material.emissiveIntensity = selected === vessel ? 0.8 : hovered === vessel ? 0.5 : 0.18;
      material.transparent = selected !== null && selected !== vessel;
      material.opacity = material.transparent ? 0.45 : 1;
      material.needsUpdate = true;
    });
  }, [model, vessels, selected, hovered, showBody, layers]);

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
