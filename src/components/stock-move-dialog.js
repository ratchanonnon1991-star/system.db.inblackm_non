"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Minus, Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { STOCK_MOVE_LABELS } from "@/lib/stock";
import { formatStockNumber, StockDialog, StockField, stockInputClass } from "@/components/stock-ui";

const KIND_LOOK = {
  in: { icon: <Plus size={20} strokeWidth={2.4} />, iconClass: "bg-emerald-50 text-emerald-700", button: "bg-emerald-700 hover:bg-emerald-800", subtitle: "ซื้อ lot ใหม่เข้าไอดี stock" },
  out: { icon: <Minus size={20} strokeWidth={2.4} />, iconClass: "bg-red-50 text-red-700", button: "bg-[#D90005] hover:bg-[#B00004]", subtitle: "ใช้ของ stock เติมให้ออเดอร์" },
  adjust: { icon: <SlidersHorizontal size={18} strokeWidth={2.4} />, iconClass: "bg-amber-100 text-amber-800", button: "bg-zinc-900 hover:bg-zinc-700", subtitle: "แก้ยอดให้ตรงของจริง ต้องใส่เหตุผล" },
};
const emptyRow = () => ({ key: Math.random().toString(36).slice(2), itemId: "", qty: "", unitCost: "" });

/**
 * Receive, cut or correct stock for one account. `accounts` (with items)
 * lets the overview pick the account; the account page passes just its own.
 */
export default function StockMoveDialog({ accounts, accountId: initialAccountId, kind, onClose }) {
  const router = useRouter();
  const open = accounts.filter((account) => account.status !== "closed");
  const [accountId, setAccountId] = useState(String(initialAccountId || open[0]?.id || ""));
  const [rows, setRows] = useState([emptyRow()]);
  const [queue, setQueue] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [duplicate, setDuplicate] = useState(false);
  const [saving, setSaving] = useState(false);
  const look = KIND_LOOK[kind];
  const account = open.find((item) => String(item.id) === accountId);
  const items = account?.items || [];
  const itemById = new Map(items.map((item) => [String(item.id), item]));

  const preview = rows.map((row) => {
    const item = itemById.get(row.itemId);
    const qty = Number(row.qty);
    if (!item || !Number.isInteger(qty) || qty === 0) return null;
    const after = kind === "out" ? item.left - qty : item.left + qty;
    return { item, qty, after };
  });
  const filled = preview.filter(Boolean);
  const cost = kind === "out" && filled.length && filled.every((line) => line.item.avgCost != null)
    ? filled.reduce((sum, line) => sum + line.qty * line.item.avgCost, 0)
    : null;
  const profit = cost != null && sellPrice !== "" && Number.isFinite(Number(sellPrice)) ? Number(sellPrice) - cost : null;

  const setRow = (key, patch) => setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await apiJson(`/api/stock/accounts/${accountId}/moves`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          queue,
          note,
          sellPrice,
          lines: rows.filter((row) => row.itemId).map((row) => ({ itemId: Number(row.itemId), qty: Number(row.qty), unitCost: row.unitCost })),
          allowDuplicateQueue: duplicate,
        }),
        fallbackError: "บันทึกรายการ stock ไม่สำเร็จ",
      });
      router.refresh();
      onClose();
    } catch (err) {
      if (err.data?.duplicateQueue) setDuplicate(true);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save}>
      <StockDialog
        title={STOCK_MOVE_LABELS[kind]}
        subtitle={look.subtitle}
        icon={look.icon}
        iconClass={look.iconClass}
        onClose={onClose}
        wide
        footer={
          <>
            <button type="button" onClick={onClose} className="h-11 rounded-full border border-zinc-300 bg-white px-5 text-sm font-extrabold text-zinc-700">ยกเลิก</button>
            <button type="submit" disabled={saving || !account || !filled.length} className={`flex h-11 items-center gap-2 rounded-full px-6 text-sm font-black text-white disabled:opacity-50 ${look.button}`}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : null}
              {duplicate ? "ยืนยัน บันทึกเลขคิวซ้ำ" : `บันทึก${STOCK_MOVE_LABELS[kind]}`}
            </button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {kind === "out" ? (
            <StockField label="เลขคิว / ออเดอร์" htmlFor="stock-queue">
              <input id="stock-queue" value={queue} onChange={(event) => { setQueue(event.target.value); setDuplicate(false); }} className={stockInputClass} placeholder="เช่น 215560" required />
            </StockField>
          ) : null}
          <StockField label="ไอดี stock" htmlFor="stock-account">
            <select id="stock-account" value={accountId} onChange={(event) => { setAccountId(event.target.value); setRows([emptyRow()]); }} className={stockInputClass} disabled={Boolean(initialAccountId)}>
              {open.map((item) => <option key={item.id} value={item.id}>{item.code}{item.gameName ? ` · ${item.gameName}` : ""}</option>)}
            </select>
          </StockField>
        </div>

        <div className="overflow-hidden rounded-2xl border border-zinc-200">
          <div className={`grid gap-2.5 bg-zinc-50 px-3.5 py-2.5 text-xs font-extrabold text-zinc-600 ${kind === "in" ? "grid-cols-[minmax(0,1.5fr)_88px_minmax(0,1fr)_120px_40px]" : "grid-cols-[minmax(0,1.5fr)_88px_150px_40px]"}`}>
            <span>แพ็ค</span>
            <span>{kind === "adjust" ? "ปรับ (+/−)" : "จำนวน"}</span>
            {kind === "in" ? <span>ต้นทุนต่อชิ้น (฿)</span> : null}
            <span className="text-right">คงเหลือ ก่อน → หลัง</span>
            <span />
          </div>
          {rows.map((row, index) => {
            const line = preview[index];
            return (
              <div key={row.key} className={`grid items-center gap-2.5 border-t border-zinc-100 px-3.5 py-2.5 ${kind === "in" ? "grid-cols-[minmax(0,1.5fr)_88px_minmax(0,1fr)_120px_40px]" : "grid-cols-[minmax(0,1.5fr)_88px_150px_40px]"}`}>
                <select aria-label="แพ็ค" value={row.itemId} onChange={(event) => setRow(row.key, { itemId: event.target.value })} className={stockInputClass}>
                  <option value="">เลือกแพ็ค</option>
                  {items.map((item) => (
                    <option key={item.id} value={item.id} disabled={rows.some((other) => other.key !== row.key && other.itemId === String(item.id))}>
                      {item.label}{item.unitUsd != null ? ` (${item.unitUsd} USD)` : ""} · เหลือ {item.left}
                    </option>
                  ))}
                </select>
                <input aria-label="จำนวน" type="number" step="1" min={kind === "adjust" ? undefined : 1} value={row.qty} onChange={(event) => setRow(row.key, { qty: event.target.value })} className={stockInputClass} />
                {kind === "in" ? (
                  <input aria-label="ต้นทุนต่อชิ้น" inputMode="decimal" value={row.unitCost} onChange={(event) => setRow(row.key, { unitCost: event.target.value })} className={stockInputClass} placeholder="ไม่บังคับ" />
                ) : null}
                <span className="text-right text-sm font-extrabold">
                  {line ? <>{line.item.left} → <span className={line.after < 0 ? "text-red-700" : kind === "in" ? "text-emerald-700" : "text-zinc-900"}>{line.after}</span></> : <span className="text-zinc-500">—</span>}
                </span>
                <button type="button" onClick={() => setRows((current) => (current.length > 1 ? current.filter((item) => item.key !== row.key) : [emptyRow()]))} aria-label="ลบแถวนี้" className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100">
                  <Trash2 size={16} />
                </button>
              </div>
            );
          })}
          <button type="button" onClick={() => setRows((current) => [...current, emptyRow()])} className="flex h-12 w-full items-center gap-2 border-t border-dashed border-zinc-300 px-3.5 text-left text-[13px] font-extrabold text-[#B00004] hover:bg-red-50/40">
            <Plus size={14} strokeWidth={2.6} /> เพิ่มแพ็ค
          </button>
        </div>

        {kind === "out" ? (
          <div className="grid gap-2.5 sm:grid-cols-3">
            <StockField label="ราคาขาย (฿)" htmlFor="stock-sell">
              <input id="stock-sell" inputMode="decimal" value={sellPrice} onChange={(event) => setSellPrice(event.target.value)} className={stockInputClass} placeholder="ไม่บังคับ" />
            </StockField>
            <div className="rounded-xl bg-zinc-100 px-3.5 py-3">
              <p className="text-xs text-zinc-600">ต้นทุน (เฉลี่ยจาก lot)</p>
              <p className="mt-0.5 text-xl font-black">{cost == null ? "—" : `฿${formatStockNumber(cost)}`}</p>
            </div>
            <div className={`rounded-xl px-3.5 py-3 ${profit == null ? "bg-zinc-100" : profit >= 0 ? "bg-emerald-50" : "bg-red-50"}`}>
              <p className="text-xs text-zinc-600">กำไร</p>
              <p className={`mt-0.5 text-xl font-black ${profit == null ? "" : profit >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                {profit == null ? "—" : `฿${formatStockNumber(profit)}`}
                {profit != null && Number(sellPrice) > 0 ? <span className="ml-1 text-[13px]">· {formatStockNumber((profit / Number(sellPrice)) * 100, 1)}%</span> : null}
              </p>
            </div>
          </div>
        ) : null}

        <StockField label={kind === "adjust" ? "เหตุผล" : "หมายเหตุ"} htmlFor="stock-note">
          <input id="stock-note" value={note} onChange={(event) => setNote(event.target.value)} className={stockInputClass} placeholder={kind === "in" ? "เลขบิล / ร้านที่ซื้อ" : kind === "adjust" ? "เช่น นับของจริงแล้วเหลือ 40" : "ไม่บังคับ"} required={kind === "adjust"} />
        </StockField>

        {duplicate ? (
          <p className="rounded-xl bg-amber-50 px-3.5 py-3 text-[13px] text-amber-900">{error} — ถ้าออเดอร์นี้ใช้ stock เพิ่มจริง กด &quot;ยืนยัน บันทึกเลขคิวซ้ำ&quot;</p>
        ) : error ? (
          <p className="rounded-xl bg-red-50 px-3.5 py-3 text-[13px] text-red-800">{error}</p>
        ) : null}
      </StockDialog>
    </form>
  );
}
