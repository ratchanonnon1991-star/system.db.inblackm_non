"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, ZoomIn, ZoomOut } from "lucide-react";

// ll-themed fork of GameinfoImagePreview (see gameinfo-image-preview.js) —
// only the hover-popup chrome differs (linear-* -> ll-* tokens); the
// fullscreen zoom overlay is already theme-neutral black/white and is
// reproduced verbatim.
export default function ItuneImagePreview({
  src,
  alt = "",
  children,
  wrapperClassName = "inline-block",
  hoverPreview = true,
  onClick,
}) {
  const [hover, setHover] = useState(false);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const ref = useRef(null);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape") closeOverlay();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!src) return children;

  function closeOverlay() {
    setOpen(false);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  function clampZoom(z) {
    return Math.min(4, Math.max(1, z));
  }

  function applyZoom(next) {
    const clamped = clampZoom(next);
    setZoom(clamped);
    if (clamped === 1) setPan({ x: 0, y: 0 });
  }

  function onWheel(e) {
    e.preventDefault();
    applyZoom(zoom + (e.deltaY > 0 ? -0.3 : 0.3));
  }

  function onDoubleClick(e) {
    e.stopPropagation();
    applyZoom(zoom > 1 ? 1 : 2.5);
  }

  function onPointerDown(e) {
    if (zoom <= 1) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    dragRef.current = { startX: e.clientX, startY: e.clientY, startPan: pan };
  }
  function onPointerMove(e) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPan({ x: dragRef.current.startPan.x + dx, y: dragRef.current.startPan.y + dy });
  }
  function onPointerUp() {
    dragRef.current = null;
    setDragging(false);
  }

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
        className={wrapperClassName}
        onMouseEnter={
          hoverPreview
            ? () => {
                updatePos();
                setHover(true);
              }
            : undefined
        }
        onMouseLeave={hoverPreview ? () => setHover(false) : undefined}
        onClick={() => {
          setHover(false);
          if (onClick) onClick();
          else setOpen(true);
        }}
        style={{ cursor: onClick ? "pointer" : "zoom-in" }}
      >
        {children}
      </div>

      {hover &&
        !open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          // z-[80] — same reasoning as the fullscreen overlay below: this
          // thumbnail can be inside another modal (e.g. ประวัติยอด/
          // ItuneAmountHistoryModal, opened from the "⋮" menu), whose own
          // z-[70] backdrop would otherwise bury this hover preview. Safe to
          // share a tier with the fullscreen overlay since `!open` above
          // means the two never render at the same time.
          <div
            style={{ top: pos.top, left: pos.left }}
            className="pointer-events-none fixed z-[80] rounded-lg border border-ll-hairline bg-ll-surface-1 p-1"
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
          // z-[80], above every modal's z-[70] backdrop (see
          // itune-admin-table.js) — a thumbnail can appear inside another
          // modal (e.g. ประวัติยอด/ItuneAmountHistoryModal), and this
          // fullscreen zoom needs to sit on top of that modal, not get
          // buried behind its own backdrop.
          <div
            className="fixed inset-0 z-[80] flex items-center justify-center overflow-hidden bg-black/70 p-6"
            onClick={closeOverlay}
            onWheel={onWheel}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={alt}
              className="h-[80vmin] w-auto max-w-full select-none rounded-lg object-contain"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transition: dragging ? "none" : "transform 0.15s ease-out",
                cursor: zoom > 1 ? (dragging ? "grabbing" : "grab") : "zoom-in",
                touchAction: "none",
              }}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={onDoubleClick}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
              draggable={false}
            />
            <div
              className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-black/40 p-1 backdrop-blur"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => applyZoom(zoom - 0.5)}
                disabled={zoom <= 1}
                className="flex h-8 w-8 items-center justify-center rounded-full text-white hover:bg-white/15 disabled:opacity-40"
                aria-label="ซูมออก"
              >
                <ZoomOut size={16} />
              </button>
              <span className="w-12 text-center text-xs text-white/80">{Math.round(zoom * 100)}%</span>
              <button
                type="button"
                onClick={() => applyZoom(zoom + 0.5)}
                disabled={zoom >= 4}
                className="flex h-8 w-8 items-center justify-center rounded-full text-white hover:bg-white/15 disabled:opacity-40"
                aria-label="ซูมเข้า"
              >
                <ZoomIn size={16} />
              </button>
            </div>
            <button
              type="button"
              onClick={closeOverlay}
              className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
              aria-label="ปิด"
            >
              <X size={18} />
            </button>
          </div>,
          document.body
        )}
    </>
  );
}
