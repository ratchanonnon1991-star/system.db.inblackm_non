"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Minus, Plus, Search } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import StockMoveDialog from "@/components/stock-move-dialog";
import { StockAccountDialog } from "@/components/stock-edit-dialogs";
import { formatStockNumber, STOCK_BAR_CLASS, StockLeftBadge, StockStatusPill, StockWebLinkBadge } from "@/components/stock-ui";

const FILTERS = [
  { id: "all", label: "ทั้งหมด" },
  { id: "low", label: "ใกล้หมด" },
  { id: "empty", label: "หมด" },
  { id: "check", label: "ต้องตรวจ" },
];

function matches(account, query, filter) {
  if (filter === "low" && !account.lowCount) return false;
  if (filter === "empty" && !account.emptyCount) return false;
  if (filter === "check" && account.status !== "check") return false;
  if (!query) return true;
  const text = [account.code, account.gameName, ...account.items.map((item) => item.label)].join(" ").toLowerCase();
  return text.includes(query);
}

const NO_GAME = "none";
const gameKeyOf = (account) => (account.gameId ? `g${account.gameId}` : String(account.gameName || "").trim().toLowerCase() || NO_GAME);

// The games that have an account, by name, with "ยังไม่ผูกเกม" last.
function gameChips(accounts) {
  const chips = new Map();
  for (const account of accounts) {
    const key = gameKeyOf(account);
    if (!chips.has(key)) chips.set(key, { key, accountId: account.id, name: key === NO_GAME ? "ยังไม่ผูกเกม" : account.gameName || `เกม #${account.gameId}`, count: 0 });
    chips.get(key).count += 1;
  }
  return [...chips.values()].sort((a, b) => (a.key === NO_GAME) - (b.key === NO_GAME) || a.name.localeCompare(b.name, "th"));
}

// Soft tile colours for a game with no GameInfo icon, picked by its name so a game keeps its colour.
const TILE_TONES = [
  "from-rose-500 to-red-600", "from-orange-400 to-amber-600", "from-emerald-400 to-teal-600", "from-sky-400 to-blue-600",
  "from-violet-400 to-purple-600", "from-fuchsia-400 to-pink-600", "from-lime-400 to-green-600", "from-slate-500 to-zinc-700",
];
function tileTone(text) {
  let hash = 0;
  for (const ch of String(text)) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
  return TILE_TONES[hash % TILE_TONES.length];
}
// "Diablo Immortal" → "DI", "Honkai: Star Rail" → "HS", "delta01" → "DE".
function initials(text) {
  const words = String(text || "").replace(/[^\p{L}\p{N}\s]/gu, " ").trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) return (words[0][0] + words[1][0]).toUpperCase();
  return (words[0] || "?").replace(/\d+$/, "").slice(0, 2).toUpperCase() || "?";
}

// The game's GameInfo icon, else its initials on a coloured tile.
function GameLogo({ src, name, size }) {
  const [broken, setBroken] = useState(false);
  const radius = size >= 40 ? "rounded-2xl" : "rounded-full";
  if (src && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" onError={() => setBroken(true)} className={`shrink-0 border border-zinc-200 bg-white object-cover shadow-sm ${radius}`} style={{ width: size, height: size }} />;
  }
  return (
    <div aria-hidden="true" className={`flex shrink-0 items-center justify-center bg-linear-to-br font-black tracking-wide text-white shadow-sm ${radius} ${tileTone(name)}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}>
      {initials(name)}
    </div>
  );
}

export default function StockOverview({ accounts: allAccounts, games, logos = {}, canEdit, webSync = false }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [gameKey, setGameKey] = useState("all");
  const [dialog, setDialog] = useState(null);
  const chips = gameChips(allAccounts);
  const picked = chips.find((chip) => chip.key === gameKey);
  const accounts = picked ? allAccounts.filter((account) => gameKeyOf(account) === picked.key) : allAccounts;
  const open = accounts.filter((account) => account.status !== "closed");
  const totals = {
    value: open.reduce((sum, account) => sum + account.valueUsd, 0),
    low: open.reduce((sum, account) => sum + account.lowCount, 0),
    empty: open.reduce((sum, account) => sum + account.emptyCount, 0),
  };
  const shown = accounts.filter((account) => matches(account, query.trim().toLowerCase(), filter));

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5 px-4 py-7 sm:px-7">
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-[1_1_360px]">
          <p className="text-xs font-black tracking-[0.12em] text-[#B00004]">STOCK · คลัง</p>
          <h1 className="mt-1 text-3xl font-extrabold">คลังของที่ซื้อตุนไว้</h1>
          <p className="mt-1.5 text-sm text-zinc-600">แยกตามไอดี stock · ยอดคงเหลือคิดจากประวัติรับเข้าและตัดออกทั้งหมด</p>
        </div>
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setDialog({ type: "account" })} className="h-11 rounded-full border border-zinc-300 bg-white px-5 text-sm font-extrabold text-zinc-800 hover:bg-zinc-50">เพิ่มไอดี</button>
            <button type="button" disabled={!open.length} onClick={() => setDialog({ type: "move", kind: "out" })} className="flex h-11 items-center gap-2 rounded-full border-[1.5px] border-[#D90005] bg-white px-5 text-sm font-extrabold text-[#D90005] disabled:opacity-40">
              <Minus size={16} strokeWidth={2.4} /> ตัดสต็อกออก
            </button>
            <button type="button" disabled={!open.length} onClick={() => setDialog({ type: "move", kind: "in" })} className="flex h-11 items-center gap-2 rounded-full bg-[#D90005] px-5 text-sm font-extrabold text-white hover:bg-[#B00004] disabled:opacity-40">
              <Plus size={16} strokeWidth={2.4} /> รับของเข้า
            </button>
          </div>
        ) : null}
      </div>

      <WebSyncMaster enabled={webSync} canEdit={canEdit} on={allAccounts.filter((account) => account.webSoldOut === true && account.status !== "closed").length} />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
        <div className="rounded-2xl border border-zinc-200 bg-white px-[18px] py-4">
          <p className="text-[13px] text-zinc-600">ไอดี stock ที่ใช้อยู่</p>
          <p className="mt-1 text-3xl font-black">{open.length}</p>
          <p className="mt-0.5 text-xs text-zinc-600">ทั้งหมด {accounts.length} ไอดี{picked ? ` · ${picked.name}` : ""}</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white px-[18px] py-4">
          <p className="text-[13px] text-zinc-600">มูลค่าคงเหลือ</p>
          <p className="mt-1 text-3xl font-black">{formatStockNumber(totals.value, 0)} <span className="text-base font-bold text-zinc-600">USD</span></p>
          <p className="mt-0.5 text-xs text-zinc-600">มูลค่าแพ็ค × จำนวนคงเหลือ</p>
        </div>
        <div className="rounded-2xl border border-amber-300 bg-amber-50 px-[18px] py-4 text-amber-900">
          <p className="text-[13px]">ใกล้หมด</p>
          <p className="mt-1 text-3xl font-black">{totals.low} <span className="text-base font-bold">แพ็ค</span></p>
          <p className="mt-0.5 text-xs">ต่ำกว่าเกณฑ์ที่ตั้งไว้ของแต่ละแพ็ค</p>
        </div>
        <div className="rounded-2xl border border-red-300 bg-red-50 px-[18px] py-4 text-red-900">
          <p className="text-[13px]">หมดแล้ว</p>
          <p className="mt-1 text-3xl font-black">{totals.empty} <span className="text-base font-bold">แพ็ค</span></p>
          <p className="mt-0.5 text-xs">ขึ้น &quot;stock หมด&quot; ในหน้าเกมให้ทีมเติมเห็น</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <label className="flex h-[46px] min-w-0 flex-[1_1_320px] items-center gap-2.5 rounded-xl border border-zinc-300 bg-white px-4">
          <Search size={18} className="text-[#B00004]" aria-hidden="true" />
          <span className="sr-only">ค้นหา</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาไอดี เกม หรือแพ็ค..." className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
        </label>
        <div role="group" aria-label="กรองสถานะ" className="flex flex-wrap gap-1 rounded-full bg-zinc-200 p-1">
          {FILTERS.map((item) => (
            <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}
              className={`h-[38px] rounded-full px-4 text-[13px] font-extrabold ${filter === item.id ? "bg-[#D90005] text-white" : "text-zinc-700 hover:text-zinc-900"}`}>
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {chips.length > 1 ? (
        <div role="group" aria-label="กรองตามเกม" className="-mt-2 flex flex-wrap gap-2">
          {[{ key: "all", name: "ทุกเกม", count: allAccounts.length }, ...chips].map((chip) => {
            const on = (picked ? picked.key : "all") === chip.key;
            return (
              <button key={chip.key} type="button" aria-pressed={on} onClick={() => setGameKey(chip.key)}
                className={`flex h-9 items-center gap-2 rounded-full border pl-1.5 pr-3.5 text-[13px] font-extrabold ${on ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-500"} ${chip.key === NO_GAME && !on ? "border-dashed text-zinc-500" : ""}`}>
                {chip.accountId && chip.key !== NO_GAME ? <GameLogo src={logos[chip.accountId]} name={chip.name} size={26} /> : <span className="w-1" />}
                {chip.name} <span className={on ? "text-zinc-300" : "text-zinc-500"}>{chip.count}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {shown.length ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,420px),1fr))] gap-4">
          {shown.map((account) => <AccountCard key={account.id} account={account} logo={logos[account.id]} filter={filter} canEdit={canEdit} webSync={webSync} />)}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-14 text-center text-sm text-zinc-600">
          {accounts.length ? "ไม่มีไอดีที่ตรงกับตัวกรอง" : canEdit ? "ยังไม่มีไอดี stock — กด \"เพิ่มไอดี\" เพื่อเริ่ม" : "ยังไม่มีไอดี stock"}
        </div>
      )}

      {dialog?.type === "move" ? <StockMoveDialog accounts={allAccounts} kind={dialog.kind} onClose={() => setDialog(null)} /> : null}
      {dialog?.type === "account" ? <StockAccountDialog games={games} onClose={() => setDialog(null)} /> : null}
    </div>
  );
}

// The "ต้องตรวจ" note folded to one line, so a long sheet note does not push the packs down.
function CheckNote({ note }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-start gap-2 bg-amber-50 px-[18px] py-2 text-[13px] text-amber-900">
      <AlertTriangle size={15} strokeWidth={2.4} className="mt-0.5 shrink-0" aria-hidden="true" />
      <p className={`min-w-0 flex-1 whitespace-pre-line ${open ? "" : "line-clamp-1"}`}>{note}</p>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="shrink-0 font-extrabold underline-offset-2 hover:underline">
        {open ? "ย่อ" : "อ่านต่อ"}
      </button>
    </div>
  );
}

/** Save a switch, then show the page as the server now has it. */
function useSwitchSave(url, method, fallbackError) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const save = async (body) => {
    setSaving(true);
    setError("");
    try {
      await apiJson(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), fallbackError });
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };
  return { saving, error, save };
}

function SwitchButton({ on, label, disabled, onClick }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={onClick}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${on ? "bg-[#D90005]" : "bg-zinc-300"}`}>
      <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${on ? "translate-x-5" : ""}`} />
    </button>
  );
}

/** The main switch: off, and no account touches the main site whatever its own switch says. */
function WebSyncMaster({ enabled, canEdit, on }) {
  const { saving, error, save } = useSwitchSave("/api/stock/web-sync", "PUT", "บันทึกการเชื่อมเว็บหลักไม่สำเร็จ");
  return (
    <div className={`rounded-2xl border px-[18px] py-3.5 ${enabled ? "border-red-200 bg-red-50" : "border-zinc-200 bg-white"}`}>
      <div className="flex items-center justify-between gap-4">
        <p className="min-w-0 text-sm font-black text-zinc-900">
          เชื่อมกับเว็บหลัก (ทั้งหมด): {enabled ? "เปิด" : "ปิด"}
          <span className="mt-0.5 block text-[13px] font-normal text-zinc-600">
            {enabled ? `ไอดีที่เปิดซิงค์ ${on} ไอดี: แพ็คยอด 0 เป็นสีเทาและกดซื้อไม่ได้บนเว็บ` : "ไม่เชื่อมกับหน้าบ้านเลย ไม่ว่าสวิตช์ของแต่ละไอดีจะเป็นอย่างไร"}
          </span>
        </p>
        <SwitchButton on={enabled} label="เชื่อมกับเว็บหลักทั้งหมด" disabled={!canEdit || saving} onClick={() => save({ enabled: !enabled })} />
      </div>
      {error ? <p role="alert" className="mt-1 text-xs font-bold text-red-700">{error}</p> : null}
    </div>
  );
}

/** Off leaves the main site alone; on, this account's empty packs go grey there. */
function WebSyncSwitch({ account, canEdit, webSync }) {
  const { saving, error, save } = useSwitchSave(`/api/stock/accounts/${account.id}`, "PATCH", "บันทึกการซิงค์ไม่สำเร็จ");
  const on = account.webSoldOut === true;

  return (
    <div className="border-b border-zinc-100 px-[18px] py-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 text-[13px] font-extrabold text-zinc-800">
          ซิงค์ของหมดไปเว็บหลัก
          <span className="block text-xs font-normal text-zinc-600">{!webSync ? "ปุ่มเชื่อมทั้งหมดปิดอยู่ ยังไม่มีผล" : on ? "ยอด 0 = เป็นสีเทา กดซื้อไม่ได้" : "ไม่ยุ่งกับเว็บหลัก"}</span>
        </span>
        <SwitchButton on={on} label={`ซิงค์ของหมดไปเว็บหลัก ${account.code}`} disabled={!canEdit || saving} onClick={() => save({ webSoldOut: !on })} />
      </div>
      {error ? <p role="alert" className="mt-1 text-xs font-bold text-red-700">{error}</p> : null}
    </div>
  );
}

function AccountCard({ account, logo, filter, canEdit, webSync }) {
  // Under the "ใกล้หมด" / "หมด" filters show only the packs that made the account match,
  // so a card found by "หมด" does not look full because its other packs still have stock.
  const packTone = filter === "low" || filter === "empty" ? filter : null;
  const items = packTone ? account.items.filter((item) => item.tone === packTone) : account.items;
  const hidden = account.items.length - items.length;
  return (
    <article className={`flex flex-col overflow-hidden rounded-[18px] border border-zinc-200 bg-white ${account.status === "closed" ? "opacity-70" : ""}`}>
      <div className="flex items-center gap-3 border-b border-zinc-100 px-[18px] py-4">
        <GameLogo src={logo} name={account.gameName || account.code} size={48} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-black leading-tight">{account.gameName || account.code}</p>
          <p className="mt-1 flex min-w-0 items-center gap-1.5 text-[13px] text-zinc-600">
            {account.gameName ? <span className="truncate rounded-md bg-zinc-100 px-1.5 py-0.5 font-mono text-[12px] font-bold text-zinc-800">{account.code}</span> : (
              <span className="shrink-0 rounded-md border border-dashed border-zinc-300 px-1.5 py-0.5 text-[12px] font-bold text-zinc-500">ยังไม่ผูกเกม</span>
            )}
            <span className="shrink-0">{account.dataMode === "idpass" ? "ID-PASS" : "UID"}</span>
          </p>
        </div>
        <StockStatusPill status={account.status} />
      </div>
      <WebSyncSwitch account={account} canEdit={canEdit} webSync={webSync} />
      {account.note && account.status === "check" ? <CheckNote note={account.note} /> : null}
      <div className="px-[18px] pb-2 pt-1.5">
        {items.length ? items.map((item) => {
          const percent = item.received > 0 ? Math.max(0, Math.min(100, Math.round((item.left / item.received) * 100))) : 0;
          return (
            <div key={item.id} className="grid grid-cols-[minmax(0,150px)_64px_minmax(0,1fr)_56px] items-center gap-3 border-b border-zinc-100 py-2 last:border-0">
              <span className="flex min-w-0 flex-col items-start gap-1">
                <span className="max-w-full truncate text-sm font-extrabold" title={item.label}>{item.label}</span>
                <StockWebLinkBadge account={account} item={item} webSync={webSync} />
              </span>
              <span className="text-xs text-zinc-600">{item.unitUsd != null ? `${item.unitUsd} USD` : ""}</span>
              <span className="h-2 overflow-hidden rounded-full bg-zinc-100"><span className={`block h-full rounded-full ${STOCK_BAR_CLASS[item.tone]}`} style={{ width: `${percent}%` }} /></span>
              <span className="justify-self-end"><StockLeftBadge item={item} /></span>
            </div>
          );
        }) : <p className="py-4 text-sm text-zinc-600">ยังไม่มีแพ็ค</p>}
        {hidden > 0 ? <p className="py-2 text-xs text-zinc-600">แสดงเฉพาะแพ็คที่{packTone === "empty" ? "หมดแล้ว" : "ใกล้หมด"} · ซ่อนแพ็คอื่นของไอดีนี้ {hidden} แพ็ค</p> : null}
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-3 bg-zinc-50 px-[18px] py-3">
        <span className="text-[13px] text-zinc-600">ทั้งไอดีคงเหลือ <b className="text-zinc-900">{account.leftTotal}</b> ชิ้น · มูลค่า <b className="text-zinc-900">{formatStockNumber(account.valueUsd, 1)} USD</b></span>
        <Link href={`/stock/${account.code}`} className="ml-auto flex h-9 items-center rounded-full bg-zinc-900 px-3.5 text-[13px] font-extrabold text-white hover:bg-zinc-700">ดูไอดีนี้</Link>
      </div>
    </article>
  );
}
