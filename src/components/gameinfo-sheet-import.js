"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, RefreshCw } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { gameinfoGameHref } from "@/lib/gameinfo-data-mode";
import { GAMEINFO_SALES_CHANNELS, gameinfoMarketResult, gameinfoSalesStatus } from "@/lib/gameinfo-sales-channels";

const PARTS = [
  { id: "publisher", label: "ค่ายเกม" },
  { id: "category", label: "หมวดหมู่ (ประเภทเกม)" },
  { id: "warning", label: "ข้อควรระวัง (⚠️)" },
  { id: "remark", label: "หมายเหตุ" },
  { id: "channels", label: "ช่องทางขาย / Margin" },
  { id: "packs", label: "แพ็ค (จากแท็บของเกม)" },
  { id: "notices", label: "ปัญหาและคำแนะนำ + รูป (วิธีเติม)" },
];
const CHANNEL_LABEL = Object.fromEntries(GAMEINFO_SALES_CHANNELS.map((channel) => [channel.key, channel.label]));

function channelSummary(row) {
  return [
    CHANNEL_LABEL[row.channel],
    gameinfoSalesStatus(row.status)?.label,
    gameinfoMarketResult(row.market)?.label,
    row.margin == null ? null : `${row.margin}%`,
  ].filter(Boolean).join(" · ");
}

export default function GameinfoSheetImport({ lang, sheetUrl }) {
  const router = useRouter();
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [parts, setParts] = useState(() => new Set(PARTS.map((part) => part.id)));
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch("/api/gameinfo/sheet-import", { credentials: "include", cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setLoadError({ message: data.error || `อ่านชีตไม่สำเร็จ (HTTP ${response.status})`, serviceAccount: data.serviceAccount || null });
        return;
      }
      setPreview(data);
      setSelected(new Set(data.items.map((item) => item.gameId)));
    } catch (fetchError) {
      setLoadError({ message: fetchError instanceof Error ? fetchError.message : "อ่านชีตไม่สำเร็จ" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, []);

  // Rows that still have something for the chosen parts.
  const rows = useMemo(() => (preview?.items || []).filter((item) => PARTS.some((part) => parts.has(part.id) && item.fills[part.id])), [parts, preview]);
  const chosen = rows.filter((item) => selected.has(item.gameId));

  async function apply() {
    setBusy(true);
    setError("");
    try {
      const data = await apiJson("/api/gameinfo/sheet-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameIds: chosen.map((item) => item.gameId), parts: [...parts] }),
        fallbackError: "นำเข้าข้อมูลจากชีตไม่สำเร็จ",
      });
      setResult(data);
      router.refresh();
      await load();
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : "นำเข้าข้อมูลจากชีตไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  if (loading && !preview) {
    return <p className="rounded-2xl border border-linear-hairline bg-linear-surface-1 p-6 text-sm text-linear-ink-muted">กำลังอ่านชีต…</p>;
  }

  if (loadError) {
    return (
      <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-[#D90005]/40 bg-[#FFF5F5] p-5 text-sm text-linear-ink dark:bg-[#D90005]/10">
        <p className="flex items-center gap-2 font-extrabold text-[#B80004] dark:text-[#FF8A8C]"><AlertTriangle size={17} aria-hidden="true" /> {loadError.message}</p>
        {loadError.serviceAccount ? (
          <p>
            เปิด <a href={sheetUrl} target="_blank" rel="noopener noreferrer" className="font-bold text-[#D90005] underline">ชีตต้นทาง</a> → Share →
            เพิ่ม <code className="select-all rounded bg-linear-surface-3 px-1.5 py-0.5 font-mono text-[13px]">{loadError.serviceAccount}</code> เป็นผู้มีสิทธิ์ดู (Viewer) แล้วกดลองใหม่
          </p>
        ) : null}
        <button type="button" onClick={load} className="flex h-10 items-center gap-1.5 self-start rounded-[10px] border border-linear-hairline bg-linear-surface-1 px-4 text-[13px] font-bold hover:bg-linear-surface-2">
          <RefreshCw size={15} aria-hidden="true" /> ลองใหม่
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-linear-hairline bg-linear-surface-1 p-4 text-sm text-linear-ink-muted shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
        <FileSpreadsheet size={18} aria-hidden="true" className="text-emerald-700" />
        <span>
          อ่านจากชีตได้ <strong className="text-linear-ink">{preview.sheetGames}</strong> เกม ·
          เติมได้ <strong className="text-linear-ink">{preview.items.length}</strong> เกม ·
          ครบแล้ว {preview.complete} เกม
        </span>
        <button type="button" onClick={load} disabled={loading} className="ml-auto flex h-9 items-center gap-1.5 rounded-[10px] border border-linear-hairline px-3 text-[13px] font-bold text-linear-ink hover:bg-linear-surface-2 disabled:opacity-50">
          <RefreshCw size={14} aria-hidden="true" /> อ่านใหม่
        </button>
      </div>

      {preview.noticesError ? (
        <p role="alert" className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">อ่านรูปและคำแนะนำจากชีตไม่ได้: {preview.noticesError} — ข้อมูลส่วนอื่นนำเข้าได้ตามปกติ</p>
      ) : null}

      <fieldset className="flex flex-wrap gap-2">
        <legend className="mb-2 text-[13px] font-bold text-linear-ink-muted">ข้อมูลที่จะนำเข้า (เฉพาะช่องที่ GameInfo ยังว่าง)</legend>
        {PARTS.map((part) => (
          <label key={part.id} className={`flex h-10 cursor-pointer items-center gap-2 rounded-full border px-4 text-[13px] font-bold ${parts.has(part.id) ? "border-[#D90005] bg-[#D90005]/5 text-linear-ink" : "border-linear-hairline text-linear-ink-muted"}`}>
            <input
              type="checkbox"
              checked={parts.has(part.id)}
              onChange={(event) => setParts((current) => {
                const next = new Set(current);
                if (event.target.checked) next.add(part.id);
                else next.delete(part.id);
                return next;
              })}
              className="h-4 w-4 accent-[#D90005]"
            />
            {part.label}
          </label>
        ))}
      </fieldset>

      <div className="overflow-x-auto rounded-2xl border border-linear-hairline bg-linear-surface-1">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-linear-surface-2 text-[11px] font-black uppercase tracking-[0.06em] text-linear-ink-muted">
            <tr>
              <th scope="col" className="w-12 px-4 py-3">
                <input
                  type="checkbox"
                  aria-label="เลือกทั้งหมด"
                  checked={rows.length > 0 && chosen.length === rows.length}
                  onChange={(event) => setSelected(event.target.checked ? new Set(rows.map((item) => item.gameId)) : new Set())}
                  className="h-5 w-5 accent-[#D90005]"
                />
              </th>
              <th scope="col" className="px-3 py-3">เกม</th>
              <th scope="col" className="px-3 py-3">จะเติม</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-linear-ink-tertiary">ไม่มีอะไรต้องเติมแล้ว</td></tr>
            ) : rows.map((item) => (
              <tr key={item.gameId} className="border-t border-linear-hairline align-top">
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label={`นำเข้า ${item.game}`}
                    checked={selected.has(item.gameId)}
                    onChange={(event) => setSelected((current) => {
                      const next = new Set(current);
                      if (event.target.checked) next.add(item.gameId);
                      else next.delete(item.gameId);
                      return next;
                    })}
                    className="h-5 w-5 accent-[#D90005]"
                  />
                </td>
                <td className="px-3 py-3">
                  <Link href={gameinfoGameHref(lang, item.gameId, "uid", true)} className="font-extrabold text-linear-ink hover:text-[#D90005]">{String(item.game).split("\n")[0]}</Link>
                  <span className="block font-mono text-xs text-linear-ink-tertiary">ID: {item.gameId}</span>
                </td>
                <td className="px-3 py-3">
                  <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-1 text-[13px]">
                    {parts.has("publisher") && item.fills.publisher ? <><dt className="text-linear-ink-tertiary">ค่ายเกม</dt><dd className="text-linear-ink">{item.fills.publisher}</dd></> : null}
                    {parts.has("category") && item.fills.category ? <><dt className="text-linear-ink-tertiary">หมวดหมู่</dt><dd className="text-linear-ink">{item.fills.category}</dd></> : null}
                    {parts.has("warning") && item.fills.warning ? <><dt className="text-linear-ink-tertiary">ข้อควรระวัง</dt><dd className="font-bold text-[#B80004] dark:text-[#FF8A8C]">{item.fills.warning}</dd></> : null}
                    {parts.has("remark") && item.fills.remark ? <><dt className="text-linear-ink-tertiary">หมายเหตุ</dt><dd className="text-linear-ink">{item.fills.remark}</dd></> : null}
                    {parts.has("channels") && item.fills.channels ? (
                      <>
                        <dt className="text-linear-ink-tertiary">ช่องทางขาย</dt>
                        <dd className="flex flex-wrap gap-1">
                          {item.fills.channels.map((row) => (
                            <span key={row.channel} className="rounded-md bg-linear-surface-3 px-2 py-0.5 text-xs text-linear-ink-muted">{channelSummary(row)}</span>
                          ))}
                        </dd>
                      </>
                    ) : null}
                    {parts.has("packs") && item.fills.packs ? (
                      <>
                        <dt className="text-linear-ink-tertiary">แพ็ค</dt>
                        <dd className="text-linear-ink">
                          {item.fills.packs.count} แพ็ค{item.fills.packs.unit ? ` (${item.fills.packs.unit})` : ""}
                          <span className="ml-1.5 text-xs text-linear-ink-tertiary">จากแท็บ “{item.fills.packs.tab}”</span>
                          {item.fills.packs.rates?.length ? <span className="block text-xs text-linear-ink-tertiary">อัตราต้นทุน: {item.fills.packs.rates.join(", ")} บาท</span> : null}
                        </dd>
                      </>
                    ) : null}
                    {parts.has("notices") && item.fills.notices ? (
                      <>
                        <dt className="text-linear-ink-tertiary">วิธีเติม</dt>
                        <dd className="text-linear-ink">
                          {item.fills.notices.steps} ข้อ · รูป {item.fills.notices.images} รูป
                          <span className="ml-1.5 text-xs text-linear-ink-tertiary">จาก NOTICE ในแท็บ “{item.fills.notices.tab}”</span>
                        </dd>
                      </>
                    ) : null}
                  </dl>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {preview.unmatchedSheetGames.length ? (
        <details className="rounded-2xl border border-linear-hairline bg-linear-surface-1 p-4 text-sm">
          <summary className="cursor-pointer font-bold text-linear-ink-muted">เกมในชีตที่หาใน GameInfo ไม่เจอ ({preview.unmatchedSheetGames.length}) — ชื่อไม่ตรงกัน ต้องแก้ชื่อหรือเติมเอง</summary>
          <p className="mt-2 text-linear-ink-muted">{preview.unmatchedSheetGames.join(", ")}</p>
        </details>
      ) : null}

      {result ? (
        <div role="status" className="rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-300">
          <p className="flex items-center gap-1.5 font-extrabold"><CheckCircle2 size={16} aria-hidden="true" /> นำเข้าแล้ว {result.summary.games} เกม</p>
          <p>ค่ายเกม {result.summary.publisher} · หมวดหมู่ {result.summary.category} · ข้อควรระวัง {result.summary.warning} · หมายเหตุ {result.summary.remark} · ช่องทางขาย {result.summary.channels} · แพ็ค {result.summary.packs} · วิธีเติม {result.summary.notices}{result.summary.skippedImages ? ` (รูปเกิน 4MB ไม่ได้ใส่ ${result.summary.skippedImages} รูป)` : ""}{result.summary.failed ? ` · ไม่สำเร็จ ${result.summary.failed}` : ""}</p>
          {result.results.filter((item) => item.error).map((item) => (
            <p key={item.gameId} className="text-[#B80004] dark:text-[#FF8A8C]">ID {item.gameId}: {item.error}</p>
          ))}
        </div>
      ) : null}

      <div className="sticky bottom-4 flex flex-wrap items-center justify-end gap-3 rounded-2xl border border-linear-hairline bg-linear-surface-1 p-3 shadow-[0_16px_32px_-16px_rgba(0,0,0,0.45)]">
        {error ? <span role="alert" className="mr-auto text-xs text-linear-danger">{error}</span> : null}
        <button type="button" disabled={busy || !chosen.length || !parts.size} onClick={apply} className="flex h-11 items-center gap-2 rounded-xl bg-[#D90005] px-5 text-sm font-extrabold text-white hover:bg-[#B80004] disabled:opacity-40">
          <FileSpreadsheet size={16} aria-hidden="true" /> {busy ? "กำลังนำเข้า…" : `นำเข้า ${chosen.length} เกม`}
        </button>
      </div>
    </div>
  );
}
