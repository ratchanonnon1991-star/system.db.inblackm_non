"use client";

import { useState } from "react";
import Link from "next/link";
import { Minus, Plus, Search } from "lucide-react";
import StockMoveDialog from "@/components/stock-move-dialog";
import { StockAccountDialog } from "@/components/stock-edit-dialogs";
import { formatStockNumber, STOCK_BAR_CLASS, StockLeftBadge, StockStatusPill } from "@/components/stock-ui";

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

export default function StockOverview({ accounts, games, canEdit }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [dialog, setDialog] = useState(null);
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
          <p className="text-xs font-black tracking-[0.12em] text-[#B00004]">STOCK</p>
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

      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
        <div className="rounded-2xl border border-zinc-200 bg-white px-[18px] py-4">
          <p className="text-[13px] text-zinc-600">ไอดี stock ที่ใช้อยู่</p>
          <p className="mt-1 text-3xl font-black">{open.length}</p>
          <p className="mt-0.5 text-xs text-zinc-600">ทั้งหมด {accounts.length} ไอดี</p>
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

      {shown.length ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,420px),1fr))] gap-4">
          {shown.map((account) => <AccountCard key={account.id} account={account} />)}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-14 text-center text-sm text-zinc-600">
          {accounts.length ? "ไม่มีไอดีที่ตรงกับตัวกรอง" : canEdit ? "ยังไม่มีไอดี stock — กด \"เพิ่มไอดี\" เพื่อเริ่ม" : "ยังไม่มีไอดี stock"}
        </div>
      )}

      {dialog?.type === "move" ? <StockMoveDialog accounts={accounts} kind={dialog.kind} onClose={() => setDialog(null)} /> : null}
      {dialog?.type === "account" ? <StockAccountDialog games={games} onClose={() => setDialog(null)} /> : null}
    </div>
  );
}

function AccountCard({ account }) {
  return (
    <article className={`flex flex-col overflow-hidden rounded-[18px] border border-zinc-200 bg-white ${account.status === "closed" ? "opacity-70" : ""}`}>
      <div className="flex items-center gap-3 border-b border-zinc-100 px-[18px] py-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-[13px] font-black uppercase text-white">{account.code.slice(0, 3)}</div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-black">{account.code}</p>
          <p className="truncate text-[13px] text-zinc-600">{account.gameName || "ยังไม่ผูกเกม"} · {account.dataMode === "idpass" ? "ID-PASS" : "UID"}</p>
        </div>
        <StockStatusPill status={account.status} />
      </div>
      {account.note && account.status === "check" ? <p className="bg-amber-50 px-[18px] py-2.5 text-[13px] font-bold text-amber-900">{account.note}</p> : null}
      <div className="px-[18px] pb-2 pt-1.5">
        {account.items.length ? account.items.map((item) => {
          const percent = item.received > 0 ? Math.max(0, Math.min(100, Math.round((item.left / item.received) * 100))) : 0;
          return (
            <div key={item.id} className="grid grid-cols-[minmax(0,110px)_64px_minmax(0,1fr)_56px] items-center gap-3 border-b border-zinc-100 py-2 last:border-0">
              <span className="truncate text-sm font-extrabold" title={item.label}>{item.label}</span>
              <span className="text-xs text-zinc-600">{item.unitUsd != null ? `${item.unitUsd} USD` : ""}</span>
              <span className="h-2 overflow-hidden rounded-full bg-zinc-100"><span className={`block h-full rounded-full ${STOCK_BAR_CLASS[item.tone]}`} style={{ width: `${percent}%` }} /></span>
              <span className="justify-self-end"><StockLeftBadge item={item} /></span>
            </div>
          );
        }) : <p className="py-4 text-sm text-zinc-600">ยังไม่มีแพ็ค</p>}
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-3 bg-zinc-50 px-[18px] py-3">
        <span className="text-[13px] text-zinc-600">คงเหลือ <b className="text-zinc-900">{account.leftTotal}</b> ชิ้น · มูลค่า <b className="text-zinc-900">{formatStockNumber(account.valueUsd, 1)} USD</b></span>
        <Link href={`/stock/${account.code}`} className="ml-auto flex h-9 items-center rounded-full bg-zinc-900 px-3.5 text-[13px] font-extrabold text-white hover:bg-zinc-700">ดูไอดีนี้</Link>
      </div>
    </article>
  );
}
