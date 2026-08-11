"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { normalizeSpaces } from "@/lib/text-normalize";

// ll-themed port of GameinfoMemoryInput (see gameinfo-memory-input.js) — a
// text input that suggests distinct existing values from the column but
// still allows free typing. Same interaction logic, `linear-*` classes
// swapped for this module's `ll-*` tokens.
export default function ItuneComboInput({
  value,
  onChange,
  suggestions,
  placeholder,
  className,
  id,
  autoFocus,
  onEnter,
}) {
  const [open, setOpen] = useState(autoFocus ?? false);
  const [pos, setPos] = useState(null);
  const [hasTyped, setHasTyped] = useState(false);
  const ref = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
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
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          setOpen(false);
          setHasTyped(false);
          onEnter?.();
        }}
        autoComplete="off"
        className={
          className ??
          "w-full rounded-md border border-ll-hairline-strong bg-ll-surface-1 px-3 py-2 text-sm text-ll-ink outline-none focus:border-ll-primary focus:ring-2 focus:ring-ll-primary/20"
        }
      />
      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <ul
            ref={listRef}
            data-ll-combo-dropdown="true"
            style={{ top: pos.top + 4, left: pos.left, width: pos.width }}
            className="fixed z-50 max-h-56 overflow-auto rounded-md border border-ll-hairline bg-ll-surface-1 py-1 shadow-[var(--ll-shadow-modal)]"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-1.5 text-sm text-ll-ink-tertiary">ไม่มีตัวเลือกที่ตรงกัน</li>
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
                    className="block w-full px-3 py-1.5 text-left text-sm text-ll-ink hover:bg-ll-primary/10"
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
