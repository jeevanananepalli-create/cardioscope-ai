"use client";

import { useEffect, useMemo } from "react";
import { CatmullRomCurve3, TubeGeometry, Vector3 } from "three";

import { LAD } from "@/components/anatomy/LAD";
import { LCX } from "@/components/anatomy/LCX";
import { RCA } from "@/components/anatomy/RCA";
import { LEFT_MAIN_PATH, VESSEL_RADIUS } from "@/lib/anatomy";
import type { VesselVisualStates } from "@/types/anatomy";
import type { VesselName } from "@/types/prediction";

interface CoronaryArteriesProps {
  vessels: VesselVisualStates;
  selected: VesselName | null;
  hovered: VesselName | null;
  onSelect: (vessel: VesselName) => void;
  onHover: (vessel: VesselName | null) => void;
}

const COMPONENTS = { LAD, LCX, RCA } as const;

/** The three modelled vessels plus an uncoloured common stem for LAD and LCX. */
export function CoronaryArteries({ vessels, selected, hovered, onSelect, onHover }: CoronaryArteriesProps) {
  const stem = useMemo(() => {
    const curve = new CatmullRomCurve3(LEFT_MAIN_PATH.map(([x, y, z]) => new Vector3(x, y, z)));
    return new TubeGeometry(curve, 12, VESSEL_RADIUS * 1.1, 8, false);
  }, []);
  useEffect(() => () => stem.dispose(), [stem]);

  return (
    <group name="coronary-arteries">
      <mesh geometry={stem} raycast={() => null}>
        <meshStandardMaterial color="#b8c2cc" roughness={0.5} />
      </mesh>
      {(Object.keys(COMPONENTS) as VesselName[]).map((name) => {
        const Component = COMPONENTS[name];
        return (
          <Component
            key={name}
            state={vessels[name]}
            selected={selected === name}
            hovered={hovered === name}
            dimmed={selected !== null && selected !== name}
            onSelect={onSelect}
            onHover={onHover}
          />
        );
      })}
    </group>
  );
}
