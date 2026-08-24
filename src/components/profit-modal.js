"use client";

import { X } from "lucide-react";

export default function ProfitModal({ title, onClose, children, actions }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-4 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md rounded-lg border border-ll-hairline bg-ll-surface-1 p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ll-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-ll-hairline-strong p-1.5 text-ll-ink-subtle transition hover:bg-ll-surface-2"
            aria-label="ปิด"
          >
            <X size={14} />
          </button>
        </div>
        <div className="flex flex-col gap-3">{children}</div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-ll-hairline-strong px-3.5 py-2 text-[12px] font-medium text-ll-ink transition hover:bg-ll-surface-2"
          >
            ยกเลิก
          </button>
          {actions}
        </div>
      </div>
    </div>
  );
}

export function ProfitField({ label, children }) {
  return (
    <label className="flex flex-col gap-1 text-[12px] font-medium text-ll-ink-subtle">
      {label}
      {children}
    </label>
  );
}

export const profitInputClass =
  "h-9 w-full rounded-md border border-ll-hairline-strong bg-ll-surface-2 px-2.5 text-[13px] text-ll-ink outline-none transition focus:border-ll-primary focus:bg-ll-surface-1";
