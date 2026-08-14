"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * A <select> that can be typed into to filter -- for dropdowns with enough
 * options (distinct column values, lookup rows) that scrolling a plain
 * <select> to find one is painful. Renders as a portal so it isn't clipped
 * by a scrolling modal.
 *
 * `options` is always `{ value, label }[]`; callers with plain strings pass
 * `value === label`. Typing filters by label; picking one commits `value`
 * (as a string) via `onChange`, same contract as a native <select>.
 */
export default function SearchableSelect({
  id,
  value,
  onChange,
  options,
  placeholder = "พิมพ์เพื่อค้นหา...",
  emptyLabel = "— ไม่ระบุ —",
  allowEmpty = true,
  extraOption = null,
  disabled = false,
  autoFocus = false,
  loading = false,
  onKeyDown,
  className,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedby,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pos, setPos] = useState(null);
  const ref = useRef(null);
  const listRef = useRef(null);

  const pool = useMemo(
    () => (extraOption ? [extraOption, ...options] : options),
    [options, extraOption]
  );
  const selected = useMemo(
    () => pool.find((option) => String(option.value) === String(value)) || null,
    [pool, value]
  );

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

  const needle = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    const list = needle ? pool.filter((option) => option.label.toLowerCase().includes(needle)) : pool;
    return list.slice(0, 200);
  }, [pool, needle]);

  const commit = (option) => {
    onChange(option ? String(option.value) : "");
    setQuery("");
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <input
        id={id}
        type="text"
        autoFocus={autoFocus}
        disabled={disabled}
        value={open ? query : selected ? selected.label : value ? String(value) : ""}
        placeholder={loading ? "กำลังโหลด..." : placeholder}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            setQuery("");
          } else if (e.key === "Enter" && open && filtered.length > 0) {
            e.preventDefault();
            commit(filtered[0]);
            return;
          }
          onKeyDown?.(e);
        }}
        autoComplete="off"
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedby}
        className={className}
      />
      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={listRef}
            style={{ top: pos.top + 4, left: pos.left, width: Math.max(pos.width, 200) }}
            className="fixed z-[70] max-h-64 overflow-auto rounded-sm border border-zinc-200 bg-white py-1 shadow-xl shadow-zinc-900/10"
          >
            {allowEmpty && (
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit(null);
                }}
                className="block w-full px-3 py-1.5 text-left text-[11px] font-semibold text-zinc-400 hover:bg-zinc-50"
              >
                {emptyLabel}
              </button>
            )}
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-[11px] font-semibold text-zinc-400">
                ไม่พบตัวเลือกที่ตรงกับคำค้นหา
              </div>
            ) : (
              filtered.map((option) => (
                <button
                  key={String(option.value)}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commit(option);
                  }}
                  className={`block w-full truncate px-3 py-1.5 text-left text-[11px] font-semibold hover:bg-red-50 hover:text-red-700 ${
                    String(option.value) === String(value) ? "bg-red-50 text-red-700" : "text-zinc-700"
                  }`}
                >
                  {option.label}
                </button>
              ))
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
