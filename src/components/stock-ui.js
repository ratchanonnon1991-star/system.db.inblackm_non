"use client";

import { X } from "lucide-react";
import { STOCK_ACCOUNT_STATUS_LABELS } from "@/lib/stock";

// Pieces shared by the stock pages: tones, pills, the dialog frame, inputs.

export const STOCK_TONE_CLASS = {
  ok: "bg-emerald-50 text-emerald-700",
  low: "bg-amber-100 text-amber-800",
  empty: "bg-red-100 text-red-700",
};
export const STOCK_BAR_CLASS = { ok: "bg-emerald-600", low: "bg-amber-600", empty: "bg-red-600" };
const STATUS_CLASS = {
  active: "bg-emerald-50 text-emerald-700",
  check: "bg-amber-100 text-amber-800",
  closed: "bg-zinc-200 text-zinc-600",
};

export const stockInputClass = "h-11 w-full rounded-[10px] border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-[#D90005] focus:ring-2 focus:ring-[#D90005]/15";

export function formatStockNumber(value, digits = 2) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return Number(value).toLocaleString("en-US", { maximumFractionDigits: digits });
}

export function StockLeftBadge({ item }) {
  return (
    <span className={`inline-block min-w-11 rounded-full px-2.5 py-1 text-center text-[13px] font-black ${STOCK_TONE_CLASS[item.tone]}`}>
      {item.left}
    </span>
  );
}

export function StockStatusPill({ status }) {
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-black ${STATUS_CLASS[status] || STATUS_CLASS.active}`}>
      {STOCK_ACCOUNT_STATUS_LABELS[status] || status}
    </span>
  );
}

export function StockDialog({ title, subtitle, icon, iconClass = "bg-zinc-100 text-zinc-700", onClose, children, footer, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-zinc-900/55 p-4 sm:p-8" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`w-full ${wide ? "max-w-3xl" : "max-w-xl"} overflow-hidden rounded-[22px] bg-white text-zinc-900 shadow-[0_24px_60px_rgba(0,0,0,0.25)]`}>
        <div className="flex items-center gap-3 border-b border-zinc-100 px-6 py-5">
          {icon ? <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconClass}`}>{icon}</span> : null}
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-black">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-[13px] text-zinc-600">{subtitle}</p> : null}
          </div>
          <button type="button" onClick={onClose} aria-label="ปิด" className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 text-zinc-600 hover:bg-zinc-50">
            <X size={16} strokeWidth={2.4} />
          </button>
        </div>
        <div className="flex flex-col gap-4 px-6 py-5">{children}</div>
        {footer ? <div className="flex flex-wrap justify-end gap-2.5 border-t border-zinc-100 bg-zinc-50 px-6 py-4">{footer}</div> : null}
      </div>
    </div>
  );
}

export function StockField({ label, htmlFor, hint, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[13px] font-extrabold text-zinc-700">{label}</label>
      {children}
      {hint ? <p className="text-xs text-zinc-600">{hint}</p> : null}
    </div>
  );
}
