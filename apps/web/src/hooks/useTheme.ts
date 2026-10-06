"use client";

import { useCallback, useEffect, useState } from "react";

export type Theme = "dark" | "light";

const STORAGE_KEY = "cardioscope-theme";

/**
 * Colour theme. Light is the default; a navy dark theme is offered for dim rooms.
 * The choice is remembered in this browser.
 */
export function useTheme(): { theme: Theme; toggleTheme: () => void } {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "light" || saved === "dark") setTheme(saved);
    } catch {
      // Storage can be unavailable (private mode); the default theme is used.
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Not remembered, but still applied for this visit.
      }
      return next;
    });
  }, []);

  return { theme, toggleTheme };
}
