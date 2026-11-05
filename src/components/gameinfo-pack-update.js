"use client";

import { useMemo, useState } from "react";
import { Bot, CloudDownload, FileCheck2, Loader2, Lock, PackagePlus, Upload, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { gameinfoGameColor, gameinfoGameInitials } from "@/lib/gameinfo-game-initials";
import {
  PACK_UPDATE_PRIORITIES,
  PACK_UPDATE_TYPES,
  mockGameinfoPackUpdates,
  packUpdateBotResult,
  packUpdateGate,
  packUpdateNeedsWork,
  summarizePackUpdate,
} from "@/lib/gameinfo-pack-update";

const OTHER_USER = "แอดมินอีกคน";
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

const baht = (value) => `฿${Number(value).toLocaleString("en-US")}`;
const clock = () => new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

function Chip({ tone = "plain", className = "", children }) {
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${CHIP[tone]} ${className}`}>{children}</span>;
}

function Cover({ game, size }) {
  const style = size ? { width: size, height: size } : undefined;
  if (game.image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={game.image} alt="" style={style} className={`aspect-square shrink-0 rounded-xl object-cover ${size ? "" : "w-full"}`} />;
  }
  return (
    <span
      aria-hidden="true"
      style={{ ...style, background: gameinfoGameColor(Number(game.pg)) }}
      className={`flex aspect-square shrink-0 items-center justify-center rounded-xl font-black text-white ${size ? "text-lg" : "w-full text-3xl"}`}
    >
      {gameinfoGameInitials(game.name)}
    </span>
  );
}

/**
 * GameInfo's Pack Update screen: what PG2 changed, the bot and a person
 * checking each pack, then one import. Everything here is a mock until the
 * PG2 API exists: the games and images are GameInfo's, the packs are made up,
 * and nothing is saved.
 */
export default function GameinfoPackUpdate({ rows, userName = "" }) {
  const me = userName || "แอดมิน A";
  const [games, setGames] = useState(() => mockGameinfoPackUpdates(rows));
  const [user, setUser] = useState(me);
  const [priority, setPriority] = useState("all");
  const [modal, setModal] = useState(null);
  const [onlyNeedsWork, setOnlyNeedsWork] = useState(false);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [log, setLog] = useState([]);
  const [logOpen, setLogOpen] = useState(false);

  const allPacks = useMemo(() => games.flatMap((game) => game.packs), [games]);
  const total = summarizePackUpdate(allPacks, user);
  const gate = packUpdateGate(allPacks, user);
  const blocked = gate.some((rule) => !rule.ok);
  const shown = games
    .filter((game) => priority === "all" || String(game.priority) === priority)
    .sort((a, b) => a.priority - b.priority || b.newCount - a.newCount);
  const modalGames = modal === "price" ? games : games.filter((game) => game.pg === modal);

  const addLog = (who, message) => setLog((current) => [{ at: clock(), who, message }, ...current]);
  const updatePacks = (change) => setGames((current) => current.map((game) => ({ ...game, packs: game.packs.map((pack) => change(pack, game) || pack) })));

  function runBot() {
    const ids = new Set(modalGames.flatMap((game) => game.packs.map((pack) => pack.id)));
    setBusy("bot");
    setTimeout(() => {
      const checked = [];
      updatePacks((pack) => {
        if (!ids.has(pack.id)) return null;
        const next = { ...pack, bot: packUpdateBotResult(pack) };
        checked.push(next);
        return next;
      });
      const s = summarizePackUpdate(checked);
      addLog("บอท", `ตรวจราคา ${checked.length} แพ็ก: ตรง ${s.ok} · ไม่ตรง ${s.bad} · PG2 เลิกขาย ${s.gone}`);
      setBusy("");
    }, 900);
  }

  function applyPg2Price(game, pack) {
    addLog(user, `แก้ราคา ${game.name} ${pack.label}: ${baht(pack.web)} → ${baht(pack.pg2)}`);
    updatePacks((item) => item.id === pack.id ? { ...item, web: item.pg2, bot: null, human: false, checkedBy: null, checkedAt: null, editedBy: user } : null);
  }

  function setChecked(game, pack, on) {
    if (on && pack.editedBy === user) return;
    addLog(user, `${on ? (pack.type === "removed" ? "ยืนยันปิดขาย" : "ตรวจแล้ว") : "ยกเลิกการตรวจ"} ${game.name} ${pack.label}`);
    updatePacks((item) => item.id === pack.id
      ? { ...item, ...(on ? { human: true, checkedBy: user, checkedAt: clock() } : { human: false, checkedBy: null, checkedAt: null }) }
      : null);
  }

  function checkAll() {
    const ids = new Set(modalGames.flatMap((game) => game.packs)
      .filter((pack) => (!onlyNeedsWork || packUpdateNeedsWork(pack)) && !pack.human && pack.editedBy !== user)
      .map((pack) => pack.id));
    if (!ids.size) return;
    const at = clock();
    updatePacks((pack) => ids.has(pack.id) ? { ...pack, human: true, checkedBy: user, checkedAt: at } : null);
    addLog(user, `ติ๊กตรวจแล้ว ${ids.size} แพ็ก`);
  }

  function pull() {
    setBusy("pull");
    setTimeout(() => {
      setBusy("");
      setNote(`ดึงข้อมูลล่าสุดจาก PG2 แล้ว — มี ${games.length} เกมที่เปลี่ยน (ข้อมูลตัวอย่าง)`);
    }, 700);
  }

  function importAll() {
    if (blocked) return;
    setBusy("import");
    setTimeout(() => {
      const fresh = games.filter((game) => !game.gameId).length;
      addLog(user, `นำเข้าคลัง: แพ็กใหม่ ${total.new} · แก้ราคา ${total.changed} · ปิดขาย ${total.removed} · เกมใหม่ ${fresh}`);
      setGames([]);
      setModal(null);
      setBusy("");
      setLogOpen(true);
      setNote(`อัปเดตแล้ว — แพ็กใหม่ ${total.new} · แก้ราคา ${total.changed} · ปิดขาย ${total.removed} · เกมใหม่ ${fresh} เกม (ตัวอย่าง ยังไม่ได้บันทึกจริง)`);
    }, 900);
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="m-0 text-xs font-black tracking-[0.2em] text-[#D90005]">PACK UPDATE</p>
          <h1 className="m-0 text-[clamp(28px,3vw,36px)] font-black leading-tight text-linear-ink">อัปเดตเกมใหม่</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-amber-400/20 px-3 py-1 text-xs font-bold text-amber-800 dark:text-amber-300">ข้อมูลตัวอย่าง · ยังไม่เชื่อม PG2</span>
          <div role="group" aria-label="ใช้งานเป็น" className="flex items-center gap-1 rounded-full border border-linear-hairline bg-linear-surface-1 p-1 text-xs font-bold">
            <span className="whitespace-nowrap px-2 text-linear-ink-tertiary">ใช้งานเป็น</span>
            {[me, OTHER_USER].map((name) => (
              <button key={name} type="button" aria-pressed={user === name} onClick={() => setUser(name)} title={name} className={`max-w-[180px] truncate rounded-full px-3 py-1.5 transition ${user === name ? "bg-[#D90005] text-white" : "text-linear-ink-muted hover:text-linear-ink"}`}>
                {name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <section className="flex flex-wrap items-center gap-4 rounded-2xl border border-linear-hairline bg-linear-surface-1 p-5">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-[#D90005]/10 text-[#D90005]"><PackagePlus size={24} aria-hidden="true" /></span>
        <div className="min-w-[200px] flex-1">
          <h2 className="m-0 text-xl font-black text-linear-ink">Game Update</h2>
          <p className="m-0 mt-0.5 text-sm text-linear-ink-muted">
            การเปลี่ยนแปลงจาก PG2 · {games.length} เกม · ใหม่ {total.new} · ราคาเปลี่ยน {total.changed} · ถูกลบ {total.removed}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={importAll} disabled={Boolean(busy) || !games.length || blocked} title={blocked ? "ยังไม่ผ่านเงื่อนไขก่อนนำเข้า" : undefined} className={BTN_RED}>
            {blocked && games.length ? <Lock size={16} aria-hidden="true" /> : null}
            {busy === "import" ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Upload size={16} aria-hidden="true" />}
            อัปเดตเข้าคลัง
          </button>
          <button type="button" onClick={() => { setModal("price"); setOnlyNeedsWork(false); }} disabled={!games.length} className={BTN}>
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

      <details open={logOpen} onToggle={(event) => setLogOpen(event.currentTarget.open)} className="rounded-2xl border border-linear-hairline bg-linear-surface-1 px-4 py-3">
        <summary className="cursor-pointer font-bold text-linear-ink">ประวัติการตรวจ ({log.length})</summary>
        {log.length ? (
          <ol className="m-0 mt-2.5 flex max-h-[220px] list-none flex-col gap-1.5 overflow-auto p-0 text-sm text-linear-ink">
            {log.map((entry, index) => (
              <li key={`${entry.at}-${index}`}><span className="text-xs text-linear-ink-tertiary">{entry.at}</span> <b>{entry.who}</b> {entry.message}</li>
            ))}
          </ol>
        ) : <p className="m-0 mt-2 text-xs text-linear-ink-tertiary">ยังไม่มีรายการ ทุกครั้งที่บอทตรวจ คนติ๊กตรวจ แก้ราคา หรือนำเข้า จะบันทึกไว้ที่นี่</p>}
      </details>

      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 font-black text-linear-ink">
          Pack update <span className="rounded-full bg-[#D90005] px-2.5 text-xs text-white">{games.length}</span>
        </div>
        <div role="group" aria-label="ลำดับความสำคัญ" className="flex flex-wrap rounded-2xl border border-linear-hairline bg-linear-surface-1 p-1">
          {[["all", "ทั้งหมด"], ...Object.entries(PACK_UPDATE_PRIORITIES).map(([id, item]) => [id, `${item.label} ${games.filter((game) => String(game.priority) === id).length}`])].map(([id, label]) => (
            <button key={id} type="button" aria-pressed={priority === id} onClick={() => setPriority(id)} className={`rounded-full px-3.5 py-1.5 text-[13px] font-bold transition ${priority === id ? "bg-[#D90005] text-white" : "text-linear-ink-muted hover:text-linear-ink"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {games.length ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3.5">
          {shown.map((game) => {
            const s = summarizePackUpdate(game.packs);
            const prio = PACK_UPDATE_PRIORITIES[game.priority];
            return (
              <button
                key={game.pg}
                type="button"
                onClick={() => { setModal(game.pg); setOnlyNeedsWork(false); }}
                aria-label={`ดูแพ็กของ ${game.name}`}
                className={`flex flex-col items-center gap-1.5 rounded-2xl border bg-linear-surface-1 p-3 text-center transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D90005] ${game.priority === 1 ? "border-[#D90005] shadow-[0_0_0_1px_#D90005]" : "border-linear-hairline"}`}
              >
                <span className="relative block w-full">
                  <Cover game={game} />
                  <span title={`แพ็กใหม่ ${game.newCount} แพ็ก`} className={`absolute left-1.5 top-1.5 bg-[#D90005] px-2 py-0.5 font-mono text-[13px] tabular-nums ${STAMP}`}>+{game.newCount}</span>
                  <span className={`absolute right-1.5 top-1.5 px-2 py-0.5 text-[11px] ${STAMP}`} style={{ background: prio.color }}>{prio.label}</span>
                </span>
                <span className="line-clamp-2 text-[13px] font-bold text-linear-ink">{game.name}</span>
                <span className="font-mono text-[11px] text-linear-ink-tertiary">PG2 #{game.pg}</span>
                <span className="flex flex-wrap justify-center gap-1">
                  <Chip tone={game.gameId ? "ok" : "info"}>{game.gameId ? "เกมเดิม" : "เกมใหม่"}</Chip>
                  {s.changed ? <Chip tone="warn">ราคาเปลี่ยน {s.changed}</Chip> : null}
                  {s.removed ? <Chip tone="bad">ถูกลบ {s.removed}</Chip> : null}
                  {s.bad ? <Chip tone="bad">ราคาไม่ตรง {s.bad}</Chip> : s.wait ? null : <Chip tone="ok">บอทตรวจผ่าน</Chip>}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="m-0 rounded-2xl border border-dashed border-linear-hairline px-4 py-12 text-center text-linear-ink-tertiary">ไม่มี Pack update — คลังตรงกับ PG2 แล้ว</p>
      )}

      {modal && modalGames.length ? (
        <PackUpdateDialog
          games={modalGames}
          all={modal === "price"}
          user={user}
          busy={busy}
          onlyNeedsWork={onlyNeedsWork}
          onOnlyNeedsWork={setOnlyNeedsWork}
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

function PackUpdateDialog({ games, all, user, busy, onlyNeedsWork, onOnlyNeedsWork, onRunBot, onCheckAll, onUsePg2Price, onChecked, onClose }) {
  const rows = games.flatMap((game) => game.packs.map((pack) => ({ game, pack })));
  const s = summarizePackUpdate(rows.map((row) => row.pack));
  const view = (onlyNeedsWork ? rows.filter((row) => packUpdateNeedsWork(row.pack)) : rows)
    .slice()
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
              <span className={`absolute -left-1.5 -top-1.5 bg-[#D90005] px-1.5 font-mono text-[11px] ${STAMP}`}>+{game.newCount}</span>
            </span>
          )}
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-xl font-black text-linear-ink">{all ? "ตรวจสอบราคา Pack" : game.name}</DialogTitle>
            <DialogDescription className="text-sm text-linear-ink-muted">
              {all
                ? `${games.length} เกม · ${rows.length} แพ็ก · เทียบราคาในคลังกับราคา PG2`
                : <>PG2 #{game.pg} · {game.gameId ? "เกมเดิม" : "เกมใหม่"} · <b style={{ color: prio.color }}>{prio.label}</b> · {rows.length} รายการเปลี่ยนแปลง</>}
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
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onRunBot} disabled={Boolean(busy)} className={BTN_RED}>
            {busy === "bot" ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Bot size={16} aria-hidden="true" />} ให้บอทตรวจราคา
          </button>
          <button type="button" onClick={onCheckAll} className={BTN}>ติ๊กคนตรวจทั้งหมด</button>
          <label className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-[13px] text-linear-ink-muted">
            <input type="checkbox" checked={onlyNeedsWork} onChange={(event) => onOnlyNeedsWork(event.target.checked)} className="h-4 w-4 accent-[#D90005]" />
            แสดงเฉพาะที่ต้องจัดการ
          </label>
          <span className="text-xs text-linear-ink-tertiary">กำลังใช้งานเป็น <b className="text-linear-ink">{user}</b></span>
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
                const td = `border-t border-linear-hairline px-3 py-2 align-middle ${pack.bot === "bad" ? "bg-[#D90005]/[0.06]" : pack.type === "removed" ? "bg-amber-400/10" : ""}`;
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
                        ? <div className="text-[11px] text-linear-ink-tertiary">{pack.checkedBy} · {pack.checkedAt}</div>
                        : self ? <div className="text-[11px] text-linear-ink-tertiary">แก้โดย {pack.editedBy} · ต้องให้อีกคนตรวจ</div> : null}
                    </td>
                  </tr>
                );
              }) : (
                <tr><td colSpan={8} className="px-3 py-7 text-center text-linear-ink-tertiary">ไม่มีแพ็กที่ต้องจัดการ</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
