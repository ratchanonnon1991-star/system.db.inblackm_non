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

  return (
    <div
      data-theme={theme}
      className={`${linearSans.variable} min-h-screen bg-ll-canvas`}
      style={{ fontFamily: "var(--font-linear-sans), sans-serif" }}
    >
      <LLThemeToggle theme={theme} onToggle={toggleTheme} />
      {children}
    </div>
  );
}
