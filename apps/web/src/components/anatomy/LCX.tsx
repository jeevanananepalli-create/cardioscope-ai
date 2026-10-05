"use client";

import { Vessel, type VesselProps } from "@/components/anatomy/Vessel";
import { VESSEL_PATHS } from "@/lib/anatomy";

/** Left circumflex artery (schematic path around the left side of the heart). */
export function LCX(props: Omit<VesselProps, "path">) {
  return <Vessel {...props} path={VESSEL_PATHS.LCX} />;
}
