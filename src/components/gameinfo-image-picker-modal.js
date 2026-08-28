"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Crop, Image as ImageIcon, Link as LinkIcon, Upload, X, ZoomIn } from "lucide-react";
import {
  CROP_OUTPUT_SIZE,
  centeredCropOffset,
  clampCropOffset,
  computeCropRect,
} from "@/lib/gameinfo-image-crop";
import { useGameinfoDialog } from "@/lib/use-gameinfo-dialog";
import {
  requestGameinfoDiscard,
  useGameinfoUnsavedChanges,
} from "@/lib/gameinfo-unsaved-changes";

// data: URLs go straight into the pack row's JSONB, keep it modest.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
// On-screen size of the square crop viewport.
const CROP_VIEWPORT = 288;
const MAX_ZOOM = 4;

// Popup for a non-Tutorial image field (currency/pack/game image) — choose
// between pasting a URL, uploading a file from disk, or Ctrl+V-pasting an
// image straight from the clipboard (screenshot, copied image, etc. — same
// file path as the file picker, just a different source). There's no
// upload-to-storage backend in this app, so a picked/pasted file is cropped to
// 1:1, re-encoded, and stored as a base64 data: URL — the field's value, same
// as a pasted https:// URL (the CSP's img-src already allows both, see
// next.config.mjs). Only the URL tab skips the crop step, since there is no
// file to re-encode.
export default function GameinfoImagePickerModal({ value, onChange, onClose }) {
  const [mode, setMode] = useState("url");
  const [url, setUrl] = useState(value || "");
  const [error, setError] = useState("");
  const fileRef = useRef(null);
  // A pasted image waits here until it has been cropped — nothing reaches
  // onChange, so closing the popup now discards it like an unsaved URL.
  const [cropSource, setCropSource] = useState(null);
  const dirty = Boolean(cropSource) || url.trim() !== String(value || "").trim();
  useGameinfoUnsavedChanges(dirty);

  function requestClose() {
    if (dirty) {
      requestGameinfoDiscard({
        message: cropSource ? "รูปที่วางไว้ยังไม่ได้ครอบ จะหายไป" : "URL รูปภาพที่ยังไม่บันทึกจะหายไป",
        confirmLabel: "ปิดโดยไม่บันทึก",
        onConfirm: onClose,
      });
      return;
    }
    onClose();
  }

  const { dialogRef, titleId, onBackdropMouseDown } = useGameinfoDialog({ onRequestClose: requestClose });

  function commitUrl() {
    onChange(url.trim());
    onClose();
  }

  function onFileChange(e) {
    const file = e.target.files?.[0];
    if (file) stageFileForCrop(file);
  }

  // Every file that comes from disk or the clipboard goes through the 1:1 crop
  // step; only the URL tab writes a value straight through.
  function stageFileForCrop(file) {
    if (!file.type.startsWith("image/")) {
      setError("เลือกไฟล์รูปภาพเท่านั้น");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError("ไฟล์ใหญ่เกินไป (สูงสุด 4MB)");
      return;
    }
    setError("");
    const reader = new FileReader();
    reader.onload = () => setCropSource({ dataUrl: String(reader.result), type: file.type });
    reader.onerror = () => setError("อ่านไฟล์ไม่สำเร็จ");
    reader.readAsDataURL(file);
  }

  // Ctrl+V anywhere while this popup is open — works regardless of which
  // tab is active or what has focus, as long as the clipboard actually
  // holds an image; a plain text paste (e.g. into the URL field) is left
  // alone so normal paste-a-link behavior still works there.
  useEffect(() => {
    function onPaste(e) {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) stageFileForCrop(file);
          return;
        }
      }
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"
      onMouseDown={onBackdropMouseDown}
    >
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="w-full max-w-2xl overflow-hidden rounded-lg border border-linear-hairline bg-linear-surface-1 shadow-2xl">
        <div className="flex items-center justify-between border-b border-linear-hairline px-4 py-2.5">
          <h2 id={titleId} className="text-sm font-semibold text-linear-ink">ใส่รูปภาพ</h2>
          <button
            type="button"
            onClick={requestClose}
            className="flex h-6 w-6 items-center justify-center rounded text-linear-ink-tertiary hover:bg-linear-surface-2 hover:text-linear-ink"
            aria-label="ปิด"
          >
            <X size={14} />
          </button>
        </div>

        {cropSource ? (
          <CropStage
            source={cropSource}
            onCancel={() => setCropSource(null)}
            onDone={(dataUrl) => {
              onChange(dataUrl);
              onClose();
            }}
          />
        ) : (
          <>
          <div className="flex border-b border-linear-hairline">
            <button
              type="button"
              onClick={() => setMode("url")}
              className={`flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-medium ${
                mode === "url"
                  ? "border-b-2 border-linear-primary text-linear-primary"
                  : "text-linear-ink-tertiary hover:bg-linear-surface-2"
              }`}
            >
              <LinkIcon size={13} /> ใช้ URL
            </button>
            <button
              type="button"
              onClick={() => setMode("upload")}
              className={`flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-medium ${
                mode === "upload"
                  ? "border-b-2 border-linear-primary text-linear-primary"
                  : "text-linear-ink-tertiary hover:bg-linear-surface-2"
              }`}
            >
              <Upload size={13} /> อัปโหลด
            </button>
          </div>

          <div className="p-4">
            {value && (
              <div className="mb-3 flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={value} alt="" className="h-24 w-24 rounded object-contain" />
              </div>
            )}

            {mode === "url" ? (
              <div className="space-y-2">
                <input
                  autoFocus
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && commitUrl()}
                  placeholder="https://..."
                  className="h-9 w-full rounded border border-linear-hairline-strong bg-linear-surface-2 px-2 text-sm text-linear-ink outline-none focus:border-linear-primary"
                />
                <button
                  type="button"
                  onClick={commitUrl}
                  className="h-9 w-full rounded-md bg-linear-primary text-xs font-medium text-white hover:bg-linear-primary-hover"
                >
                  บันทึก
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex h-24 w-full flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-linear-hairline-strong text-linear-ink-tertiary hover:bg-linear-surface-2"
                >
                  <ImageIcon size={20} />
                  <span className="text-xs">คลิกเพื่อเลือกไฟล์รูป</span>
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  onChange={onFileChange}
                  className="hidden"
                />
              </div>
            )}
            <p className="mt-2 text-center text-[11px] text-linear-ink-tertiary">
              หรือกด Ctrl+V เพื่อวางรูปจากคลิปบอร์ดได้เลย
            </p>
            {error && <p role="alert" className="mt-2 text-xs text-linear-danger">{error}</p>}
          </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

// 1:1 crop step: drag to pan, slide to zoom, and the square that is visible is
// exactly what gets written out. Hand-rolled because the app has no cropper
// dependency, and the geometry lives in gameinfo-image-crop.js.
function CropStage({ source, onCancel, onDone }) {
  const [natural, setNatural] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [error, setError] = useState("");
  const imageRef = useRef(null);
  const dragRef = useRef(null);

  const geometry = natural
    ? { naturalWidth: natural.width, naturalHeight: natural.height, viewport: CROP_VIEWPORT, zoom }
    : null;
  const scale = natural ? (CROP_VIEWPORT / Math.min(natural.width, natural.height)) * zoom : 1;

  const onImageLoad = useCallback((event) => {
    const { naturalWidth: width, naturalHeight: height } = event.currentTarget;
    if (!width || !height) {
      setError("อ่านรูปไม่สำเร็จ");
      return;
    }
    setNatural({ width, height });
    setOffset(
      centeredCropOffset({ naturalWidth: width, naturalHeight: height, viewport: CROP_VIEWPORT, zoom: 1 })
    );
  }, []);

  function onPointerDown(event) {
    if (!geometry) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, offset };
  }

  function onPointerMove(event) {
    const drag = dragRef.current;
    if (!drag || !geometry) return;
    setOffset(
      clampCropOffset(
        { x: drag.offset.x + (event.clientX - drag.x), y: drag.offset.y + (event.clientY - drag.y) },
        geometry
      )
    );
  }

  function endDrag() {
    dragRef.current = null;
  }

  function changeZoom(nextZoom) {
    if (!natural) return;
    // Keep whatever sits under the middle of the square under it after zooming.
    const ratio = nextZoom / zoom;
    const centre = CROP_VIEWPORT / 2;
    const next = { x: centre - (centre - offset.x) * ratio, y: centre - (centre - offset.y) * ratio };
    setZoom(nextZoom);
    setOffset(
      clampCropOffset(next, {
        naturalWidth: natural.width,
        naturalHeight: natural.height,
        viewport: CROP_VIEWPORT,
        zoom: nextZoom,
      })
    );
  }

  function confirmCrop() {
    const image = imageRef.current;
    if (!image || !geometry) return;
    const { sx, sy, size } = computeCropRect({ ...geometry, offset });
    if (!(size > 0)) {
      setError("ครอบรูปไม่สำเร็จ");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = CROP_OUTPUT_SIZE;
    canvas.height = CROP_OUTPUT_SIZE;
    const context = canvas.getContext("2d");
    if (!context) {
      setError("ครอบรูปไม่สำเร็จ");
      return;
    }
    context.drawImage(image, sx, sy, size, size, 0, 0, CROP_OUTPUT_SIZE, CROP_OUTPUT_SIZE);
    // PNG keeps transparency (logos, icons); anything else is a photo-ish
    // paste where JPEG keeps the data: URL far smaller.
    const dataUrl =
      source.type === "image/png"
        ? canvas.toDataURL("image/png")
        : canvas.toDataURL("image/jpeg", 0.9);
    onDone(dataUrl);
  }

  return (
    <div className="p-4">
      <div className="mb-2 flex items-center gap-1.5 text-xs text-linear-ink-subtle">
        <Crop size={13} /> ครอบรูปเป็นสัดส่วน 1:1 ก่อนใช้งาน
      </div>
      <div className="flex justify-center">
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          style={{ width: CROP_VIEWPORT, height: CROP_VIEWPORT }}
          className="relative touch-none overflow-hidden rounded-md border border-linear-hairline-strong bg-linear-surface-2"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imageRef}
            src={source.dataUrl}
            alt=""
            onLoad={onImageLoad}
            draggable={false}
            style={
              natural
                ? {
                    width: natural.width * scale,
                    height: natural.height * scale,
                    transform: `translate(${offset.x}px, ${offset.y}px)`,
                  }
                : { visibility: "hidden" }
            }
            className="max-w-none cursor-grab select-none active:cursor-grabbing"
          />
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <ZoomIn size={14} className="shrink-0 text-linear-ink-tertiary" />
        <input
          type="range"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={zoom}
          onChange={(event) => changeZoom(Number(event.target.value))}
          aria-label="ย่อ/ขยายรูป"
          className="w-full"
        />
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="h-9 flex-1 rounded-md border border-linear-hairline-strong text-xs font-medium text-linear-ink hover:bg-linear-surface-2"
        >
          ยกเลิก
        </button>
        <button
          type="button"
          onClick={confirmCrop}
          disabled={!natural}
          className="h-9 flex-1 rounded-md bg-linear-primary text-xs font-medium text-white hover:bg-linear-primary-hover disabled:opacity-50"
        >
          ใช้รูปนี้
        </button>
      </div>
      <p className="mt-2 text-center text-[11px] text-linear-ink-tertiary">
        ลากรูปเพื่อเลื่อนตำแหน่ง แล้วกด &quot;ใช้รูปนี้&quot;
      </p>
      {error && <p role="alert" className="mt-2 text-xs text-linear-danger">{error}</p>}
    </div>
  );
}
