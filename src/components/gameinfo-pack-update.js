"use client";

import { useEffect, useMemo, useState } from "react";
import { Bot, CloudDownload, FileCheck2, History, ListChecks, Loader2, Lock, PackagePlus, Upload, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import GameinfoSelect from "./gameinfo-select";
import { gameinfoGameColor, gameinfoGameInitials } from "@/lib/gameinfo-game-initials";
import {
  PACK_UPDATE_LOG_ACTIONS,
  PACK_UPDATE_PRIORITIES,
  PACK_UPDATE_TYPES,
  applyPackUpdateSavedState,
  packUpdateBotResult,
  packUpdateGate,
  packUpdateNeedsWork,
  packUpdateSavedState,
  summarizePackUpdate,
} from "@/lib/gameinfo-pack-update";

const CHIP = {
  ok: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400",
  info: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
  warn: "bg-amber-400/20 text-amber-800 dark:text-amber-300",
  bad: "bg-[#D90005]/10 text-[#D90005] dark:text-red-400",
  plain: "bg-linear-surface-3 text-linear-ink-muted",
};
const BTN = "inline-flex h-10 items-center gap-2 rounded-xl border border-linear-hairline-strong bg-linear-surface-1 px-4 text-sm font-bold text-linear-ink transition hover:bg-linear-surface-3 disabled:cursor-default disabled:opacity-50";
const BTN_RED = "inline-flex h-10 items-center gap-2 rounded-xl bg-[#D90005] px-4 text-sm font-bold text-white transition hover:bg-[#B80004] disabled:cursor-default disabled:opacity-50";
const STAMP = "border-2 border-white font-bold text-white shadow-[3px_3px_0_#000]";
const FIELD = "h-10 rounded-xl border border-linear-hairline-strong bg-linear-surface-1 px-3 text-sm text-linear-ink outline-none focus:border-[#D90005]";
// No API yet: checks and the history live in this browser only.
const STORAGE_KEY = "gameinfo-pack-update-v1";
const LOG_MAX = 3000;

const baht = (value) => `฿${Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const timeText = (iso) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? String(iso || "") : date.toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" });
};

function readSaved() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
    return saved && typeof saved === "object" ? saved : null;
  } catch {
    return null;
  }
}

function writeSaved(value) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Full or blocked storage: the page still works, it just forgets on reload.
  }
}

function Chip({ tone = "plain", className = "", children }) {
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${CHIP[tone]} ${className}`}>{children}</span>;
}

function Cover({ game, size }) {
  const style = size ? { width: size, height: size } : undefined;
  if (game.image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={game.image} alt="" loading="lazy" style={style} className={`aspect-square shrink-0 rounded-xl object-cover ${size ? "" : "w-full"}`} />;
  }
  return (
    <span
      aria-hidden="true"
      style={{ ...style, background: gameinfoGameColor(game.gameId) }}
      className={`flex aspect-square shrink-0 items-center justify-center rounded-xl font-black text-white ${size ? "text-lg" : "w-full text-3xl"}`}
    >
      {gameinfoGameInitials(game.name)}
    </span>
  );
}

/**
 * GameInfo's Pack Update screen: what PG2 changed, the bot and a person
 * checking each pack, then one import, and a history of who checked what.
 * Until the PG2 API exists only PG2's side is made up: the games, images and
 * current packs are GameInfo's. Checks and history are kept in this browser.
 */
export default function GameinfoPackUpdate({ initialGames, userName = "", initialTab = "list" }) {
  const user = userName || "แอดมิน";
  const [games, setGames] = useState(initialGames);
  const [log, setLog] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState(initialTab === "history" ? "history" : "list");
  const [priority, setPriority] = useState("all");
  const [showDoneGames, setShowDoneGames] = useState(false);
  const [modal, setModal] = useState(null);
  const [onlyNeedsWork, setOnlyNeedsWork] = useState(false);
  const [showChecked, setShowChecked] = useState(false);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");

  // The saved checks and history come back after the first render, so the
  // server's render and the browser's first one match.
  useEffect(() => {
    const saved = readSaved();
    if (saved) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGames((current) => applyPackUpdateSavedState(current, saved.packs));
      setLog(Array.isArray(saved.log) ? saved.log.slice(0, LOG_MAX) : []);
    }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (loaded) writeSaved({ packs: packUpdateSavedState(games), log: log.slice(0, LOG_MAX) });
  }, [loaded, games, log]);

  function chooseTab(next) {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "history") url.searchParams.set("tab", "history");
    else url.searchParams.delete("tab");
    window.history.replaceState(window.history.state, "", url);
  }

  const allPacks = useMemo(() => games.flatMap((game) => game.packs), [games]);
  const total = summarizePackUpdate(allPacks, user);
  const gate = packUpdateGate(allPacks, user);
  const blocked = gate.some((rule) => !rule.ok);
  const left = (game) => game.packs.filter((pack) => !pack.human).length;
  const doneGames = games.filter((game) => !left(game)).length;
  const openGames = games.filter((game) => showDoneGames || left(game));
  const shown = openGames
    .filter((game) => priority === "all" || String(game.priority) === priority)
    .sort((a, b) => a.priority - b.priority || left(b) - left(a));
  const modalGames = modal === "price" ? games : games.filter((game) => game.key === modal);

  const entry = (action, game, pack, detail = "") => ({
    at: new Date().toISOString(),
    who: action === "bot" ? "บอท" : user,
    action,
    gameId: game?.gameId ?? null,
    game: game?.name || "",
    pack: pack?.label || "",
    type: pack?.type || "",
    detail,
  });
  const addLog = (entries) => setLog((current) => [...entries.slice().reverse(), ...current].slice(0, LOG_MAX));
  const updatePacks = (change) => setGames((current) => current.map((game) => ({ ...game, packs: game.packs.map((pack) => change(pack, game) || pack) })));

  function runBot() {
    const targets = modalGames.flatMap((game) => game.packs.map((pack) => ({ game, pack })));
    const ids = new Set(targets.map(({ pack }) => pack.id));
    setBusy("bot");
    setTimeout(() => {
      updatePacks((pack) => ids.has(pack.id) ? { ...pack, bot: packUpdateBotResult(pack) } : null);
      const results = targets.map(({ pack }) => packUpdateBotResult(pack));
      const count = (value) => results.filter((result) => result === value).length;
      const scope = modal === "price" ? `${modalGames.length} เกม` : modalGames[0]?.name || "";
      addLog([entry("bot", modal === "price" ? null : modalGames[0], null, `${scope} · ${targets.length} แพ็ก: ตรง ${count("ok")} · ไม่ตรง ${count("bad")} · PG2 เลิกขาย ${count("gone")}`)]);
      setBusy("");
    }, 900);
  }

  function applyPg2Price(game, pack) {
    addLog([entry("price", game, pack, `${baht(pack.web)} → ${baht(pack.pg2)}`)]);
    updatePacks((item) => item.id === pack.id ? { ...item, web: item.pg2, bot: null, human: false, checkedBy: null, checkedAt: null, editedBy: user } : null);
  }

  function priceDetail(pack) {
    if (pack.type === "removed") return `ปิดขาย ${pack.old != null ? baht(pack.old) : ""}`.trim();
    if (pack.type === "changed") return `${baht(pack.old)} → ${baht(pack.web)}`;
    return `ขึ้นเว็บ ${baht(pack.web)}`;
  }

  function setChecked(game, pack, on) {
    if (on && pack.editedBy === user) return;
    const at = new Date().toISOString();
    addLog([entry(on ? (pack.type === "removed" ? "close" : "check") : "uncheck", game, pack, priceDetail(pack))]);
    updatePacks((item) => item.id === pack.id
      ? { ...item, ...(on ? { human: true, checkedBy: user, checkedAt: at } : { human: false, checkedBy: null, checkedAt: null }) }
      : null);
  }

  function checkAll() {
    const targets = modalGames.flatMap((game) => game.packs
      .filter((pack) => (!onlyNeedsWork || packUpdateNeedsWork(pack)) && !pack.human && pack.editedBy !== user)
      .map((pack) => ({ game, pack })));
    if (!targets.length) return;
    const ids = new Set(targets.map(({ pack }) => pack.id));
    const at = new Date().toISOString();
    updatePacks((pack) => ids.has(pack.id) ? { ...pack, human: true, checkedBy: user, checkedAt: at } : null);
    addLog(targets.map(({ game, pack }) => entry(pack.type === "removed" ? "close" : "check", game, pack, priceDetail(pack))));
  }

  function pull() {
    setBusy("pull");
    setTimeout(() => {
      setBusy("");
      setNote(`ดึงข้อมูลล่าสุดจาก PG2 แล้ว — ${games.length} เกม (ข้อมูลตัวอย่าง)`);
    }, 700);
  }

  function importAll() {
    if (blocked) return;
    setBusy("import");
    setTimeout(() => {
      addLog([entry("import", null, null, `${games.length} เกม: แพ็กใหม่ ${total.new} · แก้ราคา ${total.changed} · ปิดขาย ${total.removed}`)]);
      setGames([]);
      setModal(null);
      setBusy("");
      setNote(`อัปเดตแล้ว ${games.length} เกม — แพ็กใหม่ ${total.new} · แก้ราคา ${total.changed} · ปิดขาย ${total.removed} (ตัวอย่าง ยังไม่ได้บันทึกจริง)`);
    }, 900);
  }

  const tabClass = (on) => `inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition ${on ? "bg-[#D90005] text-white" : "text-linear-ink-muted hover:text-linear-ink"}`;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="m-0 text-xs font-black tracking-[0.2em] text-[#D90005]">PACK UPDATE</p>
          <h1 className="m-0 text-[clamp(28px,3vw,36px)] font-black leading-tight text-linear-ink">{tab === "history" ? "ประวัติการตรวจ" : "อัปเดตเกมใหม่"}</h1>
        </div>
        <span className="rounded-full bg-amber-400/20 px-3 py-1 text-xs font-bold text-amber-800 dark:text-amber-300">ข้อมูลตัวอย่าง · ยังไม่เชื่อม PG2</span>
      </div>

      <div role="tablist" aria-label="Pack Update" className="flex w-fit flex-wrap gap-1 rounded-full border border-linear-hairline bg-linear-surface-1 p-1">
        <button type="button" role="tab" aria-selected={tab === "list"} onClick={() => chooseTab("list")} className={tabClass(tab === "list")}>
          <ListChecks size={16} aria-hidden="true" /> รายการรอตรวจ
          <span className={`rounded-full px-2 text-xs ${tab === "list" ? "bg-white/25" : "bg-linear-surface-3"}`}>{total.total - total.human}</span>
        </button>
        <button type="button" role="tab" aria-selected={tab === "history"} onClick={() => chooseTab("history")} className={tabClass(tab === "history")}>
          <History size={16} aria-hidden="true" /> ประวัติการตรวจ
          <span className={`rounded-full px-2 text-xs ${tab === "history" ? "bg-white/25" : "bg-linear-surface-3"}`}>{log.length}</span>
        </button>
      </div>

      {tab === "history" ? <PackUpdateHistory log={log} /> : (
        <>
          <section className="flex flex-wrap items-center gap-4 rounded-2xl border border-linear-hairline bg-linear-surface-1 p-5">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-[#D90005]/10 text-[#D90005]"><PackagePlus size={24} aria-hidden="true" /></span>
            <div className="min-w-[200px] flex-1">
              <h2 className="m-0 text-xl font-black text-linear-ink">Game Update</h2>
              <p className="m-0 mt-0.5 text-sm text-linear-ink-muted">
                การเปลี่ยนแปลงจาก PG2 · ทุกเกมใน GameInfo {games.length} เกม · ใหม่ {total.new} · ราคาเปลี่ยน {total.changed} · ถูกลบ {total.removed}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={importAll} disabled={Boolean(busy) || !games.length || blocked} title={blocked ? "ยังไม่ผ่านเงื่อนไขก่อนนำเข้า" : undefined} className={BTN_RED}>
                {blocked && games.length ? <Lock size={16} aria-hidden="true" /> : null}
                {busy === "import" ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Upload size={16} aria-hidden="true" />}
                อัปเดตเข้าคลัง
              </button>
              <button type="button" onClick={() => { setModal("price"); setOnlyNeedsWork(false); setShowChecked(false); }} disabled={!games.length} className={BTN}>
                <FileCheck2 size={16} aria-hidden="true" /> ตรวจสอบราคา
                {total.bad ? <span className="rounded-full bg-[#D90005] px-2 text-xs text-white">{total.bad}</span> : null}
              </button>
              <button type="button" onClick={pull} disabled={Boolean(busy)} className={BTN}>
                {busy === "pull" ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <CloudDownload size={16} aria-hidden="true" />}
                ดึงข้อมูล
              </button>
            </div>
          </section>

          {note ? <p role="status" className="m-0 rounded-xl bg-emerald-500/12 px-4 py-3 font-medium text-emerald-700 dark:text-emerald-400">{note}</p> : null}

          {games.length ? (
            <section className={`flex flex-col gap-2 rounded-2xl border px-4 py-3.5 ${blocked ? "border-[#D90005] bg-[#D90005]/[0.06]" : "border-emerald-600 bg-emerald-500/10"}`}>
              <b className="text-linear-ink">{blocked ? "ยังนำเข้าไม่ได้ ต้องผ่านเงื่อนไขก่อน" : "ผ่านเงื่อนไขครบ นำเข้าได้"}</b>
              <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm text-linear-ink">
                {gate.map((rule) => (
                  <li key={rule.label} className="flex flex-wrap items-baseline gap-2">
                    <span className={`w-3.5 font-black ${rule.ok ? "text-emerald-600" : "text-[#D90005]"}`}>{rule.ok ? "✓" : "✗"}</span>
                    {rule.label}
                    {rule.why ? <em className="text-xs not-italic text-linear-ink-muted">{rule.why}</em> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-2 font-black text-linear-ink">
                Pack update <span className="rounded-full bg-[#D90005] px-2.5 text-xs text-white">{games.length - doneGames}</span>
              </span>
              {doneGames ? (
                <label className="inline-flex cursor-pointer items-center gap-1.5 text-[13px] text-linear-ink-muted">
                  <input type="checkbox" checked={showDoneGames} onChange={(event) => setShowDoneGames(event.target.checked)} className="h-4 w-4 accent-[#D90005]" />
                  แสดงเกมที่ตรวจครบแล้ว ({doneGames})
                </label>
              ) : null}
            </div>
            <div role="group" aria-label="ลำดับความสำคัญ" className="flex flex-wrap rounded-2xl border border-linear-hairline bg-linear-surface-1 p-1">
              {[["all", "ทั้งหมด"], ...Object.entries(PACK_UPDATE_PRIORITIES).map(([id, item]) => [id, `${item.label} ${openGames.filter((game) => String(game.priority) === id).length}`])].map(([id, label]) => (
                <button key={id} type="button" aria-pressed={priority === id} onClick={() => setPriority(id)} className={`rounded-full px-3.5 py-1.5 text-[13px] font-bold transition ${priority === id ? "bg-[#D90005] text-white" : "text-linear-ink-muted hover:text-linear-ink"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {shown.length ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3.5">
              {shown.map((game) => {
                const remaining = game.packs.filter((pack) => !pack.human);
                const s = summarizePackUpdate(remaining);
                const prio = PACK_UPDATE_PRIORITIES[game.priority];
                const done = !remaining.length;
                return (
                  <button
                    key={game.key}
                    type="button"
                    onClick={() => { setModal(game.key); setOnlyNeedsWork(false); setShowChecked(done); }}
                    aria-label={`ดูแพ็กของ ${game.name}`}
                    className={`flex flex-col items-center gap-1.5 rounded-2xl border bg-linear-surface-1 p-3 text-center transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D90005] ${done ? "border-emerald-600/50 opacity-70" : game.priority === 1 ? "border-[#D90005] shadow-[0_0_0_1px_#D90005]" : "border-linear-hairline"}`}
                  >
                    <span className="relative block w-full">
                      <Cover game={game} />
                      <span title={`รอตรวจ ${remaining.length} จาก ${game.packs.length} รายการ`} className={`absolute left-1.5 top-1.5 px-2 py-0.5 font-mono text-[13px] tabular-nums ${STAMP} ${done ? "bg-emerald-600" : "bg-[#D90005]"}`}>{done ? "✓" : `+${remaining.length}`}</span>
                      <span className={`absolute right-1.5 top-1.5 px-2 py-0.5 text-[11px] ${STAMP}`} style={{ background: prio.color }}>{prio.label}</span>
                    </span>
                    <span className="line-clamp-2 text-[13px] font-bold text-linear-ink">{game.name}</span>
                    <span className="font-mono text-[11px] text-linear-ink-tertiary">ID {game.gameId} · {game.packTotal} แพ็ก</span>
                    <span className="flex flex-wrap justify-center gap-1">
                      {done ? <Chip tone="ok">ตรวจครบแล้ว</Chip> : null}
                      {s.new ? <Chip tone="info">ใหม่ {s.new}</Chip> : null}
                      {s.changed ? <Chip tone="warn">ราคาเปลี่ยน {s.changed}</Chip> : null}
                      {s.removed ? <Chip tone="bad">ถูกลบ {s.removed}</Chip> : null}
                      {s.bad ? <Chip tone="bad">ราคาไม่ตรง {s.bad}</Chip> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="m-0 rounded-2xl border border-dashed border-linear-hairline px-4 py-12 text-center text-linear-ink-tertiary">
              {games.length ? "ตรวจครบทุกเกมแล้ว" : "ไม่มี Pack update — คลังตรงกับ PG2 แล้ว"}
            </p>
          )}
        </>
      )}

      {modal && modalGames.length ? (
        <PackUpdateDialog
          games={modalGames}
          all={modal === "price"}
          user={user}
          busy={busy}
          onlyNeedsWork={onlyNeedsWork}
          onOnlyNeedsWork={setOnlyNeedsWork}
          showChecked={showChecked}
          onShowChecked={setShowChecked}
          onRunBot={runBot}
          onCheckAll={checkAll}
          onUsePg2Price={applyPg2Price}
          onChecked={setChecked}
          onClose={() => setModal(null)}
        />
      ) : null}
    </>
  );
}

function PackUpdateHistory({ log }) {
  const [query, setQuery] = useState("");
  const [who, setWho] = useState("");
  const [action, setAction] = useState("");
  const people = [...new Set(log.map((item) => item.who))].sort();
  const needle = query.trim().toLowerCase();
  const rows = log.filter((item) => (!who || item.who === who)
    && (!action || item.action === action)
    && (!needle || `${item.game} ${item.pack} ${item.detail}`.toLowerCase().includes(needle)));
  const perPerson = people
    .filter((name) => name !== "บอท")
    .map((name) => ({ name, checked: log.filter((item) => item.who === name && (item.action === "check" || item.action === "close")).length }))
    .filter((item) => item.checked);
  const th = "sticky top-0 bg-linear-surface-2 px-3 py-2.5 text-left text-[11px] font-bold tracking-[0.05em] text-linear-ink-tertiary";
  const td = "border-t border-linear-hairline px-3 py-2 align-middle";

  return (
    <section className="flex flex-col gap-3">
      <p className="m-0 text-xs text-linear-ink-tertiary">ทุกครั้งที่คนติ๊กตรวจ ยืนยันปิดขาย ยกเลิก แก้ราคา บอทตรวจ หรือนำเข้า จะบันทึกไว้ที่นี่ · ตอนนี้เก็บในเบราว์เซอร์นี้เท่านั้น จนกว่าจะเชื่อม API</p>
      {perPerson.length ? (
        <div className="flex flex-wrap gap-2">
          {perPerson.map((item) => (
            <button key={item.name} type="button" onClick={() => setWho(who === item.name ? "" : item.name)} className={`rounded-xl border px-3 py-2 text-left text-sm transition ${who === item.name ? "border-[#D90005] bg-[#D90005]/[0.06]" : "border-linear-hairline bg-linear-surface-1 hover:bg-linear-surface-3"}`}>
              <b className="block max-w-[200px] truncate text-linear-ink">{item.name}</b>
              <span className="text-xs text-linear-ink-muted">ตรวจไป {item.checked} แพ็ก</span>
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาเกมหรือแพ็ก..." className={`${FIELD} min-w-[200px] flex-1`} />
        <GameinfoSelect value={who} onChange={(event) => setWho(event.target.value)} aria-label="ผู้ตรวจ">
          <option value="">ทุกคน</option>
          {people.map((name) => <option key={name} value={name}>{name}</option>)}
        </GameinfoSelect>
        <GameinfoSelect value={action} onChange={(event) => setAction(event.target.value)} aria-label="การกระทำ">
          <option value="">ทุกการกระทำ</option>
          {Object.entries(PACK_UPDATE_LOG_ACTIONS).map(([id, item]) => <option key={id} value={id}>{item.label}</option>)}
        </GameinfoSelect>
        <span className="text-xs text-linear-ink-tertiary">{rows.length} จาก {log.length} รายการ</span>
      </div>
      <div className="overflow-auto rounded-xl border border-linear-hairline bg-linear-surface-1">
        <table className="w-full min-w-[760px] border-collapse text-[13px] text-linear-ink">
          <thead>
            <tr>
              <th className={th}>เวลา</th>
              <th className={th}>ผู้ตรวจ</th>
              <th className={th}>การกระทำ</th>
              <th className={th}>เกม</th>
              <th className={th}>Pack</th>
              <th className={th}>รายละเอียด</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.slice(0, 500).map((item, index) => {
              const kind = PACK_UPDATE_LOG_ACTIONS[item.action] || { label: item.action || "-", tone: "plain" };
              const type = PACK_UPDATE_TYPES[item.type];
              return (
                <tr key={`${item.at}-${index}`}>
                  <td className={`${td} whitespace-nowrap text-linear-ink-muted`}>{timeText(item.at)}</td>
                  <td className={`${td} max-w-[200px] truncate font-semibold`} title={item.who}>{item.who}</td>
                  <td className={td}><Chip tone={kind.tone}>{kind.label}</Chip></td>
                  <td className={`${td} whitespace-nowrap`}>{item.game || "–"}</td>
                  <td className={td}>
                    {item.pack ? <span className="flex flex-wrap items-center gap-1.5">{item.pack}{type ? <Chip tone={type.tone}>{type.label}</Chip> : null}</span> : "–"}
                  </td>
                  <td className={`${td} whitespace-nowrap font-mono tabular-nums text-linear-ink-muted`}>{item.detail || "–"}</td>
                </tr>
              );
            }) : (
              <tr><td colSpan={6} className="px-3 py-10 text-center text-linear-ink-tertiary">{log.length ? "ไม่มีรายการที่ตรงกับตัวกรอง" : "ยังไม่มีประวัติการตรวจ"}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {rows.length > 500 ? <p className="m-0 text-xs text-linear-ink-tertiary">แสดง 500 รายการล่าสุด ใช้ตัวกรองเพื่อดูรายการเก่ากว่านี้</p> : null}
    </section>
  );
}

function PackUpdateDialog({ games, all, user, busy, onlyNeedsWork, onOnlyNeedsWork, showChecked, onShowChecked, onRunBot, onCheckAll, onUsePg2Price, onChecked, onClose }) {
  const rows = games.flatMap((game) => game.packs.map((pack) => ({ game, pack })));
  const s = summarizePackUpdate(rows.map((row) => row.pack));
  // A pack a person has checked leaves the list; "แสดงที่ตรวจแล้ว" brings it back to undo.
  const view = rows
    .filter((row) => showChecked || !row.pack.human)
    .filter((row) => !onlyNeedsWork || packUpdateNeedsWork(row.pack))
    .sort((a, b) => PACK_UPDATE_TYPES[a.pack.type].order - PACK_UPDATE_TYPES[b.pack.type].order);
  const game = games[0];
  const prio = PACK_UPDATE_PRIORITIES[game.priority];
  const th = "sticky top-0 bg-linear-surface-2 px-3 py-2.5 text-[11px] font-bold tracking-[0.05em] text-linear-ink-tertiary";

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent showCloseButton={false} className="flex max-h-[92vh] flex-col gap-3.5 overflow-hidden rounded-[20px] p-5 sm:max-w-[960px]">
        <div className="flex items-center gap-3.5">
          {all ? (
            <span className="grid h-13 w-13 shrink-0 place-items-center rounded-2xl bg-[#D90005]/10 text-[#D90005]"><FileCheck2 size={22} aria-hidden="true" /></span>
          ) : (
            <span className="relative shrink-0">
              <Cover game={game} size={64} />
              <span className={`absolute -left-1.5 -top-1.5 bg-[#D90005] px-1.5 font-mono text-[11px] ${STAMP}`}>+{rows.length - s.human}</span>
            </span>
          )}
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-xl font-black text-linear-ink">{all ? "ตรวจสอบราคา Pack" : game.name}</DialogTitle>
            <DialogDescription className="text-sm text-linear-ink-muted">
              {all
                ? `${games.length} เกม · ${rows.length} แพ็ก · เทียบราคาในคลังกับราคา PG2`
                : <>ID {game.gameId} · แพ็กในคลัง {game.packTotal} · <b style={{ color: prio.color }}>{prio.label}</b> · {rows.length} รายการเปลี่ยนแปลง</>}
            </DialogDescription>
          </div>
          <button type="button" onClick={onClose} aria-label="ปิด" className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] border border-linear-hairline text-linear-ink hover:bg-linear-surface-3">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <Chip tone="info" className="px-2.5 py-1 text-[13px]">ใหม่ {s.new}</Chip>
          <Chip tone="warn" className="px-2.5 py-1 text-[13px]">ราคาเปลี่ยน {s.changed}</Chip>
          <Chip tone="bad" className="px-2.5 py-1 text-[13px]">ถูกลบจาก PG2 {s.removed}</Chip>
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip tone="ok" className="px-2.5 py-1 text-[13px]">ตรง {s.ok}</Chip>
          <Chip tone="bad" className="px-2.5 py-1 text-[13px]">ไม่ตรง {s.bad}</Chip>
          <Chip tone="warn" className="px-2.5 py-1 text-[13px]">PG2 เลิกขาย {s.gone}</Chip>
          <Chip className="px-2.5 py-1 text-[13px]">รอบอทตรวจ {s.wait}</Chip>
          <Chip tone="info" className="px-2.5 py-1 text-[13px]">คนตรวจแล้ว {s.human}/{rows.length}</Chip>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <button type="button" onClick={onRunBot} disabled={Boolean(busy)} className={BTN_RED}>
            {busy === "bot" ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Bot size={16} aria-hidden="true" />} ให้บอทตรวจราคา
          </button>
          <button type="button" onClick={onCheckAll} disabled={!view.some((row) => !row.pack.human)} className={BTN}>ติ๊กคนตรวจทั้งหมด</button>
          <label className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-[13px] text-linear-ink-muted">
            <input type="checkbox" checked={onlyNeedsWork} onChange={(event) => onOnlyNeedsWork(event.target.checked)} className="h-4 w-4 accent-[#D90005]" />
            แสดงเฉพาะที่ต้องจัดการ
          </label>
          <label className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-[13px] text-linear-ink-muted">
            <input type="checkbox" checked={showChecked} onChange={(event) => onShowChecked(event.target.checked)} className="h-4 w-4 accent-[#D90005]" />
            แสดงที่ตรวจแล้ว ({s.human})
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-linear-hairline">
          <table className="w-full min-w-[680px] border-collapse text-[13px] text-linear-ink">
            <thead>
              <tr>
                {all ? <th className={`${th} text-left`}>เกม</th> : null}
                <th className={`${th} text-left`}>ประเภท</th>
                <th className={`${th} text-left`}>Pack</th>
                <th className={`${th} text-right`}>ราคาเดิม</th>
                <th className={`${th} text-right`}>ราคา PG2</th>
                <th className={`${th} text-right`}>ราคาขึ้นเว็บ</th>
                <th className={`${th} text-left`}>บอทตรวจ</th>
                <th className={`${th} text-left`}>คนตรวจ</th>
              </tr>
            </thead>
            <tbody>
              {view.length ? view.map(({ game: rowGame, pack }) => {
                const type = PACK_UPDATE_TYPES[pack.type];
                const diff = pack.pg2 == null ? 0 : pack.web - pack.pg2;
                const self = pack.editedBy === user;
                const td = `border-t border-linear-hairline px-3 py-2 align-middle ${pack.human ? "opacity-60" : ""} ${pack.bot === "bad" ? "bg-[#D90005]/[0.06]" : pack.type === "removed" ? "bg-amber-400/10" : ""}`;
                const num = `${td} text-right font-mono tabular-nums whitespace-nowrap`;
                return (
                  <tr key={pack.id}>
                    {all ? <td className={`${td} whitespace-nowrap font-semibold`}>{rowGame.name}</td> : null}
                    <td className={td}><Chip tone={type.tone}>{type.label}</Chip></td>
                    <td className={td}>{pack.label}</td>
                    <td className={num}>{pack.old != null ? baht(pack.old) : "–"}</td>
                    <td className={num}>{pack.pg2 != null ? baht(pack.pg2) : <span className="text-[11px] text-linear-ink-tertiary">ไม่มีแล้ว</span>}</td>
                    <td className={num}>
                      {pack.type === "removed" ? <><s>{baht(pack.web)}</s> <small className="font-bold text-[#D90005]">ปิดขาย</small></> : baht(pack.web)}
                      {pack.bot === "bad" ? <small className="ml-1 font-bold text-[#D90005]">{diff > 0 ? "+" : "−"}{baht(Math.abs(diff))}</small> : null}
                    </td>
                    <td className={td}>
                      <span className="flex flex-wrap items-center gap-1.5">
                        {pack.bot === "ok" ? <Chip tone="ok">✓ ตรง</Chip> : pack.bot === "bad" ? <Chip tone="bad">✗ ไม่ตรง</Chip> : pack.bot === "gone" ? <Chip tone="warn">PG2 เลิกขาย</Chip> : <Chip>รอตรวจ</Chip>}
                        {pack.bot === "bad" ? (
                          <button type="button" onClick={() => onUsePg2Price(rowGame, pack)} className="rounded-lg border border-[#D90005] bg-linear-surface-1 px-2 py-0.5 text-xs font-semibold text-[#D90005] hover:bg-[#D90005]/10">ใช้ราคา PG2</button>
                        ) : null}
                      </span>
                    </td>
                    <td className={td}>
                      <label title={self ? `${user} เป็นคนแก้ราคาแพ็กนี้ ต้องให้อีกคนตรวจ` : undefined} className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] text-linear-ink-muted ${self && !pack.human ? "cursor-not-allowed opacity-55" : "cursor-pointer"}`}>
                        <input type="checkbox" checked={pack.human} disabled={self && !pack.human} onChange={(event) => onChecked(rowGame, pack, event.target.checked)} className="h-4 w-4 accent-[#D90005]" />
                        {pack.type === "removed" ? "ยืนยันปิดขาย" : "ตรวจแล้ว"}
                      </label>
                      {pack.human
                        ? <div className="text-[11px] text-linear-ink-tertiary">{pack.checkedBy} · {timeText(pack.checkedAt)}</div>
                        : self ? <div className="text-[11px] text-linear-ink-tertiary">แก้โดย {pack.editedBy} · ต้องให้อีกคนตรวจ</div> : null}
                    </td>
                  </tr>
                );
              }) : (
                <tr><td colSpan={8} className="px-3 py-7 text-center text-linear-ink-tertiary">{s.human === rows.length ? "ตรวจครบทุกแพ็กแล้ว" : "ไม่มีแพ็กที่ต้องจัดการ"}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
