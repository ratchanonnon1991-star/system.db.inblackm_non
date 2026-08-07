"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Wraps any thumbnail — hover shows a larger popup, click opens a full-screen
// overlay. Ported from gameinfo's ImagePreview component.
export default function GameinfoImagePreview({ src, alt = "", children }) {
  const [hover, setHover] = useState(false);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!src) return children;

  function updatePos() {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ top: r.bottom + 6, left: r.left });
  }

  return (
    <>
      <div
        ref={ref}
        className="inline-block"
        onMouseEnter={() => {
          updatePos();
          setHover(true);
        }}
        onMouseLeave={() => setHover(false)}
        onClick={() => {
          setHover(false);
          setOpen(true);
        }}
        style={{ cursor: "zoom-in" }}
      >
        {children}
      </div>

      {hover &&
        !open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            style={{ top: pos.top, left: pos.left }}
            className="pointer-events-none fixed z-50 rounded-lg border border-slate-200 bg-white p-1 shadow-xl"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={alt}
              className="aspect-square h-48 w-48 rounded object-contain"
            />
          </div>,
          document.body
        )}

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-6"
            onClick={() => setOpen(false)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={alt}
              className="aspect-square h-[80vmin] w-[80vmin] rounded-lg object-contain shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-2xl text-white hover:bg-white/20"
              aria-label="ปิด"
            >
              ×
            </button>
          </div>,
          document.body
        )}
    </>
  );
}
