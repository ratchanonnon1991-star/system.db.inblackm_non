"use client";

import { Inter } from "next/font/google";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import LLThemeToggle from "@/components/ll-theme-toggle";
import { ProjectmThemeProvider } from "@/components/projectm-theme-context";
import { useLLTheme } from "@/lib/ll-theme";

const linearSans = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-linear-sans",
});

export default function ProjectmThemeRoot({ children }) {
  const [theme, toggleTheme, choice, setChoice] = useLLTheme();
  const pathname = usePathname();
  const router = useRouter();
  // The iTune admin and the Topup Inventory home draw their own theme switch.
  const hasOwnThemeControl = /\/itune\/admin(?:\/|$)/.test(pathname) || /^\/projectm\/[^/]+\/topup-inventory\/?$/.test(pathname);

  useEffect(() => {
    const refreshPermissions = () => router.refresh();
    window.addEventListener("focus", refreshPermissions);
    return () => window.removeEventListener("focus", refreshPermissions);
  }, [router]);

  return (
    <ProjectmThemeProvider theme={theme} toggleTheme={toggleTheme} choice={choice} setChoice={setChoice}>
      <div
        data-theme={theme}
        className={`${linearSans.variable} min-h-screen bg-ll-canvas`}
        style={{ fontFamily: "var(--font-linear-sans), sans-serif" }}
      >
        {!hasOwnThemeControl && <LLThemeToggle theme={theme} onToggle={toggleTheme} />}
        {children}
      </div>
    </ProjectmThemeProvider>
  );
}
