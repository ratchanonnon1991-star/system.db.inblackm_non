"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

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
  const ref = useRef(null);

  useEffect(() => {
    function onDoc(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
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
  const filtered = (suggestions || [])
    .filter((s) => s.toLowerCase().includes(q))
    .filter((s) => s.toLowerCase() !== q)
    .slice(0, 8);

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
        }}
        onFocus={() => setOpen(true)}
        autoComplete="off"
        className={
          className ??
          "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        }
      />
      {open &&
        filtered.length > 0 &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <ul
            style={{ top: pos.top + 4, left: pos.left, width: pos.width }}
            className="fixed z-50 max-h-56 overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg"
          >
            {filtered.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange(s);
                    setOpen(false);
                  }}
                  className="block w-full px-3 py-1.5 text-left text-sm hover:bg-indigo-50"
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>,
          document.body
        )}
    </div>
  );
}
