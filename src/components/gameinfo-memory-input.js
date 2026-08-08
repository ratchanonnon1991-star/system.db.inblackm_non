"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { normalizeSpaces } from "@/lib/text-normalize";

// Text input that remembers past values — type to filter, click to pick.
// Ported from gameinfo's MemoryInput.tsx (slate palette swapped for this
// repo's zinc, portal + reposition-on-scroll logic kept as-is).
export default function GameinfoMemoryInput({
  value,
  onChange,
  suggestions,
  placeholder,
  className,
  id,
  autoFocus,
}) {
  const [open, setOpen] = useState(autoFocus ?? false);
  const [pos, setPos] = useState(null);
  // Google Sheets-style dropdown: clicking into the field shows every past
  // value regardless of what's already filled in (the cell's current value
  // shouldn't act as a filter query before the user has actually typed
  // anything new) — narrows to a substring match only once they type.
  const [hasTyped, setHasTyped] = useState(false);
  const ref = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    // The suggestion list is a portal into document.body, not a DOM
    // descendant of `ref` — without also checking listRef, any click inside
    // it that doesn't land exactly on a suggestion button (padding, the
    // scrollbar, between items) reads as "outside" and closes the dropdown
    // mid-selection.
    function onDoc(e) {
      if (ref.current?.contains(e.target)) return;
      if (listRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    if (!open) return;
    function updatePos() {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setPos({ top: r.bottom, left: r.left, width: r.width });
    }
    updatePos();
    window.addEventListener("scroll", updatePos, true);
    window.addEventListener("resize", updatePos);
    return () => {
      window.removeEventListener("scroll", updatePos, true);
      window.removeEventListener("resize", updatePos);
    };
  }, [open]);

  const q = value.trim().toLowerCase();
  const pool = suggestions || [];
  const filtered = hasTyped
    ? pool.filter((s) => s.toLowerCase().includes(q)).filter((s) => s.toLowerCase() !== q).slice(0, 50)
    : pool.slice(0, 50);

  return (
    <div className="relative" ref={ref}>
      <input
        id={id}
        type="text"
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHasTyped(true);
        }}
        onFocus={() => {
          setOpen(true);
          setHasTyped(false);
        }}
        onBlur={() => {
          const normalized = normalizeSpaces(value);
          if (normalized !== value) onChange(normalized);
        }}
        onClick={() => {
          // Picking a suggestion keeps the input focused (its own onMouseDown
          // calls preventDefault so the click doesn't blur it) — which means
          // a later click to reopen the dropdown never re-fires onFocus,
          // since focus never actually changed. Handle it here too.
          setOpen(true);
        }}
        autoComplete="off"
        className={
          className ??
          "w-full rounded-md border border-linear-hairline-strong bg-linear-surface-1 px-3 py-2 text-sm outline-none focus:border-linear-primary focus:ring-2 focus:ring-linear-primary/20"
        }
      />
      {/* Stays mounted for as long as the field is focused/editing (`open`),
          even with zero matches — showing a "no match" line instead of
          disappearing keeps it from flickering closed/open as you type past
          an exact match. One shared component, so this applies everywhere
          GameinfoMemoryInput is used (list cells, detail-page edit form,
          pack editor). */}
      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <ul
            ref={listRef}
            style={{ top: pos.top + 4, left: pos.left, width: pos.width }}
            className="fixed z-50 max-h-56 overflow-auto rounded-md border border-linear-hairline bg-linear-surface-1 py-1 shadow-lg"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-1.5 text-sm text-white/40">ไม่มีตัวเลือกที่ตรงกัน</li>
            ) : (
              filtered.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onChange(s);
                      setOpen(false);
                      setHasTyped(false);
                    }}
                    className="block w-full px-3 py-1.5 text-left text-sm text-white hover:bg-linear-primary/10"
                  >
                    {s}
                  </button>
                </li>
              ))
            )}
          </ul>,
          document.body
        )}
    </div>
  );
}
