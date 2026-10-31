"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, LoaderCircle } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { GAMEINFO_COLUMN_ROLE_ALL_GAMES } from "@/lib/gameinfo-column-roles";
import { gameinfoColumnOrderFor, sortGameinfoPackColumns } from "@/lib/gameinfo-pack-columns";

// The order pack columns start in, for every game or for the game picked above.
export default function GameinfoColumnOrder({ columns, orders, gameId, onSaved }) {
  const everyGame = Number(gameId) === GAMEINFO_COLUMN_ROLE_ALL_GAMES;
  const ownOrder = orders[gameId] || null;
  const saved = useMemo(
    () => sortGameinfoPackColumns(columns, gameinfoColumnOrderFor(orders, gameId)),
    [columns, orders, gameId]
  );
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const list = draft || saved;

  function move(index, step) {
    const next = [...list];
    const [column] = next.splice(index, 1);
    next.splice(index + step, 0, column);
    setDraft(next);
    setNotice("");
  }

  async function save(columnIds, message) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await apiJson("/api/gameinfo/column-order", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId: Number(gameId), columnIds }),
        fallbackError: "บันทึกลำดับคอลัมน์ไม่สำเร็จ",
      });
      onSaved(result.orders);
      setDraft(null);
      setNotice(message);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "บันทึกลำดับคอลัมน์ไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  const iconButton = "flex h-8 w-8 items-center justify-center rounded-md text-linear-ink-muted hover:bg-linear-surface-3 disabled:opacity-30";
  return (
    <section aria-labelledby="column-order-title" className="space-y-3 rounded-xl border border-linear-hairline p-4">
      <div>
        <h2 id="column-order-title" className="font-bold text-linear-ink">ลำดับคอลัมน์</h2>
        <p className="mt-0.5 text-xs text-linear-ink-tertiary">
          {everyGame ? "ลำดับที่ทุกเกมใช้ เว้นแต่เกมที่ตั้งเฉพาะไว้" : ownOrder ? "เกมนี้ตั้งลำดับของตัวเองไว้" : "เกมนี้ใช้ค่ากลางอยู่ บันทึกแล้วจะเป็นลำดับเฉพาะเกมนี้"}
          {" · "}ใครบันทึกชุดคอลัมน์ไว้เองจะยังเห็นลำดับของตัวเอง จนกว่าจะรีเซ็ต
        </p>
      </div>
      <ol className="divide-y divide-linear-hairline rounded-lg border border-linear-hairline">
        {list.map((column, index) => (
          <li key={column.id} className="flex items-center gap-2 px-3 py-1">
            <span className="w-6 text-right text-xs tabular-nums text-linear-ink-tertiary">{index + 1}</span>
            <span className="min-w-0 flex-1 truncate text-sm text-linear-ink">{column.label}</span>
            <button type="button" disabled={saving || index === 0} onClick={() => move(index, -1)} aria-label={`ย้าย ${column.label} ขึ้น`} className={iconButton}>
              <ChevronUp size={16} aria-hidden="true" />
            </button>
            <button type="button" disabled={saving || index === list.length - 1} onClick={() => move(index, 1)} aria-label={`ย้าย ${column.label} ลง`} className={iconButton}>
              <ChevronDown size={16} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ol>
      {error ? <p role="alert" className="text-sm text-linear-danger">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={saving || !draft}
          onClick={() => save(list.map((column) => column.id), "บันทึกลำดับแล้ว")}
          className="flex h-9 items-center gap-1.5 rounded-lg bg-[#D90005] px-4 text-sm font-bold text-white hover:bg-[#B80004] disabled:opacity-40"
        >
          {saving ? <LoaderCircle size={14} className="animate-spin" aria-hidden="true" /> : null}
          บันทึกลำดับ
        </button>
        {draft ? (
          <button type="button" disabled={saving} onClick={() => setDraft(null)} className="h-9 rounded-lg px-3 text-sm text-linear-ink-muted hover:bg-linear-surface-2">
            ยกเลิก
          </button>
        ) : null}
        {ownOrder ? (
          <button
            type="button"
            disabled={saving}
            onClick={() => save([], everyGame ? "กลับเป็นลำดับเริ่มต้นแล้ว" : "เกมนี้กลับไปใช้ค่ากลางแล้ว")}
            className="h-9 rounded-lg border border-linear-hairline-strong px-3 text-sm text-linear-ink-muted hover:bg-linear-surface-2"
          >
            {everyGame ? "กลับเป็นลำดับเริ่มต้น" : "กลับไปใช้ค่ากลาง"}
          </button>
        ) : null}
        {notice ? <span role="status" className="text-sm text-emerald-700 dark:text-emerald-400">{notice}</span> : null}
      </div>
    </section>
  );
}
