"use client";

import { fmtDate } from "@/lib/profit-format";

// Plain, non-interactive count -- used everywhere except the GoCash cards
// table (dashboard category rows, manual/Oxide tables), which don't track a
// review mark for their duplicates.
export function DupBadge({ n }) {
  return n > 0 ? (
    <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600">{n}</span>
  ) : (
    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-600">0</span>
  );
}

// Known sources get a fixed, distinct color each so "ใช้บัตร" columns
// (pack-costs, sale-prices) don't render every source in the same blue and
// read as if they're the same thing. Anything not in this map (a future
// source) falls back to a color from a separate palette, picked by a stable
// hash of the source key -- keeps it out of the known colors above and
// consistent across renders without needing to track "already used" colors.
const KNOWN_SOURCE_COLORS = {
  gocash: { bg: "bg-sky-50", text: "text-sky-600" },
  oxide: { bg: "bg-violet-50", text: "text-violet-600" },
};
const FALLBACK_SOURCE_PALETTE = [
  { bg: "bg-amber-50", text: "text-amber-600" },
  { bg: "bg-pink-50", text: "text-pink-600" },
  { bg: "bg-teal-50", text: "text-teal-600" },
  { bg: "bg-indigo-50", text: "text-indigo-600" },
  { bg: "bg-fuchsia-50", text: "text-fuchsia-600" },
  { bg: "bg-lime-50", text: "text-lime-700" },
];

function sourceBadgeColors(source) {
  if (KNOWN_SOURCE_COLORS[source]) return KNOWN_SOURCE_COLORS[source];
  const key = String(source || "");
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return FALLBACK_SOURCE_PALETTE[hash % FALLBACK_SOURCE_PALETTE.length];
}

export function SourceBadge({ source, label }) {
  const { bg, text } = sourceBadgeColors(source);
  return <span className={`rounded-full ${bg} px-2 py-0.5 text-[11px] font-semibold ${text}`}>{label ?? source}</span>;
}

export function GroupBadge({ group }) {
  if (group === "api") {
    return <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-600">API</span>;
  }
  if (group === "human") {
    return <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-600">Human</span>;
  }
  return <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-600">Bot</span>;
}

// Just the click-to-toggle pill -- who/when it was cleared shows in its own
// "เคลียร์โดย" table column (see ClearedByCell below) instead of being
// crammed into this cell, so it's visible as its own column even for cards
// that still need clearing (an empty "-" there makes it obvious the info
// exists at all, instead of only appearing once something's cleared).
export function DustBadge({ card, onToggle, disabled }) {
  if (card.needsDustClear) {
    return (
      <button
        type="button"
        disabled={disabled}
        title="คลิกเพื่อมาร์กว่าเคลียร์แล้ว"
        onClick={(e) => {
          e.stopPropagation();
          if (!window.confirm("ยืนยันว่าเคลียร์เศษบัตรนี้เรียบร้อยแล้วใช่ไหม?")) return;
          onToggle(card.id, true);
        }}
        className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50"
      >
        ต้องเคลียร์
      </button>
    );
  }
  if (card.dustCleared) {
    return (
      <button
        type="button"
        disabled={disabled}
        title={`เคลียร์โดย ${card.dustClearedByName || "ไม่ทราบชื่อ"} — คลิกเพื่อยกเลิกมาร์ก`}
        onClick={(e) => {
          e.stopPropagation();
          if (!window.confirm("ยืนยันว่าต้องการยกเลิกมาร์กเคลียร์เศษบัตรนี้ใช่ไหม?")) return;
          onToggle(card.id, false);
        }}
        className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 hover:bg-emerald-100 disabled:opacity-50"
      >
        เคลียร์แล้ว
      </button>
    );
  }
  return <span className="text-ll-ink-tertiary">-</span>;
}

export function ClearedByCell({ card }) {
  if (!card.dustCleared) return <span className="text-ll-ink-tertiary">-</span>;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-medium text-ll-ink">{card.dustClearedByName || "ไม่ทราบชื่อ"}</span>
      {card.dustClearedAt && <span className="text-[11px] text-ll-ink-tertiary">{fmtDate(card.dustClearedAt)}</span>}
    </div>
  );
}

// Same click-to-toggle shape as DustBadge, for Multi Game Card's
// "ต้องรวมบัตร" worklist (idle cards with a leftover balance).
export function MergeBadge({ card, onToggle, disabled }) {
  if (card.needsMerge) {
    return (
      <button
        type="button"
        disabled={disabled}
        title="คลิกเพื่อมาร์กว่ารวมบัตรแล้ว"
        onClick={(e) => {
          e.stopPropagation();
          if (!window.confirm("ยืนยันว่ารวมยอดของบัตรนี้ไปบัตรอื่นเรียบร้อยแล้วใช่ไหม?")) return;
          onToggle(card.id, true);
        }}
        className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50"
      >
        ต้องรวม
      </button>
    );
  }
  if (card.mergeCleared) {
    return (
      <button
        type="button"
        disabled={disabled}
        title={`รวมโดย ${card.mergeClearedByName || "ไม่ทราบชื่อ"} — คลิกเพื่อยกเลิกมาร์ก`}
        onClick={(e) => {
          e.stopPropagation();
          if (!window.confirm("ยืนยันว่าต้องการยกเลิกมาร์กรวมบัตรนี้ใช่ไหม?")) return;
          onToggle(card.id, false);
        }}
        className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 hover:bg-emerald-100 disabled:opacity-50"
      >
        รวมแล้ว
      </button>
    );
  }
  return <span className="text-ll-ink-tertiary">-</span>;
}

export function MergeClearedByCell({ card }) {
  if (!card.mergeCleared) return <span className="text-ll-ink-tertiary">-</span>;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-medium text-ll-ink">{card.mergeClearedByName || "ไม่ทราบชื่อ"}</span>
      {card.mergeClearedAt && <span className="text-[11px] text-ll-ink-tertiary">{fmtDate(card.mergeClearedAt)}</span>}
    </div>
  );
}

export function StatusBadge({ enabled }) {
  return enabled ? (
    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-600">เปิดใช้งาน</span>
  ) : (
    <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600">ปิดใช้งาน</span>
  );
}
