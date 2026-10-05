"use client";

import { Vessel, type VesselProps } from "@/components/anatomy/Vessel";
import { VESSEL_PATHS } from "@/lib/anatomy";

/** Right coronary artery (schematic path around the right side of the heart). */
export function RCA(props: Omit<VesselProps, "path">) {
  return <Vessel {...props} path={VESSEL_PATHS.RCA} />;
}
