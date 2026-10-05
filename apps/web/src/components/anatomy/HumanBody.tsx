"use client";

import { useMemo } from "react";
import { LatheGeometry, Vector2 } from "three";

import { TORSO_DEPTH_SCALE, TORSO_PROFILE } from "@/lib/anatomy";

/** Translucent schematic torso that gives the heart its position in the body. */
export function HumanBody({ visible }: { visible: boolean }) {
  const geometry = useMemo(
    () => new LatheGeometry(TORSO_PROFILE.map(([radius, y]) => new Vector2(radius, y)), 28),
    [],
  );
  return (
    <group visible={visible}>
      <mesh geometry={geometry} scale={[1, 1, TORSO_DEPTH_SCALE]} raycast={() => null}>
        <meshStandardMaterial color="#8fa9c4" transparent opacity={0.16} depthWrite={false} roughness={0.9} />
      </mesh>
      <mesh position={[0, 2.62, 0]} scale={[0.86, 1, 0.92]} raycast={() => null}>
        <sphereGeometry args={[0.46, 20, 16]} />
        <meshStandardMaterial color="#8fa9c4" transparent opacity={0.16} depthWrite={false} roughness={0.9} />
      </mesh>
    </group>
  );
}
