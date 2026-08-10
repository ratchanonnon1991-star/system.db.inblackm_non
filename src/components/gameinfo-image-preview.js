"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, ZoomIn, ZoomOut } from "lucide-react";

// Wraps any thumbnail — hover shows a larger popup, click opens a full-screen
// overlay. Ported from gameinfo's ImagePreview component. `wrapperClassName`
// defaults to "inline-block" (shrink to the thumbnail's own size); pass
// "block w-full" instead when the image itself should stretch edge-to-edge
// with surrounding text (see gameinfo-tutorial-modal.js) — inline-block would
// otherwise ignore the child img's own w-full and fall back to its intrinsic
// size, since a shrink-to-fit box has no definite width to resolve a
// percentage against. `hoverPreview` (default true) can be turned off to
// keep just the click-to-fullscreen behavior without the little hover popup
// — useful for a full-width image already big enough on its own (see
// gameinfo-tutorial-modal.js's read-only step view). `onClick`, if given,
// replaces the default "open fullscreen" click behavior — used where the
// thumbnail is itself an edit trigger (hover still previews the current
// image, but a click should open the upload/URL picker instead of a
// zoomed view of it — see RowThumb in gameinfo-gamelist-table.js and
// ImageUrlField in gameinfo-pack-editor.js).
export default function GameinfoImagePreview({
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

  // Zoom/pan state for the fullscreen overlay — wheel or the +/- buttons to
  // zoom, drag to pan once zoomed in, double-click to toggle. Reset every
  // time the overlay closes so reopening always starts back at fit-to-screen.
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

  // Reset zoom/pan on the way out so reopening always starts back at
  // fit-to-screen — done here rather than in an effect keyed off `open`
  // since that would mean setting state synchronously during render's
  // commit phase for a value nothing else reads while closed.
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
          <div
            style={{ top: pos.top, left: pos.left }}
            className="pointer-events-none fixed z-50 rounded-lg border border-linear-hairline bg-linear-surface-1 p-1 shadow-xl"
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
            className="fixed inset-0 z-[60] flex items-center justify-center overflow-hidden bg-black/70 p-6"
            onClick={closeOverlay}
            onWheel={onWheel}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={alt}
              className="aspect-square h-[80vmin] w-[80vmin] select-none rounded-lg object-contain shadow-2xl"
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
