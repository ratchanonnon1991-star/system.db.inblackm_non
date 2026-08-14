"use client";

import { useEffect, useState } from "react";

const REFRESH_MS = 60 * 60 * 1000;

export function useGameinfoUsdtRate(initialValue) {
  const [value, setValue] = useState(initialValue ?? null);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch("/api/gameinfo/rates/usdt", {
          credentials: "include",
          cache: "no-store",
        });
        if (!response.ok) return;
        const data = await response.json();
        if (active && Number.isFinite(data.value)) setValue(data.value);
      } catch {
        // Keep the last valid rate. The server cache owns retry/backoff.
      }
    };

    const timer = window.setInterval(refresh, REFRESH_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  return value;
}
