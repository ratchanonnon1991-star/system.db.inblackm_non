"use client";

import { Moon, Sun } from "lucide-react";
import { useGameinfoTheme } from "./gameinfo-theme-root";

export default function GameinfoThemeToggle() {
  const { theme, toggle } = useGameinfoTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      className="flex h-8 w-8 items-center justify-center rounded-md border border-linear-hairline-strong text-linear-ink-muted hover:bg-linear-surface-2"
      title={theme === "dark" ? "สลับเป็นธีมสว่าง" : "สลับเป็นธีมมืด"}
      aria-label={theme === "dark" ? "สลับเป็นธีมสว่าง" : "สลับเป็นธีมมืด"}
    >
      {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  );
}
