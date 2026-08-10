"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Image as ImageIcon, Link as LinkIcon, Upload, X } from "lucide-react";

// data: URLs go straight into the pack row's JSONB, keep it modest.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

// Popup for a non-Tutorial image field (currency/pack image) — choose
// between pasting a URL or uploading a file from disk. There's no
// upload-to-storage backend in this app, so an uploaded file is read as a
// base64 data: URL and stored directly as the field's value, same as a
// pasted https:// URL — the CSP's img-src already allows both (see
// next.config.mjs).
export default function GameinfoImagePickerModal({ value, onChange, onClose }) {
  const [mode, setMode] = useState("url");
  const [url, setUrl] = useState(value || "");
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  function commitUrl() {
    onChange(url.trim());
    onClose();
  }

  function onFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
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

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm overflow-hidden rounded-lg border border-linear-hairline bg-linear-surface-1 shadow-2xl">
        <div className="flex items-center justify-between border-b border-linear-hairline px-4 py-2.5">
          <h2 className="text-sm font-semibold text-linear-ink">ใส่รูปภาพ</h2>
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
          {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
        </div>
      </div>
    </div>,
    document.body
  );
}
