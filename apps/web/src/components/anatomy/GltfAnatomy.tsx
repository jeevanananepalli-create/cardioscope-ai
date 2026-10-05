"use client";

import { useGLTF } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { Color, type Mesh, MeshStandardMaterial, type Object3D } from "three";

import type { AnatomySource, VesselVisualStates } from "@/types/anatomy";
import { type VesselName, VESSELS } from "@/types/prediction";

type GltfSource = Extract<AnatomySource, { kind: "gltf" }>;

interface GltfAnatomyProps {
  source: GltfSource;
  showTorso: boolean;
  vessels: VesselVisualStates;
  selected: VesselName | null;
  hovered: VesselName | null;
  onSelect: (vessel: VesselName | null) => void;
  onHover: (vessel: VesselName | null) => void;
}

function isMesh(object: Object3D): object is Mesh {
  return (object as Mesh).isMesh === true;
}

/**
 * Anatomy from a licensed glTF/GLB file. Meshes are matched to LAD, LCX, RCA
 * and the torso by the node names given in the anatomy source. If the file
 * cannot be loaded, the surrounding error boundary falls back to the placeholder.
 *
 * This path has not been exercised with a real asset, because none is supplied.
 */
export function GltfAnatomy({ source, showTorso, vessels, selected, hovered, onSelect, onHover }: GltfAnatomyProps) {
  const { scene } = useGLTF(source.url);

  const vesselOf = useMemo(() => {
    const lookup = new Map<string, VesselName>();
    for (const vessel of VESSELS) {
      for (const node of source.nodes.vessels[vessel]) lookup.set(node, vessel);
    }
    return (object: Object3D | null): VesselName | null => {
      for (let current = object; current; current = current.parent) {
        const match = lookup.get(current.name);
        if (match) return match;
      }
      return null;
    };
  }, [source]);

  const model = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((object) => {
      if (isMesh(object) && vesselOf(object)) {
        // Each vessel gets its own material so it can be recoloured independently.
        object.material = new MeshStandardMaterial({ roughness: 0.35 });
      }
    });
    return clone;
  }, [scene, vesselOf]);

  useEffect(() => {
    const torso = new Set(source.nodes.torso);
    model.traverse((object) => {
      if (torso.has(object.name)) object.visible = showTorso;
      if (!isMesh(object)) return;
      const vessel = vesselOf(object);
      if (!vessel) return;
      const material = object.material as MeshStandardMaterial;
      const color = new Color(vessels[vessel].color);
      material.color.copy(color);
      material.emissive.copy(color);
      material.emissiveIntensity = selected === vessel ? 0.75 : hovered === vessel ? 0.45 : 0.12;
      material.transparent = selected !== null && selected !== vessel;
      material.opacity = material.transparent ? 0.45 : 1;
      material.needsUpdate = true;
    });
  }, [model, source, vesselOf, vessels, selected, hovered, showTorso]);

  function handleOver(event: ThreeEvent<PointerEvent>) {
    const vessel = vesselOf(event.object);
    if (!vessel) return;
    event.stopPropagation();
    document.body.style.cursor = "pointer";
    onHover(vessel);
  }

  return (
    <primitive
      object={model}
      onPointerOver={handleOver}
      onPointerOut={() => {
        document.body.style.cursor = "";
        onHover(null);
      }}
      onClick={(event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation();
        onSelect(vesselOf(event.object));
      }}
    />
  );
}
