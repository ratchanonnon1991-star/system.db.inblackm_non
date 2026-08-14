"use client";

import { createContext, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "gameinfo-theme";
const GameinfoThemeContext = createContext(null);

// Owns the light/dark choice for the whole /gameinfo module and stamps it as
// data-theme on <html> — see the [data-theme="light"] override block in
// globals.css, which swaps what the --color-linear-* custom properties
// resolve to. Every gameinfo component keeps using the same
// bg-linear-*/text-linear-*/border-linear-* classes either way; nothing
// downstream needs to know which theme is active except via
// useGameinfoTheme() (see gameinfo-theme-toggle.js).
//
// Defaults to "dark" (the module's original/only theme) — matched by the
// blocking inline script in layout.js, which stamps this same attribute on
// <html> before the browser paints anything, so there's no flash on load
// even for someone who picked light. readInitialTheme() below resolves the
// same way that script does, so this component's own first client render
// already agrees with what's on screen instead of catching up a render
// later.
//
// A React Context, not a render-prop, on purpose: this wraps plain JSX
// children handed down from the (server) layout.js — a render-prop function
// can't cross the server/client boundary (functions aren't serializable),
// but JSX children can.
//
// No data-theme attribute on this wrapper div itself — only on <html> (see
// the effect below). A lot of gameinfo's own UI (dropdown menus, the
// pack/tutorial modals, the "⋮" row menu) renders via createPortal(...,
// document.body), which moves that DOM outside this div entirely, so an
// attribute here wouldn't reach it anyway. Worse, this div is server-rendered
// with no theme info to go on — if it carried its own data-theme, that
// SSR-baked value would locally override whatever the blocking script had
// already set on <html>, for everything inside this div, until this
// component's own effect below caught up. <html> is the one true source and
// every gameinfo surface — portaled or not — just inherits from it.
function readInitialTheme() {
  if (typeof window === "undefined") return "dark";
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved === "light" || saved === "dark" ? saved : "dark";
  } catch {
    return "dark";
  }
}

export default function GameinfoThemeRoot({ className, style, children }) {
  const [theme, setTheme] = useState(readInitialTheme);

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
      <div className={className} style={style}>
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
