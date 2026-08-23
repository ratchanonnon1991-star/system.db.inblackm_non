"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import GameinfoUnsavedNavigationDialog from "./gameinfo-unsaved-navigation-dialog";
import { rememberGameinfoLocation } from "@/lib/gameinfo-unsaved-changes";

const STORAGE_KEY = "gameinfo-theme";
const GameinfoThemeContext = createContext(null);

// Owns the light/dark choice for the whole /gameinfo module and stamps it as
// data-theme on this wrapper — see the [data-theme="light"] override block
// in globals.css, which swaps what the --color-linear-* custom properties
// resolve to. Every gameinfo component keeps using the same
// bg-linear-*/text-linear-*/border-linear-* classes either way; nothing
// downstream needs to know which theme is active except via
// useGameinfoTheme() (see gameinfo-theme-toggle.js). Defaults to "light" (the
// module's default theme) until localStorage is read on mount.
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
  const [theme, setTheme] = useState("light");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    // Restore the browser-only preference after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved === "light" || saved === "dark") setTheme(saved);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.setAttribute("data-gameinfo-root", "");
    return () => {
      document.documentElement.removeAttribute("data-theme");
      document.documentElement.removeAttribute("data-gameinfo-root");
    };
  }, [theme]);

  useEffect(() => {
    const refreshPermissions = () => router.refresh();
    window.addEventListener("focus", refreshPermissions);
    return () => window.removeEventListener("focus", refreshPermissions);
  }, [router]);

  useEffect(() => {
    rememberGameinfoLocation(`${pathname}${query ? `?${query}` : ""}`);
  }, [pathname, query]);

  function toggle() {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      window.localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }

  return (
    <GameinfoThemeContext.Provider value={{ theme, toggle }}>
      <div data-theme={theme} data-gameinfo-root className={className} style={style}>
        {children}
        <GameinfoUnsavedNavigationDialog />
      </div>
    </GameinfoThemeContext.Provider>
  );
}

export function useGameinfoTheme() {
  const ctx = useContext(GameinfoThemeContext);
  if (!ctx) throw new Error("useGameinfoTheme must be used inside GameinfoThemeRoot");
  return ctx;
}
