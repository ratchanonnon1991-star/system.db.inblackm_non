"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A modal box starts wider than its compact design baseline and can be dragged
 * wider (or down to `min`) from a handle on its right edge -- the same pointer-capture drag
 * pattern panel-table.js's column resize already uses, kept here once so
 * every modal that wants this behaves the same way instead of each modal
 * reimplementing its own drag loop. Resets to its expanded initial width on remount (a
 * fresh mount of the modal), since a modal's width isn't worth persisting
 * per user the way a saved table column's width is.
 */
export function useResizableModalWidth(defaultWidth, { min = 420, max } = {}) {
  // The original baselines were comfortable for short forms but cramped the
  // table/configuration modals, forcing users to resize almost every time.
  // `w-full` and the overlay padding still keep this inside narrow screens.
  const initialWidth = Math.min(defaultWidth + 256, 1200);
  const [width, setWidth] = useState(initialWidth);
  const [resizing, setResizing] = useState(false);
  const dragRef = useRef(null);

  const startResize = useCallback((event) => {
    event.preventDefault();
    dragRef.current = { startX: event.clientX, startWidth: event.currentTarget.parentElement.offsetWidth };
    setResizing(true);
  }, []);

  useEffect(() => {
    if (!resizing) return undefined;
    const ceiling = max ?? (typeof window !== "undefined" ? window.innerWidth - 32 : Infinity);
    const move = (event) => {
      if (!dragRef.current) return;
      const next = dragRef.current.startWidth + (event.clientX - dragRef.current.startX);
      setWidth(Math.min(ceiling, Math.max(min, next)));
    };
    const stop = () => {
      dragRef.current = null;
      setResizing(false);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [resizing, min, max]);

  return { width, startResize, resizing };
}
