"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronRight, Clock3, X } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { AUDIT_AREA_LABELS, groupGameinfoPackAudit } from "@/lib/gameinfo-audit-groups";
import { formatAuditValue, summarizeGameinfoAudit } from "@/lib/gameinfo-audit-diff";

const ACTION_LABELS = {
  create: "เพิ่ม pack",
  duplicate: "ทำสำเนา pack",
  update: "แก้ไข",
  reorder: "ย้ายลำดับ pack",
  delete: "ลบ pack",
  config_update: "แก้ไขสูตร/การตั้งค่า",
  import_append: "นำเข้า CSV แบบเพิ่ม",
  import_replace: "นำเข้า CSV แบบแทนที่",
  group_rename: "เปลี่ยนชื่อสกุลเงิน/หมวดหมู่",
};

const AREA_FILTERS = [{ value: "", label: "ทุกส่วน" }, ...Object.entries(AUDIT_AREA_LABELS).map(([value, label]) => ({ value, label }))];

export default function GameinfoAllPackHistory() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState([]);
  const [selected, setSelected] = useState(null);
  const [area, setArea] = useState("");
  const [dataMode, setDataMode] = useState("");
  const groups = useMemo(() => groupGameinfoPackAudit(history), [history]);

  useEffect(() => {
    if (!open) return;
    function closeEscape(event) {
      if (event.key === "Escape") selected ? setSelected(null) : setOpen(false);
    }
    window.addEventListener("keydown", closeEscape);
    return () => window.removeEventListener("keydown", closeEscape);
  }, [open, selected]);

  async function show(nextArea = area, nextMode = dataMode) {
    setOpen(true);
    setSelected(null);
    setArea(nextArea);
    setDataMode(nextMode);
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ limit: "1000" });
      if (nextArea) query.set("area", nextArea);
      if (nextMode) query.set("mode", nextMode);
      const data = await apiJson(`/api/gameinfo/packs/history?${query}`, {
        fallbackError: "โหลดประวัติรวมไม่สำเร็จ",
      });
      setHistory(Array.isArray(data.history) ? data.history : []);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "โหลดประวัติรวมไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button type="button" onClick={show} className="flex h-10 items-center gap-2 rounded-xl border border-linear-hairline-strong px-3 text-sm text-linear-ink-muted hover:bg-linear-surface-2">
        <Clock3 size={16} /> ประวัติการแก้ไข
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
          <section role="dialog" aria-modal="true" className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-linear-hairline bg-linear-surface-1 shadow-2xl">
            <header className="flex items-center justify-between border-b border-linear-hairline px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                {selected ? <button type="button" onClick={() => setSelected(null)} className="rounded p-1 text-linear-ink-muted hover:bg-linear-surface-2"><ArrowLeft size={17} /></button> : null}
                <div className="min-w-0">
                  <h2 className="truncate font-semibold text-linear-ink">{selected ? `${selected.gameName} · ${selected.pack.packName}` : "ประวัติการแก้ไข GameInfo ทั้งหมด"}</h2>
                  <p className="text-xs text-linear-ink-tertiary">{selected ? `${selected.pack.entries.length} รายการ` : "แยกตามเกมและส่วนที่แก้ · เวลาประเทศไทย"}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!selected ? <>
                  <select value={area} onChange={(event) => show(event.target.value, dataMode)} aria-label="กรองตามส่วนที่แก้" className="h-8 rounded-lg border border-linear-hairline-strong bg-linear-surface-2 px-2 text-xs text-linear-ink">
                    {AREA_FILTERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                  <select value={dataMode} onChange={(event) => show(area, event.target.value)} aria-label="กรองตามชุดข้อมูล" className="h-8 rounded-lg border border-linear-hairline-strong bg-linear-surface-2 px-2 text-xs text-linear-ink">
                    <option value="">ทุกชุดข้อมูล</option><option value="uid">UID</option><option value="idpass">IDPASS</option>
                  </select>
                </> : null}
                <button type="button" onClick={() => setOpen(false)} aria-label="ปิด" className="rounded p-1 text-linear-ink-tertiary hover:bg-linear-surface-2"><X size={17} /></button>
              </div>
            </header>
            <div className="overflow-y-auto p-5">
              {loading ? <p className="py-10 text-center text-sm text-linear-ink-tertiary">กำลังโหลด…</p> : error ? <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">{error}</p> : selected ? <PackTimeline entries={selected.pack.entries} /> : <HistoryGroups groups={groups} onSelect={(game, pack) => setSelected({ gameName: game.gameName, pack })} />}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

function HistoryGroups({ groups, onSelect }) {
  if (!groups.length) return <p className="py-10 text-center text-sm text-linear-ink-tertiary">ยังไม่มีประวัติการแก้ไข</p>;
  return <div className="space-y-3">{groups.map((game, index) => (
    <details key={game.gameId} open={index === 0} className="overflow-hidden rounded-xl border border-linear-hairline bg-linear-surface-2">
      <summary className="cursor-pointer px-4 py-3 font-medium text-linear-ink">{game.gameName}<span className="ml-2 text-xs font-normal text-linear-ink-tertiary">Game ID {game.gameId} · {game.packs.length} หมวด</span></summary>
      <div className="border-t border-linear-hairline bg-linear-surface-1 p-2">{game.packs.map((pack) => (
        <button key={pack.packId || "config"} type="button" onClick={() => onSelect(game, pack)} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-linear-surface-2">
          <div className="min-w-0"><p className="truncate text-sm font-medium text-linear-ink">{pack.packName}</p><p className="mt-0.5 truncate text-xs text-linear-ink-tertiary">แก้โดย {pack.actors.length ? pack.actors.join(", ") : "ไม่ทราบผู้แก้"} · {pack.entries.length} ครั้ง · ล่าสุด {formatBangkokTime(pack.latestAt)}</p></div><ChevronRight size={16} className="shrink-0 text-linear-ink-tertiary" />
        </button>
      ))}</div>
    </details>
  ))}</div>;
}

function PackTimeline({ entries }) {
  return <div className="space-y-3">{entries.map((entry) => (
    <article key={entry.id} className="rounded-xl border border-linear-hairline bg-linear-surface-2 p-4">
      <div className="flex flex-wrap justify-between gap-2"><div><p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-linear-ink">{ACTION_LABELS[entry.action] || entry.action}{entry.area && entry.area !== "pack" ? <span className="rounded bg-linear-surface-1 px-1.5 py-0.5 text-[10px] font-normal text-linear-ink-tertiary">{AUDIT_AREA_LABELS[entry.area] || entry.area}</span> : null}{entry.dataMode === "idpass" ? <span className="rounded bg-linear-surface-1 px-1.5 py-0.5 text-[10px] font-normal text-linear-ink-muted">IDPASS</span> : null}</p><p className="mt-0.5 text-xs text-linear-ink-tertiary">โดย {entry.actorName || "ไม่ทราบผู้แก้"}{entry.source !== "editor" ? ` · ${entry.source}` : ""}</p></div><time className="text-xs text-linear-ink-tertiary">{formatBangkokTime(entry.createdAt)}</time></div>
      <ChangeSummary entry={entry} />
      <details className="mt-3 text-xs"><summary className="cursor-pointer text-linear-primary">ดูข้อมูลก่อนและหลัง</summary><div className="mt-2 grid gap-2 md:grid-cols-2"><JsonBlock title="ก่อนแก้" value={entry.before} /><JsonBlock title="หลังแก้" value={entry.after} /></div></details>
    </article>
  ))}</div>;
}

function ChangeSummary({ entry }) {
  const changes = summarizeGameinfoAudit(entry);
  if (!changes.length) return null;
  return <ul className="mt-3 space-y-1">{changes.map((change) => <li key={change.field} className="flex flex-wrap items-baseline gap-1.5 text-xs"><span className="text-linear-ink-muted">{change.label}:</span><span className="text-linear-ink-tertiary line-through">{formatAuditValue(change.from)}</span><span className="text-linear-ink-tertiary">→</span><span className="font-medium text-linear-ink">{formatAuditValue(change.to)}</span></li>)}</ul>;
}

function JsonBlock({ title, value }) { return <div className="min-w-0 rounded border border-linear-hairline bg-linear-surface-1 p-2"><p className="mb-1 font-medium text-linear-ink-muted">{title}</p><pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all text-[10px] leading-relaxed text-linear-ink-tertiary">{value == null ? "—" : JSON.stringify(value, null, 2)}</pre></div>; }
function formatBangkokTime(value) { if (!value) return "ไม่ทราบเวลา"; const date = new Date(value); if (Number.isNaN(date.getTime())) return String(value); return new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" }).format(date); }
