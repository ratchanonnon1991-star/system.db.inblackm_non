"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Image as ImageIcon, Link as LinkIcon, Upload, X } from "lucide-react";
import { useGameinfoDialog } from "@/lib/use-gameinfo-dialog";

// data: URLs go straight into the pack row's JSONB, keep it modest.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

// Popup for a non-Tutorial image field (currency/pack/game image) — choose
// between pasting a URL, uploading a file from disk, or Ctrl+V-pasting an
// image straight from the clipboard (screenshot, copied image, etc. — same
// file path as the file picker, just a different source). There's no
// upload-to-storage backend in this app, so a picked/pasted file is read as
// a base64 data: URL and stored directly as the field's value, same as a
// pasted https:// URL — the CSP's img-src already allows both (see
// next.config.mjs).
export default function GameinfoImagePickerModal({ value, onChange, onClose }) {
  const [mode, setMode] = useState("url");
  const [url, setUrl] = useState(value || "");
  const [error, setError] = useState("");
  const fileRef = useRef(null);
  const { dialogRef, titleId, onBackdropMouseDown } = useGameinfoDialog({ onRequestClose: onClose });

  function commitUrl() {
    onChange(url.trim());
    onClose();
  }

  function processFile(file) {
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
    reader.onload = () => {
      onChange(String(reader.result));
      onClose();
    };
    reader.onerror = () => setError("อ่านไฟล์ไม่สำเร็จ");
    reader.readAsDataURL(file);
  }

  function onFileChange(e) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
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
          if (file) {
            setMode("upload");
            processFile(file);
          }
          return;
        }
      }
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded text-linear-ink-tertiary hover:bg-linear-surface-2 hover:text-linear-ink"
            aria-label="ปิด"
          >
            <X size={14} />
          </button>
        </div>

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
      </div>
    </div>,
    document.body
  );
}
