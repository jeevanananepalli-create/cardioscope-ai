"use client";

import { type ReactNode, useMemo } from "react";
import { LatheGeometry, Vector2 } from "three";

import { HEART_POSITION, HEART_ROTATION, HEART_SCALE, heartProfile } from "@/lib/anatomy";

interface HeartModelProps {
  /** Dim the heart so the vessels stand out when one is selected. */
  dimmed: boolean;
  onBackgroundClick: () => void;
  children: ReactNode;
}

/** Schematic heart: a tapered ovoid with two stub great vessels. Not anatomically accurate. */
export function HeartModel({ dimmed, onBackgroundClick, children }: HeartModelProps) {
  const geometry = useMemo(
    () => new LatheGeometry(heartProfile().map(([radius, y]) => new Vector2(radius, y)), 36),
    [],
  );
  return (
    <group position={HEART_POSITION} rotation={HEART_ROTATION} scale={HEART_SCALE}>
      <mesh
        geometry={geometry}
        onClick={(event) => {
          event.stopPropagation();
          onBackgroundClick();
        }}
      >
        <meshStandardMaterial color={dimmed ? "#7d4a52" : "#9c5560"} roughness={0.62} metalness={0.05} />
      </mesh>
      {/* Stub aorta and pulmonary trunk, for orientation only. */}
      <mesh position={[-0.05, 1.32, 0.02]} rotation={[0, 0, 0.12]} raycast={() => null}>
        <cylinderGeometry args={[0.24, 0.27, 0.62, 18]} />
        <meshStandardMaterial color="#b9737c" roughness={0.6} />
      </mesh>
      <mesh position={[0.34, 1.22, 0.2]} rotation={[0.2, 0, -0.35]} raycast={() => null}>
        <cylinderGeometry args={[0.19, 0.22, 0.5, 18]} />
        <meshStandardMaterial color="#6f86a8" roughness={0.6} />
      </mesh>
      {children}
    </group>
  );
}
