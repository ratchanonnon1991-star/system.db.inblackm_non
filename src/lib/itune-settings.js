"use client";

// Per-user preferences for the itune/admin page, same localStorage-hook
// shape as useLLTheme(). A keyed object rather than a single flag so future
// settings (or future paste-able columns) can extend this without a new hook.
import { useCallback, useEffect, useState } from "react";

const SETTINGS_KEY = "projectm.itune-admin.settings";

const DEFAULT_SETTINGS = {
  rightClickPaste: true,
};

export function useItuneSettings() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SETTINGS_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === "object") {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- reading a browser preference is exactly what an effect is for
        setSettings({ ...DEFAULT_SETTINGS, ...parsed });
      }
    } catch {
      // preference is cosmetic; fall back to defaults
    }
  }, []);

  const setSetting = useCallback((key, value) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      try {
        window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {
        // preference is cosmetic; ignore a blocked storage
      }
      return next;
    });
  }, []);

  return [settings, setSetting];
}
