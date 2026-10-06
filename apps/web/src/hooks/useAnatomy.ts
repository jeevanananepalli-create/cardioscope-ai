"use client";

import { useCallback, useEffect, useState } from "react";

import { DEFAULT_LAYERS } from "@/lib/anatomy";
import type { AnatomyLayer, ColorScheme, LayerVisibility, ViewMode } from "@/types/anatomy";
import type { VesselName } from "@/types/prediction";

/** View state of the 3D anatomy: selection, hover, camera mode and visible context layers. */
export function useAnatomy(initialMode: ViewMode = "heart") {
  const [mode, setMode] = useState<ViewMode>(initialMode);
  const [selected, setSelected] = useState<VesselName | null>(null);
  const [hovered, setHovered] = useState<VesselName | null>(null);
  const [resetSignal, setResetSignal] = useState(0);
  const [layers, setLayers] = useState<LayerVisibility>(DEFAULT_LAYERS);
  const [colorScheme, setColorScheme] = useState<ColorScheme>("realistic");
  const [flow, setFlow] = useState(false);

  // The flow animation starts on, unless the user has asked their system to reduce motion.
  useEffect(() => {
    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setFlow(!reduce);
  }, []);

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
    colorScheme,
    setColorScheme,
    flow,
    setFlow,
  };
}

export type AnatomyState = ReturnType<typeof useAnatomy>;
