"use client";

import { fmtDate } from "@/lib/profit-format";

export function DupBadge({ n }) {
  return n > 0 ? (
    <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600">{n}</span>
  ) : (
    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-600">0</span>
  );
}

export function GroupBadge({ group }) {
  return group === "human" ? (
    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-600">Human</span>
  ) : (
    <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-600">Bot</span>
  );
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

export function StatusBadge({ enabled }) {
  return enabled ? (
    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-600">เปิดใช้งาน</span>
  ) : (
    <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600">ปิดใช้งาน</span>
  );
}
