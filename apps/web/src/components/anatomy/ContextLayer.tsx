"use client";

import { useGLTF } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import type { Mesh, Object3D } from "three";

import { tissueMaterial } from "@/components/anatomy/GltfAnatomy";
import { tissueStyle } from "@/lib/anatomyColors";
import type { ColorScheme, ContextLayerName } from "@/types/anatomy";

interface ContextLayerProps {
  layer: ContextLayerName;
  url: string;
  colorScheme: ColorScheme;
}

const NO_RAYCAST = () => null;

function isMesh(object: Object3D): object is Mesh {
  return (object as Mesh).isMesh === true;
}

/**
 * One optional anatomy layer (nervous system, skeleton or organs), downloaded only when it
 * is switched on. Each node in the file is one tissue group and gets that tissue's colour.
 * Purely context: it ignores the pointer and is never coloured by a model.
 */
export function ContextLayer({ layer, url, colorScheme }: ContextLayerProps) {
  const { scene } = useGLTF(url);
  const invalidate = useThree((state) => state.invalidate);

  const model = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((object) => {
      if (!isMesh(object)) return;
      const node = object.name || object.parent?.name || "";
      const material = tissueMaterial(tissueStyle(node, colorScheme));
      object.material = material;
      object.raycast = NO_RAYCAST;
      // Translucent structures are drawn after opaque ones so they do not hide them.
      if (material.transparent) object.renderOrder = layer === "skeleton" ? 1 : 1.5;
    });
    return clone;
  }, [scene, layer, colorScheme]);

  useEffect(() => {
    invalidate();
  }, [model, invalidate]);

  return <primitive object={model} />;
}
