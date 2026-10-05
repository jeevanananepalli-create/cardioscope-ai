"use client";

import { useCallback, useState } from "react";

import type { ViewMode } from "@/types/anatomy";
import type { VesselName } from "@/types/prediction";

/** View state of the 3D anatomy: which vessel is selected or hovered, and the camera mode. */
export function useAnatomy(initialMode: ViewMode = "heart") {
  const [mode, setMode] = useState<ViewMode>(initialMode);
  const [selected, setSelected] = useState<VesselName | null>(null);
  const [hovered, setHovered] = useState<VesselName | null>(null);
  const [resetSignal, setResetSignal] = useState(0);

  /** Selecting the selected vessel again clears the selection. */
  const toggle = useCallback((vessel: VesselName) => {
    setSelected((current) => (current === vessel ? null : vessel));
  }, []);

  const resetCamera = useCallback(() => setResetSignal((value) => value + 1), []);

  return { mode, setMode, selected, select: setSelected, toggle, hovered, setHovered, resetSignal, resetCamera };
}

export type AnatomyState = ReturnType<typeof useAnatomy>;
