"use client";

import { Moon, Sun } from "lucide-react";
import { useGameinfoTheme } from "./gameinfo-theme-root";

export default function GameinfoThemeToggle() {
  const { theme, toggle } = useGameinfoTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-white/95 text-[#D90005] transition hover:bg-white"
      title={theme === "dark" ? "สลับเป็นธีมสว่าง" : "สลับเป็นธีมมืด"}
      aria-label={theme === "dark" ? "สลับเป็นธีมสว่าง" : "สลับเป็นธีมมืด"}
    >
      {theme === "dark" ? <Sun size={18} strokeWidth={2.2} /> : <Moon size={18} strokeWidth={2.2} />}
    </button>
  );
}
