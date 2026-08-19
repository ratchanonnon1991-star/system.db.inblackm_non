"use client";

import { Inter } from "next/font/google";
import { usePathname } from "next/navigation";
import LLThemeToggle from "@/components/ll-theme-toggle";
import { ProjectmThemeProvider } from "@/components/projectm-theme-context";
import { useLLTheme } from "@/lib/ll-theme";

const linearSans = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-linear-sans",
});

export default function ProjectmThemeRoot({ children }) {
  const [theme, toggleTheme] = useLLTheme();
  const pathname = usePathname();
  const hasAdminThemeControl = /\/itune\/admin(?:\/|$)/.test(pathname);

  return (
    <ProjectmThemeProvider theme={theme} toggleTheme={toggleTheme}>
      <div
        data-theme={theme}
        className={`${linearSans.variable} min-h-screen bg-ll-canvas`}
        style={{ fontFamily: "var(--font-linear-sans), sans-serif" }}
      >
        {!hasAdminThemeControl && <LLThemeToggle theme={theme} onToggle={toggleTheme} />}
        {children}
      </div>
    </ProjectmThemeProvider>
  );
}
