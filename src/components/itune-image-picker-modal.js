"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Image as ImageIcon, Link as LinkIcon, Upload, X } from "lucide-react";
import { readImageFileAsDataUrl } from "@/lib/itune-image";

// ll-themed port of GameinfoImagePickerModal (see gameinfo-image-picker-modal.js):
// URL tab, upload tab, and Ctrl+V-paste-anywhere-in-the-modal, all funneling
// through the same readImageFileAsDataUrl() helper. Right-click paste is
// handled one level up, on the thumbnail that opens this modal (see
// itune-admin-table.js) — it bypasses this dialog entirely when it succeeds.
export default function ItuneImagePickerModal({ value, onChange, onClose }) {
  const [mode, setMode] = useState("url");
  const [url, setUrl] = useState(value || "");
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  function commitUrl() {
    onChange(url.trim());
    onClose();
  }

  function processFile(file) {
    setError("");
    readImageFileAsDataUrl(file)
      .then((dataUrl) => {
        onChange(dataUrl);
        onClose();
      })
      .catch((err) => setError(err.message));
  }

  function onFileChange(e) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }

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
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm overflow-hidden rounded-lg border border-ll-hairline bg-ll-surface-1 shadow-[var(--ll-shadow-modal)]">
        <div className="flex items-center justify-between border-b border-ll-hairline px-4 py-2.5">
          <h2 className="text-sm font-semibold text-ll-ink">ใส่รูปภาพ</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded text-ll-ink-tertiary hover:bg-ll-surface-2 hover:text-ll-ink"
            aria-label="ปิด"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex border-b border-ll-hairline">
          <button
            type="button"
            onClick={() => setMode("url")}
            className={`flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-medium ${
              mode === "url"
                ? "border-b-2 border-ll-primary text-ll-primary"
                : "text-ll-ink-tertiary hover:bg-ll-surface-2"
            }`}
          >
            <LinkIcon size={13} /> ใช้ URL
          </button>
          <button
            type="button"
            onClick={() => setMode("upload")}
            className={`flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-medium ${
              mode === "upload"
                ? "border-b-2 border-ll-primary text-ll-primary"
                : "text-ll-ink-tertiary hover:bg-ll-surface-2"
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
                className="h-9 w-full rounded border border-ll-hairline-strong bg-ll-surface-2 px-2 text-sm text-ll-ink outline-none focus:border-ll-primary"
              />
              <button
                type="button"
                onClick={commitUrl}
                className="h-9 w-full rounded-md bg-ll-primary text-xs font-medium text-ll-on-primary hover:bg-ll-primary-hover"
              >
                บันทึก
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex h-24 w-full flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-ll-hairline-strong text-ll-ink-tertiary hover:bg-ll-surface-2"
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
          <p className="mt-2 text-center text-[11px] text-ll-ink-tertiary">
            หรือกด Ctrl+V เพื่อวางรูปจากคลิปบอร์ดได้เลย
          </p>
          {error && <p className="mt-2 text-xs text-ll-primary">{error}</p>}
        </div>
      </div>
    </div>,
    document.body
  );
}
