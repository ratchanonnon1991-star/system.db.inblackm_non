"use client";

import { AlertTriangle, X } from "lucide-react";
import { useGameinfoDialog } from "@/lib/use-gameinfo-dialog";

export default function GameinfoConfirmDialog({ open, title, message, confirmLabel = "ยืนยัน", destructive = false, onConfirm, onClose }) {
  const { dialogRef, titleId, onBackdropMouseDown } = useGameinfoDialog({ open, onRequestClose: onClose });
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-4" onMouseDown={onBackdropMouseDown}>
      <div ref={dialogRef} role="alertdialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="w-full max-w-md rounded-2xl border border-linear-hairline bg-linear-surface-1 p-6 text-linear-ink" style={{ boxShadow: "var(--ll-shadow-modal)" }}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-linear-danger-bg text-linear-danger"><AlertTriangle size={18} /></span>
            <div><h2 id={titleId} className="text-base font-semibold tracking-[-0.1px]">{title}</h2><p className="mt-1 text-sm text-linear-ink-subtle">{message}</p></div>
          </div>
          <button type="button" onClick={onClose} aria-label="ปิด" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-linear-ink-tertiary hover:bg-linear-surface-2"><X size={16} /></button>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-10 rounded-lg border border-linear-hairline-strong px-4 text-sm text-linear-ink-muted hover:bg-linear-surface-2">ยกเลิก</button>
          <button type="button" onClick={onConfirm} className={`h-10 rounded-lg px-4 text-sm font-medium ${destructive ? "bg-linear-primary text-white hover:bg-linear-primary-hover" : "bg-linear-surface-4 text-white hover:opacity-90"}`}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
