"use client";

import PaginatedTable from "@/components/table-pagination";
import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, Minus, Pencil, Plus, SlidersHorizontal } from "lucide-react";
import { STOCK_MIN_MARGIN, STOCK_MOVE_LABELS, stockMarginTone, stockPackNameParts } from "@/lib/stock";

const MARGIN_CLASS = { ok: "bg-emerald-50 text-emerald-700", low: "bg-amber-100 text-amber-800", loss: "bg-red-50 text-red-700" };
import StockMoveDialog from "@/components/stock-move-dialog";
import { StockAccountDialog, StockItemDialog } from "@/components/stock-edit-dialogs";
import { formatStockNumber, StockLeftBadge, StockStatusPill } from "@/components/stock-ui";

const KIND_CLASS = {
  in: "bg-emerald-50 text-emerald-700",
  out: "bg-red-50 text-red-700",
  adjust: "bg-amber-100 text-amber-800",
};
const HISTORY_FILTERS = [{ id: "all", label: "ทั้งหมด" }, { id: "in", label: "รับเข้า" }, { id: "out", label: "ตัดออก" }, { id: "adjust", label: "ปรับยอด" }];
const dateFormat = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });

function lineText(line) {
  return `${line.label} ×${Math.abs(line.qty)}${line.qty < 0 && line.kind !== "out" ? " (ลด)" : ""}`;
}

export default function StockAccountView({ account, moves, games, packNames, canEdit }) {
  const [dialog, setDialog] = useState(null);
  const [historyFilter, setHistoryFilter] = useState("all");
  const shownMoves = historyFilter === "all" ? moves : moves.filter((move) => move.kind === historyFilter);
  const closed = account.status === "closed";
  // Only when GameInfo answered with packs: an empty list (no game, or GameInfo down) proves nothing.
  const knownPacks = new Set(packNames);
  // The names of an item ("A / B" holds two) that match no pack in GameInfo, so get no badge there.
  const missingPacks = (item) => {
    if (!account.gameId || !knownPacks.size || !item.packName || knownPacks.has(item.packName.trim())) return [];
    const parts = stockPackNameParts(item.packName); // [whole, ...each part] when it holds " / "
    return (parts.length > 1 ? parts.slice(1) : parts).filter((name) => !knownPacks.has(name));
  };

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5 px-4 py-7 sm:px-7">
      <Link href="/stock/inventory" className="flex w-fit items-center gap-1 text-sm font-extrabold text-zinc-700 hover:text-zinc-900">
        <ChevronLeft size={16} strokeWidth={2.4} /> คลังทั้งหมด
      </Link>

      <section className="flex flex-wrap items-center gap-5 rounded-[20px] border border-zinc-200 bg-white px-6 py-5">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-zinc-900 text-base font-black uppercase text-white">{account.code.slice(0, 3)}</div>
        <div className="min-w-0 flex-[1_1_280px]">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[28px] font-black">{account.code}</h1>
            <StockStatusPill status={account.status} />
            <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-extrabold text-zinc-700">{account.dataMode === "idpass" ? "ID-PASS" : "UID"}</span>
          </div>
          <p className="mt-1.5 text-sm text-zinc-600">
            {account.gameName ? <>เกม {account.gameName}</> : "ยังไม่ผูกเกมใน GameInfo"}
            {account.note ? <> · {account.note}</> : null}
          </p>
        </div>
        <dl className="grid flex-[1_1_360px] grid-cols-2 gap-x-7 gap-y-1">
          <dt className="text-xs text-zinc-600">คงเหลือรวม</dt>
          <dt className="text-xs text-zinc-600">มูลค่าคงเหลือ</dt>
          <dd className="text-[22px] font-black">{account.leftTotal} ชิ้น</dd>
          <dd className="text-[22px] font-black">{formatStockNumber(account.valueUsd, 1)} USD</dd>
        </dl>
        {canEdit ? (
          <button type="button" onClick={() => setDialog({ type: "account" })} className="flex h-10 items-center gap-1.5 rounded-full border border-zinc-300 px-4 text-[13px] font-extrabold text-zinc-700 hover:bg-zinc-50">
            <Pencil size={14} /> แก้ไขไอดี
          </button>
        ) : null}
        <p className="basis-full rounded-xl bg-zinc-100 px-3.5 py-2.5 text-[13px] text-zinc-700">ระบบนี้ไม่เก็บไอดี/รหัสผ่านของบัญชีซื้อ · เก็บไว้ใน password manager ของทีม</p>
      </section>

      <section className="overflow-hidden rounded-[20px] border border-zinc-200 bg-white">
        <div className="flex flex-wrap items-center gap-2.5 px-6 py-4">
          <h2 className="text-xl font-black">แพ็คใน stock</h2>
          <span className="text-[13px] text-zinc-600">{account.items.length} แพ็ค · ผูกกับแพ็คใน GameInfo เพื่อขึ้นป้ายในหน้าเกม</span>
          {canEdit && !closed ? (
            <div className="ml-auto flex flex-wrap gap-2">
              <button type="button" onClick={() => setDialog({ type: "item" })} className="h-10 rounded-full border border-zinc-300 px-4 text-[13px] font-extrabold text-zinc-700 hover:bg-zinc-50">เพิ่มแพ็ค</button>
              <button type="button" disabled={!account.items.length} onClick={() => setDialog({ type: "move", kind: "adjust" })} className="flex h-10 items-center gap-1.5 rounded-full border border-zinc-300 px-4 text-[13px] font-extrabold text-zinc-700 hover:bg-zinc-50 disabled:opacity-40">
                <SlidersHorizontal size={14} /> ปรับยอด
              </button>
              <button type="button" disabled={!account.items.length} onClick={() => setDialog({ type: "move", kind: "out" })} className="flex h-10 items-center gap-1.5 rounded-full border-[1.5px] border-[#D90005] px-4 text-[13px] font-extrabold text-[#D90005] disabled:opacity-40">
                <Minus size={14} strokeWidth={2.4} /> ตัดสต็อกออก
              </button>
              <button type="button" disabled={!account.items.length} onClick={() => setDialog({ type: "move", kind: "in" })} className="flex h-10 items-center gap-1.5 rounded-full bg-[#D90005] px-4 text-[13px] font-extrabold text-white hover:bg-[#B00004] disabled:opacity-40">
                <Plus size={14} strokeWidth={2.4} /> รับของเข้า
              </button>
            </div>
          ) : null}
        </div>
        <div className="overflow-x-auto">
          <PaginatedTable items={account.items} resetKey={account.id}>{(tablePageItems, tablePageStart, tableAllItems) => (<table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-zinc-50 text-left text-xs font-extrabold text-zinc-600">
                <th className="border-b border-zinc-200 px-3.5 py-3">PACK</th>
                <th className="border-b border-zinc-200 px-3.5 py-3">มูลค่า</th>
                <th className="border-b border-zinc-200 px-3.5 py-3">รับเข้า</th>
                <th className="border-b border-zinc-200 px-3.5 py-3">ใช้ไป</th>
                <th className="border-b border-zinc-200 px-3.5 py-3">ปรับยอด</th>
                <th className="border-b border-zinc-200 px-3.5 py-3">คงเหลือ</th>
                <th className="border-b border-zinc-200 px-3.5 py-3">ต้นทุนเฉลี่ย</th>
                <th className="border-b border-zinc-200 px-3.5 py-3">แจ้งเมื่อต่ำกว่า</th>
                <th className="border-b border-zinc-200 px-3.5 py-3">แพ็คใน GameInfo</th>
                {canEdit ? <th className="border-b border-zinc-200 px-3.5 py-3"><span className="sr-only">จัดการ</span></th> : null}
              </tr>
            </thead>
            <tbody>
              {tablePageItems.map((tableItem, tableIndex) => ((item) => (
                <tr key={item.id} className="whitespace-nowrap">
                  <td className="border-b border-zinc-100 px-3.5 py-3 font-black">{item.label}</td>
                  <td className="border-b border-zinc-100 px-3.5 py-3">{item.unitUsd != null ? `${item.unitUsd} USD` : "—"}</td>
                  <td className="border-b border-zinc-100 px-3.5 py-3">{item.received}</td>
                  <td className="border-b border-zinc-100 px-3.5 py-3">{item.used}</td>
                  <td className="border-b border-zinc-100 px-3.5 py-3 text-zinc-600">{item.adjusted ? (item.adjusted > 0 ? `+${item.adjusted}` : item.adjusted) : "—"}</td>
                  <td className="border-b border-zinc-100 px-3.5 py-3"><StockLeftBadge item={item} /></td>
                  <td className="border-b border-zinc-100 px-3.5 py-3">{item.avgCost != null ? `฿${formatStockNumber(item.avgCost)}` : "—"}</td>
                  <td className="border-b border-zinc-100 px-3.5 py-3">{item.lowAt}</td>
                  <td className={`border-b border-zinc-100 px-3.5 py-3 text-[13px] ${item.packName ? "" : "font-bold text-amber-800"}`}>
                    {item.packName || "ยังไม่ได้ผูก"}
                    {((missing) => missing.length ? (
                      <span title={`ไม่ตรงกับแพ็คไหนในหน้าเกม (อาจพิมพ์ผิดหรือถูกเปลี่ยนชื่อใน GameInfo) · ป้าย stock ของชื่อนี้จะไม่ขึ้นจนกว่าจะแก้ให้ตรง: ${missing.join(", ")}`}
                        className="ml-2 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-extrabold text-amber-900">
                        ไม่พบใน GameInfo{item.packName.includes(" / ") ? `: ${missing.join(", ")}` : ""}
                      </span>
                    ) : null)(missingPacks(item))}
                  </td>
                  {canEdit ? (
                    <td className="border-b border-zinc-100 px-3.5 py-3 text-right">
                      <button type="button" onClick={() => setDialog({ type: "item", item })} aria-label={`แก้ไขแพ็ค ${item.label}`} className="h-[34px] rounded-full border border-zinc-300 px-3 text-xs font-extrabold text-zinc-700 hover:bg-zinc-50">แก้ไข</button>
                    </td>
                  ) : null}
                </tr>
              ))(tableItem, tablePageStart + tableIndex, tableAllItems))}
              {!account.items.length ? (
                <tr><td colSpan={canEdit ? 10 : 9} className="px-6 py-10 text-center text-sm text-zinc-600">ยังไม่มีแพ็ค{canEdit ? " — กด \"เพิ่มแพ็ค\"" : ""}</td></tr>
              ) : null}
            </tbody>
          </table>)}</PaginatedTable>
        </div>
      </section>

      <section className="overflow-hidden rounded-[20px] border border-zinc-200 bg-white">
        <div className="flex flex-wrap items-center gap-3 px-6 py-4">
          <h2 className="text-xl font-black">ประวัติเข้า-ออก</h2>
          <div role="group" aria-label="กรองประวัติ" className="flex flex-wrap gap-1 rounded-full bg-zinc-100 p-1">
            {HISTORY_FILTERS.map((item) => (
              <button key={item.id} type="button" aria-pressed={historyFilter === item.id} onClick={() => setHistoryFilter(item.id)}
                className={`h-[34px] rounded-full px-3.5 text-xs font-extrabold ${historyFilter === item.id ? "bg-zinc-900 text-white" : "text-zinc-700"}`}>
                {item.label}
              </button>
            ))}
          </div>
          <span className="ml-auto text-[13px] text-zinc-600">ล่าสุด {moves.length} รายการ</span>
        </div>
        <div className="overflow-x-auto">
          <PaginatedTable items={shownMoves} resetKey={JSON.stringify([account.id, historyFilter])}>{(tablePageItems, tablePageStart, tableAllItems) => (<table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-zinc-50 text-left text-xs font-extrabold text-zinc-600">
                <th className="border-b border-zinc-200 px-3.5 py-3">ประเภท</th>
                <th className="border-b border-zinc-200 px-3.5 py-3">เลขคิว</th>
                <th className="border-b border-zinc-200 px-3.5 py-3">แพ็ค</th>
                <th className="border-b border-zinc-200 px-3.5 py-3">ราคาขาย</th>
                <th className="border-b border-zinc-200 px-3.5 py-3">ต้นทุน</th>
                <th className="border-b border-zinc-200 px-3.5 py-3" title={`สีเหลือง = กำไรต่ำกว่า ${STOCK_MIN_MARGIN}% ของราคาขาย`}>กำไร</th>
                <th className="border-b border-zinc-200 px-3.5 py-3">หมายเหตุ</th>
                <th className="border-b border-zinc-200 px-3.5 py-3">วันที่</th>
                <th className="border-b border-zinc-200 px-3.5 py-3">โดย</th>
              </tr>
            </thead>
            <tbody>
              {tablePageItems.map((tableItem, tableIndex) => ((move) => (
                <tr key={move.id}>
                  <td className="whitespace-nowrap border-b border-zinc-100 px-3.5 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-black ${KIND_CLASS[move.kind]}`}>{STOCK_MOVE_LABELS[move.kind]}</span></td>
                  <td className="whitespace-nowrap border-b border-zinc-100 px-3.5 py-3 font-mono">{move.queue || "—"}</td>
                  <td className="min-w-56 border-b border-zinc-100 px-3.5 py-3">{move.lines.map((line) => lineText({ ...line, kind: move.kind })).join(" · ")}</td>
                  <td className="whitespace-nowrap border-b border-zinc-100 px-3.5 py-3">{move.sellPrice != null ? `฿${formatStockNumber(move.sellPrice)}` : "—"}</td>
                  <td className="whitespace-nowrap border-b border-zinc-100 px-3.5 py-3">{move.cost != null ? `฿${formatStockNumber(move.cost)}` : "—"}</td>
                  <td className={`whitespace-nowrap border-b border-zinc-100 px-3.5 py-3 ${move.profit == null ? "text-zinc-500" : move.profit >= 0 ? "font-extrabold text-emerald-700" : "font-extrabold text-red-700"}`}>{move.profit != null ? `฿${formatStockNumber(move.profit)}` : "—"}
                    {move.margin != null ? (
                      <span className={`ml-1.5 rounded-full px-2 py-0.5 text-xs font-black ${MARGIN_CLASS[stockMarginTone(move.margin)]}`} title={stockMarginTone(move.margin) === "low" ? `ต่ำกว่า ${STOCK_MIN_MARGIN}%` : undefined}>{move.margin}%</span>
                    ) : null}</td>
                  <td className="min-w-40 border-b border-zinc-100 px-3.5 py-3 text-zinc-700">{move.note || ""}</td>
                  <td className="whitespace-nowrap border-b border-zinc-100 px-3.5 py-3 text-zinc-600">{dateFormat.format(new Date(move.createdAt))}</td>
                  <td className="whitespace-nowrap border-b border-zinc-100 px-3.5 py-3 text-zinc-600">
                    {move.actorName || "—"}
                    {move.confirmState === "awaiting" ? <Link href="/stock/pending" className="ml-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-extrabold text-amber-900">รอยืนยัน</Link> : null}
                    {move.confirmedBy ? <span className="block text-xs">ยืนยันโดย {move.confirmedBy}</span> : null}
                  </td>
                </tr>
              ))(tableItem, tablePageStart + tableIndex, tableAllItems))}
              {!shownMoves.length ? <tr><td colSpan={9} className="px-6 py-10 text-center text-sm text-zinc-600">ยังไม่มีรายการ</td></tr> : null}
            </tbody>
          </table>)}</PaginatedTable>
        </div>
      </section>

      {dialog?.type === "move" ? <StockMoveDialog accounts={[account]} accountId={account.id} kind={dialog.kind} onClose={() => setDialog(null)} /> : null}
      {dialog?.type === "account" ? <StockAccountDialog account={account} games={games} onClose={() => setDialog(null)} /> : null}
      {dialog?.type === "item" ? <StockItemDialog accountId={account.id} item={dialog.item || null} packNames={packNames} onClose={() => setDialog(null)} /> : null}
    </div>
  );
}
