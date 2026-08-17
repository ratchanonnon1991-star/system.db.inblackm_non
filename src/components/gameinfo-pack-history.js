"use client";

import { useEffect, useState } from "react";
import { Clock3, X } from "lucide-react";
import { apiJson } from "@/lib/api-json";

const ACTION_LABELS = {
  create: "เพิ่ม pack",
  duplicate: "ทำสำเนา pack",
  update: "แก้ไข pack/ลำดับ",
  reorder: "ย้ายลำดับ pack",
  delete: "ลบ pack",
  config_update: "แก้ไขสูตร/การตั้งค่า",
  import_append: "นำเข้า CSV แบบเพิ่ม",
  import_replace: "นำเข้า CSV แบบแทนที่",
};

export default function GameinfoPackHistory({ gameId, historyUrl }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState([]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  async function showHistory() {
    setOpen(true);
    setLoading(true);
    setError("");
    try {
      const data = await apiJson(historyUrl, { fallbackError: "โหลดประวัติไม่สำเร็จ" });
      setHistory(Array.isArray(data.history) ? data.history : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดประวัติไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={showHistory}
        className="inline-flex items-center gap-1.5 rounded-md border border-linear-hairline-strong px-3 py-1.5 text-xs text-linear-ink-muted hover:bg-linear-surface-2"
      >
        <Clock3 size={14} /> ประวัติการแก้ไข
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="ประวัติการแก้ไขแพ็ก"
            className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-linear-hairline bg-linear-surface-1 shadow-2xl"
          >
            <header className="flex items-center justify-between border-b border-linear-hairline px-4 py-3">
              <div>
                <h2 className="font-semibold text-linear-ink">ประวัติการแก้ไขแพ็ก</h2>
                <p className="text-xs text-linear-ink-tertiary">Game ID {gameId} · เวลาประเทศไทย</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="ปิดประวัติ"
                className="rounded p-1 text-linear-ink-tertiary hover:bg-linear-surface-3 hover:text-linear-ink"
              >
                <X size={17} />
              </button>
            </header>

            <div className="overflow-y-auto p-4">
              {loading ? (
                <p className="py-8 text-center text-sm text-linear-ink-tertiary">กำลังโหลด...</p>
              ) : error ? (
                <p className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">{error}</p>
              ) : history.length === 0 ? (
                <p className="py-8 text-center text-sm text-linear-ink-tertiary">ยังไม่มีประวัติการแก้ไข</p>
              ) : (
                <div className="space-y-2">
                  {history.map((entry) => (
                    <HistoryEntry key={entry.id} entry={entry} />
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function HistoryEntry({ entry }) {
  const packName = entry.after?.name || entry.before?.name || entry.before?.sourcePackId || "";
  return (
    <article className="rounded-lg border border-linear-hairline bg-linear-surface-2 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-linear-ink">
            {ACTION_LABELS[entry.action] || entry.action}
            {packName ? <span className="font-normal text-linear-ink-muted"> · {packName}</span> : null}
          </p>
          <p className="mt-0.5 text-xs text-linear-ink-tertiary">
            โดย {entry.actorName || "ไม่ทราบผู้แก้"}
            {entry.packId ? ` · Pack ID ${entry.packId}` : ""}
            {entry.source && entry.source !== "editor" ? ` · ${entry.source}` : ""}
          </p>
        </div>
        <time className="shrink-0 text-xs text-linear-ink-tertiary" dateTime={entry.createdAt || undefined}>
          {formatBangkokTime(entry.createdAt)}
        </time>
      </div>
      <details className="mt-2 text-xs text-linear-ink-subtle">
        <summary className="cursor-pointer text-linear-primary">ดูข้อมูลก่อนและหลัง</summary>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          <JsonBlock title="ก่อนแก้" value={entry.before} />
          <JsonBlock title="หลังแก้" value={entry.after} />
        </div>
      </details>
    </article>
  );
}

function JsonBlock({ title, value }) {
  return (
    <div className="min-w-0 rounded border border-linear-hairline bg-linear-surface-1 p-2">
      <p className="mb-1 font-medium text-linear-ink-muted">{title}</p>
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all text-[10px] leading-relaxed text-linear-ink-tertiary">
        {value == null ? "—" : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function formatBangkokTime(value) {
  if (!value) return "ไม่ทราบเวลา";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(date);
}
