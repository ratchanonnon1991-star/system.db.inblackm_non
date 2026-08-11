"use client";

import { Moon, Sun } from "lucide-react";

// Fixed-corner light/dark switch for the Linear Light/Dark Mode surfaces —
// dropped once per module root (login/hub, projectm layout) rather than
// repeated on every sub-page.
export default function LLThemeToggle({ theme, onToggle }) {
  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={onToggle}
      title={isDark ? "สลับเป็นโหมดสว่าง" : "สลับเป็นโหมดมืด"}
      aria-label={isDark ? "สลับเป็นโหมดสว่าง" : "สลับเป็นโหมดมืด"}
      className="fixed right-4 top-4 z-40 flex h-9 w-9 items-center justify-center rounded-md border border-ll-hairline-strong bg-ll-surface-1 text-ll-ink-subtle shadow-[var(--ll-shadow-card)] transition hover:text-ll-ink"
    >
      {isDark ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  );
}
