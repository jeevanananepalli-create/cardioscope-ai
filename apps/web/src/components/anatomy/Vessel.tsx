"use client";

import type { ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { CatmullRomCurve3, TubeGeometry, Vector3 } from "three";

import { type Point3, VESSEL_RADIUS } from "@/lib/anatomy";
import type { VesselVisualState } from "@/types/anatomy";
import type { VesselName } from "@/types/prediction";

export interface VesselProps {
  state: VesselVisualState;
  path: Point3[];
  selected: boolean;
  hovered: boolean;
  /** Another vessel is selected, so this one is de-emphasised. */
  dimmed: boolean;
  onSelect: (vessel: VesselName) => void;
  onHover: (vessel: VesselName | null) => void;
}

function tube(path: Point3[], radius: number, radialSegments: number): TubeGeometry {
  const curve = new CatmullRomCurve3(path.map(([x, y, z]) => new Vector3(x, y, z)));
  return new TubeGeometry(curve, 40, radius, radialSegments, false);
}

/** One selectable coronary vessel, coloured by the model's predicted probability. */
export function Vessel({ state, path, selected, hovered, dimmed, onSelect, onHover }: VesselProps) {
  const visible = useMemo(() => tube(path, VESSEL_RADIUS, 8), [path]);
  const hitArea = useMemo(() => tube(path, VESSEL_RADIUS * 2.6, 6), [path]);
  useEffect(() => () => visible.dispose(), [visible]);
  useEffect(() => () => hitArea.dispose(), [hitArea]);

  const emphasis = selected ? 0.75 : hovered ? 0.45 : 0.12;
  const thickness = selected ? 1.5 : hovered ? 1.25 : 1;

  function handleOver(event: ThreeEvent<PointerEvent>) {
    event.stopPropagation();
    document.body.style.cursor = "pointer";
    onHover(state.vessel);
  }

  function handleOut() {
    document.body.style.cursor = "";
    onHover(null);
  }

  return (
    <group name={state.vessel}>
      <mesh geometry={visible} scale={1} raycast={() => null}>
        <meshStandardMaterial
          color={state.color}
          emissive={state.color}
          emissiveIntensity={emphasis}
          roughness={0.35}
          transparent={dimmed}
          opacity={dimmed ? 0.45 : 1}
        />
      </mesh>
      {thickness > 1 ? (
        <mesh geometry={hitArea} scale={1} raycast={() => null}>
          <meshBasicMaterial color={state.color} transparent opacity={selected ? 0.28 : 0.16} depthWrite={false} />
        </mesh>
      ) : null}
      {/* Invisible, wider tube so the vessel is easy to point at. */}
      <mesh
        geometry={hitArea}
        onPointerOver={handleOver}
        onPointerOut={handleOut}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(state.vessel);
        }}
      >
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}
