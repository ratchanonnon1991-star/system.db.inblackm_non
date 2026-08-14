"use client";

import { Inter } from "next/font/google";
import LLThemeToggle from "@/components/ll-theme-toggle";
import { useLLTheme } from "@/lib/ll-theme";

// Linear Light/Dark Mode type (see ~/.claude/skills/linear-light-dark-mode):
// Inter at weight 400/500/600/700 substitutes for the proprietary Linear
// Display/Text families across the whole /projectm module. Light is the
// default theme (the `ll-` token block in globals.css), with a
// user-toggleable dark mode reusing Linear's original near-black palette.
const linearSans = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-linear-sans",
});

export default function ProjectmThemeRoot({ children }) {
  const [theme, toggleTheme] = useLLTheme();

  // No data-theme attribute here — useLLTheme mirrors it onto <html> instead
  // (see ll-theme.js), which is what keeps this in sync pre-hydration (the
  // blocking script in layout.js) and reaches portaled popups that render
  // outside this div entirely (image pickers, dropdowns, the itune admin
  // settings modal). Adding it back here would just re-introduce the flash:
  // this div is server-rendered with no theme info to go on, so it'd start
  // wrong and only fix itself a render later.
  return (
    <div
      className={`${linearSans.variable} min-h-screen bg-ll-canvas`}
      style={{ fontFamily: "var(--font-linear-sans), sans-serif" }}
    >
      <LLThemeToggle theme={theme} onToggle={toggleTheme} />
      {children}
    </div>
  );
}
