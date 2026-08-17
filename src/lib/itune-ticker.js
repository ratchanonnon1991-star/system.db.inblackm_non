"use client";

import { useEffect, useState } from "react";

const TICK_MS = 60_000;

// One shared interval per table (call this once in itune-admin-table.js and
// pass `now` down to every ItuneCountdownCell) rather than one setInterval
// per row — the countdown column only needs minute-granularity anyway.
export function useMinuteTicker() {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  return now;
}
