"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

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
        className={`flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded border px-2 py-1 focus-within:border-indigo-300 focus-within:bg-white ${
          invalid ? "border-red-300" : "border-transparent hover:bg-slate-50"
        }`}
      >
        {values.map((v, i) => (
          <span
            key={`${v}-${i}`}
            className="inline-flex items-center gap-1 rounded bg-indigo-100 px-2 py-0.5 text-xs text-indigo-800"
          >
            {v}
            <button
              type="button"
              onClick={() => remove(i)}
              className="text-indigo-500 hover:text-indigo-800"
              aria-label="ลบ"
            >
              ×
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
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                add(text);
              } else if (e.key === "Backspace" && !text && values.length) {
                remove(values.length - 1);
              }
            }}
            autoComplete="off"
            className="min-w-[80px] flex-1 border-none py-0.5 text-sm outline-none placeholder:text-slate-300"
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
            className="fixed z-50 max-h-56 overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg"
          >
            {filtered.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    add(s);
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
