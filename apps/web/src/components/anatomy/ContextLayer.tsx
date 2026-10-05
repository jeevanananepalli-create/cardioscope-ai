"use client";

import { useGLTF } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { type Material, type Mesh, MeshStandardMaterial, type Object3D } from "three";

import type { ContextLayerName } from "@/types/anatomy";

interface ContextLayerProps {
  layer: ContextLayerName;
  url: string;
}

const NO_RAYCAST = () => null;

function isMesh(object: Object3D): object is Mesh {
  return (object as Mesh).isMesh === true;
}

/**
 * Neutral colours chosen to stay clear of the green / amber / orange / red risk palette,
 * so a context layer can never be read as model output.
 */
function materialFor(layer: ContextLayerName, node: string): Material {
  if (layer === "nerves") {
    return node === "cns"
      ? new MeshStandardMaterial({ color: "#cfc4ea", roughness: 0.75 })
      : new MeshStandardMaterial({ color: "#b3a0e6", roughness: 0.6, emissive: "#3b2f66", emissiveIntensity: 0.35 });
  }
  if (layer === "skeleton") {
    return new MeshStandardMaterial({
      color: "#dcd8cb",
      roughness: 0.85,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
  }
  return new MeshStandardMaterial({
    color: "#8ea6ad",
    roughness: 0.8,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
  });
}

/**
 * One optional anatomy layer (nervous system, skeleton or organs), downloaded only when
 * it is switched on. Purely context: it ignores the pointer and is never coloured by a model.
 */
export function ContextLayer({ layer, url }: ContextLayerProps) {
  const { scene } = useGLTF(url);
  const invalidate = useThree((state) => state.invalidate);

  const model = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((object) => {
      if (!isMesh(object)) return;
      object.material = materialFor(layer, object.name || object.parent?.name || "");
      object.raycast = NO_RAYCAST;
      if (layer !== "nerves") object.renderOrder = 1;
    });
    return clone;
  }, [scene, layer]);

  useEffect(() => {
    invalidate();
  }, [model, invalidate]);

  return <primitive object={model} />;
}
