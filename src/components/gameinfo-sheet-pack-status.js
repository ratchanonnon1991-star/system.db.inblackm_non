"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Palette, Plus, RefreshCw } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { gameinfoGameHref } from "@/lib/gameinfo-data-mode";
import { formatGameinfoPackExpiry, GAMEINFO_PACK_STATUS_LABELS } from "@/lib/gameinfo-pack-model";
import { GAMEINFO_SHEET_ADDED_CATEGORY, nextGameinfoSheetSyncAt } from "@/lib/gameinfo-sheet-packs";

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
export default function GameinfoSheetPackStatus({ lang, lastRun = null }) {
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

  async function addPacks(gameId, keys) {
    setBusy(true);
    setError("");
    try {
      const data = await apiJson("/api/gameinfo/sheet-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add-packs", items: [{ gameId, keys }] }),
        fallbackError: "เพิ่มแพ็คไม่สำเร็จ",
      });
      setResult({ added: data });
      router.refresh();
      await load();
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : "เพิ่มแพ็คไม่สำเร็จ");
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
            ข้อความ “หมดอายุ 4/11/2026” ใต้แถวสีเขียว ตั้งวันหมดอายุให้แถวเขียวที่อยู่ติดกันเหนือข้อความ.
            จับคู่ด้วยชื่อแพ็ค ทั้งโหมด UID และ ID-PASS — แพ็คที่ปิดเองไว้ไม่ถูกเปิดคืน.
            ระบบอ่านชีตและปรับให้เองทุกวัน 06:00 น. ยกเว้นการคืนแพ็คหมดอายุเป็นเปิด ซึ่งต้องกดปรับจากหน้านี้
          </p>
        </div>
        <button type="button" onClick={load} disabled={loading || busy} className="flex h-10 items-center gap-1.5 rounded-[10px] border border-linear-hairline px-4 text-[13px] font-bold text-linear-ink hover:bg-linear-surface-2 disabled:opacity-50">
          <RefreshCw size={14} aria-hidden="true" className={loading ? "animate-spin" : ""} /> {loading ? "กำลังอ่านสีในชีต…" : preview ? "อ่านใหม่" : "ตรวจสีในชีต"}
        </button>
      </div>

      <LastSyncRun lang={lang} run={lastRun} />

      {error ? <p role="alert" className="text-sm font-bold text-linear-danger">{error}</p> : null}

      {result?.added ? (
        <div role="status" className="rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-300">
          <p className="flex items-center gap-1.5 font-extrabold"><CheckCircle2 size={16} aria-hidden="true" /> เพิ่มแล้ว {result.added.summary.packs} แพ็ค ไว้ในหมวด “{GAMEINFO_SHEET_ADDED_CATEGORY}”{result.added.summary.failed ? ` · ไม่สำเร็จ ${result.added.summary.failed}` : ""}</p>
          {result.added.results.map((item) => (item.error
            ? <p key={item.gameId} className="text-[#B80004] dark:text-[#FF8A8C]">ID {item.gameId}: {item.error}</p>
            : item.names?.length ? <p key={item.gameId}>ID {item.gameId}: {item.names.join(", ")}</p> : null))}
        </div>
      ) : result ? (
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
                        <SyncChange key={`${change.mode}-${change.packId}`} change={change} />
                      ))}
                    </ul>
                    {item.missing.length ? <Missing key={missingKey(item)} item={item} busy={busy} onAdd={addPacks} /> : null}
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
                    <Missing key={missingKey(item)} item={item} busy={busy} onAdd={addPacks} />
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

// Written out by hand rather than in the th-TH locale, whose format differs
// between the server's Node and the browser.
function bangkokTime(value) {
  const [date, time] = new Date(value).toLocaleString("sv-SE", { timeZone: "Asia/Bangkok" }).split(" ");
  return `${formatGameinfoPackExpiry(date)} ${time.slice(0, 5)} น.`;
}

// What the daily read last did. When it could not run at all it changed
// nothing, which is the case this panel is here to make visible.
function LastSyncRun({ lang, run }) {
  const next = `รอบถัดไป ${bangkokTime(nextGameinfoSheetSyncAt())}`;
  if (!run) return <p className="rounded-xl bg-linear-surface-2 p-3 text-sm text-linear-ink-muted">ระบบยังไม่เคยอ่านชีตเอง · {next}</p>;
  const details = run.details || [];
  const failedGames = details.filter((item) => item.error);
  const changedGames = details.filter((item) => item.changes?.length);
  return (
    <div role="status" className={`rounded-xl p-3 text-sm ${run.error || run.failed ? "bg-red-500/10" : "bg-linear-surface-2"}`}>
      <p className="text-linear-ink-muted">
        <strong className="text-linear-ink">ระบบอ่านชีตเองล่าสุด {bangkokTime(run.finishedAt)}</strong>
        {" · "}
        {run.error
          ? <span className="font-bold text-[#B80004] dark:text-[#FF8A8C]">ไม่สำเร็จ ไม่ได้ปรับอะไร</span>
          : run.packs ? `ปรับ ${run.packs} แพ็คใน ${run.games} เกม` : "ไม่มีอะไรต้องปรับ"}
        {run.failed ? <span className="font-bold text-[#B80004] dark:text-[#FF8A8C]"> · ไม่สำเร็จ {run.failed} เกม</span> : null}
        {" · "}{next}
      </p>
      {run.error ? <p className="mt-1 break-words text-[#B80004] dark:text-[#FF8A8C]">{run.error}</p> : null}
      {failedGames.map((item) => (
        <p key={item.gameId} className="mt-1 break-words text-[#B80004] dark:text-[#FF8A8C]">{String(item.game).split("\n")[0]} (ID {item.gameId}): {item.error}</p>
      ))}
      {changedGames.length ? (
        <details className="mt-1.5 text-[13px]">
          <summary className="cursor-pointer font-bold text-linear-ink-muted">ดูแพ็คที่ปรับ</summary>
          <ul className="mt-2 flex flex-col gap-2">
            {changedGames.map((item) => (
              <li key={item.gameId}>
                <Link href={gameinfoGameHref(lang, item.gameId, "uid", true)} className="font-bold text-linear-ink hover:text-[#D90005]">{String(item.game).split("\n")[0]}</Link>
                <ul className="mt-1 grid gap-x-6 gap-y-1 sm:grid-cols-2">
                  {item.changes.map((change) => <SyncChange key={`${change.mode}-${change.packId}`} change={change} />)}
                </ul>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function SyncChange({ change }) {
  return (
    <li className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
      <span className="rounded bg-linear-surface-3 px-1.5 text-[10px] font-bold text-linear-ink-muted">{MODE_LABEL[change.mode]}</span>
      <span className="min-w-0 break-words text-linear-ink">{change.name}</span>
      {change.from !== change.to ? <span className="whitespace-nowrap text-xs"><Status status={change.from} /> → <Status status={change.to} /></span> : null}
      {change.expiresAt ? <span className="whitespace-nowrap text-xs text-linear-ink-muted">หมดอายุ {formatGameinfoPackExpiry(change.expiresAt)}</span> : null}
    </li>
  );
}

// Remounts a game's list (and its ticks) when the preview is read again.
const missingKey = (item) => `${item.gameId}:${item.missing.map((row) => row.key).join()}`;

// The sheet's packs this game has no pack of that name for in their mode, to
// tick and add. A red row has expired, so it is listed but cannot be added.
function Missing({ item, busy, onAdd }) {
  const rows = item.missing;
  const [ticked, setTicked] = useState(() => new Set(rows.filter((row) => row.tone !== "red").map((row) => row.key)));
  const addable = rows.filter((row) => row.tone !== "red").length;
  return (
    <details className="mt-1.5 text-xs">
      <summary className="cursor-pointer text-linear-ink-tertiary">ชีตมีแต่ GameInfo ไม่มี {rows.length} แพ็ค{addable < rows.length ? ` (หมดอายุแล้ว ${rows.length - addable})` : ""}</summary>
      <ul className="mt-1.5 grid gap-1 sm:grid-cols-2">
        {rows.map((row) => (
          <li key={row.key}>
            <label className={`flex min-w-0 items-center gap-1.5 rounded px-1.5 py-1 ${SHEET_TONE[row.tone]?.className || "bg-linear-surface-3 text-linear-ink-muted"} ${row.tone === "red" ? "opacity-70" : "cursor-pointer"}`}>
              <input
                type="checkbox"
                disabled={row.tone === "red"}
                checked={ticked.has(row.key)}
                onChange={(event) => setTicked((current) => {
                  const next = new Set(current);
                  if (event.target.checked) next.add(row.key);
                  else next.delete(row.key);
                  return next;
                })}
                className="h-4 w-4 shrink-0 accent-[#D90005]"
              />
              <span className="shrink-0 rounded bg-black/5 px-1 text-[10px] font-bold dark:bg-white/10">{MODE_LABEL[row.mode]}</span>
              <span className="min-w-0 break-words font-bold">{row.name}</span>
              <span className="ml-auto shrink-0 opacity-70">{[row.price && `฿${row.price}`, row.channel, SHEET_TONE[row.tone]?.label && `แถว${SHEET_TONE[row.tone].label}`].filter(Boolean).join(" · ")}</span>
            </label>
          </li>
        ))}
      </ul>
      {addable ? (
        <button
          type="button"
          disabled={busy || !ticked.size}
          onClick={() => onAdd(item.gameId, [...ticked])}
          className="mt-2 flex h-9 items-center gap-1.5 rounded-[10px] border border-[#D90005] px-3 text-[13px] font-bold text-[#D90005] hover:bg-[#D90005]/5 disabled:opacity-40"
        >
          <Plus size={14} aria-hidden="true" /> เพิ่ม {ticked.size} แพ็คเข้า GameInfo
        </button>
      ) : null}
    </details>
  );
}
