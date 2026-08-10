"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

// Multi-value chip input with the same "remembers past values" dropdown as
// GameinfoMemoryInput — used for pack payment channels. Ported from
// gameinfo's TagsInput.tsx (slate palette swapped for zinc).
export default function GameinfoTagsInput({
  values,
  onChange,
  suggestions,
  placeholder,
  max,
  invalid,
}) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const ref = useRef(null);
  const atMax = typeof max === "number" && values.length >= max;

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

  function add(v) {
    const t = v.trim();
    if (!t) return;
    if (values.some((x) => x.toLowerCase() === t.toLowerCase())) {
      setText("");
      return;
    }
    if (atMax) return;
    onChange([...values, t]);
    setText("");
  }

  function remove(i) {
    onChange(values.filter((_, idx) => idx !== i));
  }

  const q = text.trim().toLowerCase();
  const filtered = (suggestions || [])
    .filter((s) => !values.some((v) => v.toLowerCase() === s.toLowerCase()))
    .filter((s) => s.toLowerCase().includes(q))
    .slice(0, 8);

  return (
    <div className="relative" ref={ref}>
      <div
        className={`flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded border px-2 py-1 focus-within:border-linear-primary/40 focus-within:bg-linear-surface-1 ${
          invalid ? "border-red-500/40" : "border-transparent hover:bg-linear-surface-2"
        }`}
      >
        {values.map((v, i) => (
          <span
            key={`${v}-${i}`}
            className="inline-flex items-center gap-1 rounded bg-linear-primary/15 px-2 py-0.5 text-xs text-linear-primary"
          >
            {v}
            <button
              type="button"
              onClick={() => remove(i)}
              className="flex items-center text-linear-primary hover:text-linear-primary"
              aria-label="ลบ"
            >
              <X size={12} />
            </button>
          </span>
        ))}
        {!atMax && (
          <input
            type="text"
            value={text}
            placeholder={values.length === 0 ? placeholder : ""}
            onChange={(e) => {
              setText(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            // Adding a tag keeps the input focused (its onMouseDown calls
            // preventDefault) — a later click to reopen the dropdown
            // wouldn't re-fire onFocus since focus never changed.
            onClick={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                add(text);
              } else if (e.key === "Backspace" && !text && values.length) {
                remove(values.length - 1);
              }
            }}
            autoComplete="off"
            className="min-w-[80px] flex-1 border-none py-0.5 text-sm outline-none placeholder:text-linear-ink-tertiary"
          />
        )}
      </div>
      {open &&
        !atMax &&
        filtered.length > 0 &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <ul
            style={{ top: pos.top + 4, left: pos.left, width: pos.width }}
            className="fixed z-50 max-h-56 overflow-auto rounded-md border border-linear-hairline bg-linear-surface-1 py-1 shadow-lg"
          >
            {filtered.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    add(s);
                  }}
                  className="block w-full px-3 py-1.5 text-left text-sm text-linear-ink hover:bg-linear-primary/10"
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
