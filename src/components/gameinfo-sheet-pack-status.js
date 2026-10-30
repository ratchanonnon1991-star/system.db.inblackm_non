"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Palette, RefreshCw } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { gameinfoGameHref } from "@/lib/gameinfo-data-mode";
import { GAMEINFO_PACK_STATUS_LABELS } from "@/lib/gameinfo-pack-model";

const STATUS_TONE = {
  open: "text-emerald-700 dark:text-emerald-400",
  new: "text-[#D90005] dark:text-red-400",
  closed: "text-linear-ink-tertiary",
  expired: "text-amber-700 dark:text-amber-400",
};
const SHEET_TONE = { red: { label: "แดง", className: "bg-red-500/15 text-red-700 dark:text-red-300" }, green: { label: "เขียว", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" } };
const MODE_LABEL = { uid: "UID", idpass: "ID-PASS" };

function Status({ status }) {
  return <span className={`font-bold ${STATUS_TONE[status]}`}>{GAMEINFO_PACK_STATUS_LABELS[status]}</span>;
}

/**
 * The sheet's row colours as pack statuses: red rows → หมดอายุ, green → ใหม่.
 * Read on demand (every game's tab, twice), then applied game by game.
 */
export default function GameinfoSheetPackStatus({ lang }) {
  const router = useRouter();
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await apiJson("/api/gameinfo/sheet-import?part=pack-status", { cache: "no-store", fallbackError: "อ่านสีในชีตไม่สำเร็จ" });
      setPreview(data);
      setSelected(new Set(data.items.filter((item) => item.changes.length).map((item) => item.gameId)));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "อ่านสีในชีตไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  const changing = useMemo(() => (preview?.items || []).filter((item) => item.changes.length), [preview]);
  const onlyMissing = useMemo(() => (preview?.items || []).filter((item) => !item.changes.length), [preview]);
  const missingGames = (preview?.items || []).filter((item) => item.missing.length).length;
  const chosen = changing.filter((item) => selected.has(item.gameId));
  const packCount = chosen.reduce((sum, item) => sum + item.changes.length, 0);

  async function apply() {
    setBusy(true);
    setError("");
    try {
      const data = await apiJson("/api/gameinfo/sheet-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pack-status", gameIds: chosen.map((item) => item.gameId) }),
        fallbackError: "ปรับสถานะแพ็คไม่สำเร็จ",
      });
      setResult(data);
      router.refresh();
      await load();
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : "ปรับสถานะแพ็คไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  function toggle(gameId, on) {
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(gameId);
      else next.delete(gameId);
      return next;
    });
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-linear-hairline bg-linear-surface-1 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.08)] sm:p-5">
      <div className="flex flex-wrap items-start gap-3">
        <Palette size={20} aria-hidden="true" className="mt-0.5 text-[#D90005]" />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-black text-linear-ink">สถานะแพ็คตามสีในชีต</h2>
          <p className="text-sm text-linear-ink-muted">
            แถวสีแดง = <Status status="expired" /> · สีเขียว = <Status status="new" /> · แถวไม่มีสี คืนแพ็คที่เคยเป็นใหม่/หมดอายุ เป็น <Status status="open" />.
            จับคู่ด้วยชื่อแพ็ค ทั้งโหมด UID และ ID-PASS — แพ็คที่ปิดเองไว้ไม่ถูกเปิดคืน
          </p>
        </div>
        <button type="button" onClick={load} disabled={loading || busy} className="flex h-10 items-center gap-1.5 rounded-[10px] border border-linear-hairline px-4 text-[13px] font-bold text-linear-ink hover:bg-linear-surface-2 disabled:opacity-50">
          <RefreshCw size={14} aria-hidden="true" className={loading ? "animate-spin" : ""} /> {loading ? "กำลังอ่านสีในชีต…" : preview ? "อ่านใหม่" : "ตรวจสีในชีต"}
        </button>
      </div>

      {error ? <p role="alert" className="text-sm font-bold text-linear-danger">{error}</p> : null}

      {result ? (
        <div role="status" className="rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-300">
          <p className="flex items-center gap-1.5 font-extrabold"><CheckCircle2 size={16} aria-hidden="true" /> ปรับแล้ว {result.summary.packs} แพ็ค ใน {result.summary.games} เกม{result.summary.failed ? ` · ไม่สำเร็จ ${result.summary.failed}` : ""}</p>
          {result.results.filter((item) => item.error).map((item) => (
            <p key={item.gameId} className="text-[#B80004] dark:text-[#FF8A8C]">ID {item.gameId}: {item.error}</p>
          ))}
        </div>
      ) : null}

      {preview ? (
        <>
          <p className="text-sm text-linear-ink-muted">
            ตรวจ {preview.checked} เกมที่มีแพ็คแล้ว · ต้องปรับสถานะ <strong className="text-linear-ink">{changing.length}</strong> เกม ·
            ชีตมีแพ็คที่ GameInfo ยังไม่มี <strong className="text-linear-ink">{missingGames}</strong> เกม
          </p>
          {changing.length ? (
            <ul className="flex flex-col divide-y divide-linear-hairline rounded-xl border border-linear-hairline">
              {changing.map((item) => (
                <li key={item.gameId} className="flex gap-3 p-3">
                  <input
                    type="checkbox"
                    aria-label={`ปรับสถานะ ${item.game}`}
                    checked={selected.has(item.gameId)}
                    onChange={(event) => toggle(item.gameId, event.target.checked)}
                    className="mt-1 h-5 w-5 shrink-0 accent-[#D90005]"
                  />
                  <div className="min-w-0 flex-1">
                    <Link href={gameinfoGameHref(lang, item.gameId, "uid", true)} className="font-extrabold text-linear-ink hover:text-[#D90005]">{String(item.game).split("\n")[0]}</Link>
                    <span className="ml-2 text-xs text-linear-ink-tertiary">ID {item.gameId} · แท็บ “{item.tab}”</span>
                    <ul className="mt-1.5 grid gap-x-6 gap-y-1 text-[13px] sm:grid-cols-2">
                      {item.changes.map((change) => (
                        <li key={`${change.mode}-${change.packId}`} className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
                          <span className="rounded bg-linear-surface-3 px-1.5 text-[10px] font-bold text-linear-ink-muted">{MODE_LABEL[change.mode]}</span>
                          <span className="min-w-0 break-words text-linear-ink">{change.name}</span>
                          <span className="whitespace-nowrap text-xs"><Status status={change.from} /> → <Status status={change.to} /></span>
                        </li>
                      ))}
                    </ul>
                    {item.missing.length ? <Missing rows={item.missing} /> : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
          {onlyMissing.length ? (
            <details className="rounded-xl border border-linear-hairline p-3 text-sm">
              <summary className="cursor-pointer font-bold text-linear-ink-muted">เกมที่สถานะตรงแล้ว แต่ชีตมีแพ็คที่ GameInfo ยังไม่มี ({onlyMissing.length})</summary>
              <ul className="mt-2 flex flex-col gap-3">
                {onlyMissing.map((item) => (
                  <li key={item.gameId}>
                    <Link href={gameinfoGameHref(lang, item.gameId, "uid", true)} className="font-bold text-linear-ink hover:text-[#D90005]">{String(item.game).split("\n")[0]}</Link>
                    <span className="ml-2 text-xs text-linear-ink-tertiary">ID {item.gameId} · แท็บ “{item.tab}”</span>
                    <Missing rows={item.missing} />
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          <div className="flex flex-wrap items-center justify-end gap-3">
            <button type="button" disabled={busy || !chosen.length} onClick={apply} className="flex h-11 items-center gap-2 rounded-xl bg-[#D90005] px-5 text-sm font-extrabold text-white hover:bg-[#B80004] disabled:opacity-40">
              <Palette size={16} aria-hidden="true" /> {busy ? "กำลังปรับ…" : `ปรับสถานะ ${packCount} แพ็ค (${chosen.length} เกม)`}
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}

// The sheet's packs this game has no pack of that name for, in either mode.
function Missing({ rows }) {
  return (
    <details className="mt-1.5 text-xs">
      <summary className="cursor-pointer text-linear-ink-tertiary">ชีตมีแต่ GameInfo ไม่มี {rows.length} แพ็ค</summary>
      <ul className="mt-1 flex flex-wrap gap-1">
        {rows.map((row) => (
          <li key={row.name} className={`rounded px-1.5 py-0.5 ${SHEET_TONE[row.tone]?.className || "bg-linear-surface-3 text-linear-ink-muted"}`}>
            {row.name}
            <span className="ml-1 opacity-70">{[row.price && `฿${row.price}`, row.channel, SHEET_TONE[row.tone]?.label && `แถว${SHEET_TONE[row.tone].label}`].filter(Boolean).join(" · ")}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
