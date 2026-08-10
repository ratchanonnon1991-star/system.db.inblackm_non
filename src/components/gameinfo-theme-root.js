"use client";

import { createContext, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "gameinfo-theme";
const GameinfoThemeContext = createContext(null);

// Owns the light/dark choice for the whole /gameinfo module and stamps it as
// data-theme on this wrapper — see the [data-theme="light"] override block
// in globals.css, which swaps what the --color-linear-* custom properties
// resolve to. Every gameinfo component keeps using the same
// bg-linear-*/text-linear-*/border-linear-* classes either way; nothing
// downstream needs to know which theme is active except via
// useGameinfoTheme() (see gameinfo-theme-toggle.js). Defaults to "dark" (the
// module's original/only theme) until localStorage is read on mount, so
// there's a brief flash back to dark on load for anyone who picked light —
// an acceptable tradeoff for an internal tool, not worth a blocking
// inline-script hack.
//
// A React Context, not a render-prop, on purpose: this wraps plain JSX
// children handed down from the (server) layout.js — a render-prop function
// can't cross the server/client boundary (functions aren't serializable),
// but JSX children can.
//
// The data-theme attribute is ALSO mirrored onto <html>, not just this
// wrapper div: a lot of gameinfo's own UI (dropdown menus, the pack/tutorial
// modals, the "⋮" row menu) renders via createPortal(..., document.body),
// which moves that DOM outside this div entirely. CSS custom-property
// inheritance follows the real DOM tree, not React's component tree, so
// those portaled nodes would keep resolving --color-linear-* against
// whatever's on <html> regardless of what this div is set to — they'd stay
// stuck on the dark defaults forever if only this div carried the attribute.
export default function GameinfoThemeRoot({ className, style, children }) {
  const [theme, setTheme] = useState("dark");

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") setTheme(saved);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    return () => document.documentElement.removeAttribute("data-theme");
  }, [theme]);

  function toggle() {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      window.localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }

  return (
    <GameinfoThemeContext.Provider value={{ theme, toggle }}>
      <div data-theme={theme} className={className} style={style}>
        {children}
      </div>
    </GameinfoThemeContext.Provider>
  );
}

export function useGameinfoTheme() {
  const ctx = useContext(GameinfoThemeContext);
  if (!ctx) throw new Error("useGameinfoTheme must be used inside GameinfoThemeRoot");
  return ctx;
}
