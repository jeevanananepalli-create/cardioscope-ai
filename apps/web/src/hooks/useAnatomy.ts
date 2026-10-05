"use client";

import { useCallback, useState } from "react";

import { DEFAULT_LAYERS } from "@/lib/anatomy";
import type { AnatomyLayer, LayerVisibility, ViewMode } from "@/types/anatomy";
import type { VesselName } from "@/types/prediction";

/** View state of the 3D anatomy: selection, hover, camera mode and visible context layers. */
export function useAnatomy(initialMode: ViewMode = "heart") {
  const [mode, setMode] = useState<ViewMode>(initialMode);
  const [selected, setSelected] = useState<VesselName | null>(null);
  const [hovered, setHovered] = useState<VesselName | null>(null);
  const [resetSignal, setResetSignal] = useState(0);
  const [layers, setLayers] = useState<LayerVisibility>(DEFAULT_LAYERS);

  /** Selecting the selected vessel again clears the selection. */
  const toggle = useCallback((vessel: VesselName) => {
    setSelected((current) => (current === vessel ? null : vessel));
  }, []);

  const toggleLayer = useCallback((layer: AnatomyLayer) => {
    setLayers((current) => ({ ...current, [layer]: !current[layer] }));
  }, []);

  const resetCamera = useCallback(() => setResetSignal((value) => value + 1), []);

  return {
    mode,
    setMode,
    selected,
    select: setSelected,
    toggle,
    hovered,
    setHovered,
    resetSignal,
    resetCamera,
    layers,
    toggleLayer,
  };
}

export type AnatomyState = ReturnType<typeof useAnatomy>;
