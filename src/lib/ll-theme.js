"use client";

// Shared light/dark preference for the Linear Light/Dark Mode surfaces (login
// screen, post-login system hub, and the whole /projectm module). One
// localStorage key so the preference carries across all of them.
import { useCallback, useEffect, useState } from "react";

const LL_THEME_KEY = "ll-theme";

export function useLLTheme() {
  const [theme, setTheme] = useState("light");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LL_THEME_KEY);
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading a browser preference is exactly what an effect is for
      setTheme(stored === "dark" || stored === "light" ? stored : prefersDark ? "dark" : "light");
    } catch {
      setTheme("light");
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      try {
        window.localStorage.setItem(LL_THEME_KEY, next);
      } catch {
        // preference is cosmetic; ignore a blocked storage
      }
      return next;
    });
  }, []);

  return [theme, toggleTheme];
}
