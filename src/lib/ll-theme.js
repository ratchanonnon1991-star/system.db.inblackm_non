"use client";

// Shared light/dark preference for the Linear Light/Dark Mode surfaces (login
// screen, post-login system hub, and the whole /projectm module). One
// localStorage key so the preference carries across all of them.
import { useCallback, useEffect, useState } from "react";

const LL_THEME_KEY = "ll-theme";

// Same fallback the blocking inline script in layout.js resolves before first
// paint (see THEME_INIT_SCRIPT there) — reading it the same way here, as the
// initial state instead of an effect-driven one, means this hook's first
// client render already matches what's on screen instead of a beat behind it.
function readInitialTheme() {
  if (typeof window === "undefined") return "light";
  try {
    const stored = window.localStorage.getItem(LL_THEME_KEY);
    if (stored === "dark" || stored === "light") return stored;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function useLLTheme() {
  const [theme, setTheme] = useState(readInitialTheme);

  // Mirrors onto <html>, not just whichever element renders data-theme={theme}
  // below — menus, image pickers and other popups across the login/hub
  // screens and /projectm render via createPortal(..., document.body), which
  // moves them outside that element entirely, so only an attribute on <html>
  // (which every portaled node still descends from) reaches them. The
  // blocking script in layout.js already stamps this same attribute before
  // first paint; this keeps it in sync afterwards, including on toggle.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    // Without this, navigating from an ll-themed screen into the classic
    // zinc-themed GamedbWorkspace (which never touches data-theme itself)
    // leaves a stale value on <html> — anything under ll- tokens rendered
    // there afterwards (e.g. UsersModal) would keep resolving against it.
    return () => document.documentElement.removeAttribute("data-theme");
  }, [theme]);

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
