"use client";

import { Inter } from "next/font/google";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ProfitThemeProvider } from "@/components/profit-theme-context";
import { useLLTheme } from "@/lib/ll-theme";

const linearSans = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-linear-sans",
});

// Same shared "ll-theme" localStorage key as the hub/login screen and
// /projectm (see src/lib/ll-theme.js) — the light/dark choice carries across
// every module instead of Profit having its own separate toggle state.
export default function ProfitThemeRoot({ children }) {
  const [theme, toggleTheme] = useLLTheme();
  const router = useRouter();

  useEffect(() => {
    const refreshPermissions = () => router.refresh();
    window.addEventListener("focus", refreshPermissions);
    return () => window.removeEventListener("focus", refreshPermissions);
  }, [router]);

  return (
    <ProfitThemeProvider theme={theme} toggleTheme={toggleTheme}>
      <div
        data-theme={theme}
        className={`${linearSans.variable} min-h-screen bg-ll-canvas`}
        style={{ fontFamily: "var(--font-linear-sans), sans-serif" }}
      >
        {children}
      </div>
    </ProfitThemeProvider>
  );
}
