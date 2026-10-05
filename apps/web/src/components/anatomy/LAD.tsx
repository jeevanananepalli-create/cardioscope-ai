"use client";

import { Vessel, type VesselProps } from "@/components/anatomy/Vessel";
import { VESSEL_PATHS } from "@/lib/anatomy";

/** Left anterior descending artery (schematic path down the front of the heart). */
export function LAD(props: Omit<VesselProps, "path">) {
  return <Vessel {...props} path={VESSEL_PATHS.LAD} />;
}
