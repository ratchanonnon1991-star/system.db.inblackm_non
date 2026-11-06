"use client";

// Shared light/dark preference for the Linear Light/Dark Mode surfaces (login
// screen, post-login system hub, and the whole /projectm module). One
// localStorage key so the preference carries across all of them. No stored
// value means "follow the system" (choice "auto").
import { useCallback, useEffect, useState } from "react";

const LL_THEME_KEY = "ll-theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

function store(value) {
  try {
    if (value === "auto") window.localStorage.removeItem(LL_THEME_KEY);
    else window.localStorage.setItem(LL_THEME_KEY, value);
  } catch {
    // preference is cosmetic; ignore a blocked storage
  }
}

/** [theme, toggleTheme, choice, setChoice]: theme is what is drawn ("light"/"dark"), choice what was picked ("light"/"dark"/"auto"). */
export function useLLTheme() {
  const [choice, setChoiceState] = useState("light");
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    let stored = null;
    try {
      stored = window.localStorage.getItem(LL_THEME_KEY);
    } catch {
      // read as "follow the system"
    }
    const media = window.matchMedia(DARK_QUERY);
    /* eslint-disable react-hooks/set-state-in-effect -- reading a browser preference is exactly what an effect is for */
    setSystemDark(media.matches);
    setChoiceState(stored === "dark" || stored === "light" ? stored : "auto");
    /* eslint-enable react-hooks/set-state-in-effect */
    const follow = (event) => setSystemDark(event.matches);
    media.addEventListener("change", follow);
    return () => media.removeEventListener("change", follow);
  }, []);

  const theme = choice === "dark" || (choice === "auto" && systemDark) ? "dark" : "light";

  const toggleTheme = useCallback(() => {
    const next = theme === "dark" ? "light" : "dark";
    store(next);
    setChoiceState(next);
  }, [theme]);

  const setChoice = useCallback((next) => {
    if (next !== "light" && next !== "dark" && next !== "auto") return;
    store(next);
    setChoiceState(next);
  }, []);

  return [theme, toggleTheme, choice, setChoice];
}
