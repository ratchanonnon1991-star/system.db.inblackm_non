"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ClipboardList, ExternalLink, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { AddressesForRecipient } from "@/components/crypto-address-card";
import StockGamePicker from "@/components/stock-game-picker";
import ComboInput from "@/components/combo-input";
import {
  DELIVERY_METHOD_LABELS,
  DELIVERY_STATUS_LABELS,
  PO_ACTION_HINTS,
  PO_ACTION_LABELS,
  PO_OPEN_STATUSES,
  PO_STATUS_LABELS,
  allocatePurchaseOrderCosts,
  PO_SECOND_PERSON,
  PO_STATUSES,
  SHEET_RATE_CURRENCIES,
  purchaseOrderActions,
  purchaseOrderCny,
  purchaseOrderRemaining,
  sheetUsdtForUsd,
  topupCheck,
} from "@/lib/stock-purchase-orders";
import { formatStockNumber, StockDialog, StockField, stockInputClass } from "@/components/stock-ui";
import { formatCurrencyBag, supplierBalances } from "@/lib/stock-supplier-balances";
import StockAttachments from "@/components/stock-attachments";

const STATUS_CLASS = {
  requested: "bg-sky-50 text-sky-800",
  approved: "bg-cyan-100 text-cyan-800",
  paid: "bg-amber-100 text-amber-800",
  accepted: "bg-yellow-100 text-yellow-800",
  delivered: "bg-violet-100 text-violet-800",
  partial: "bg-orange-100 text-orange-800",
  received: "bg-emerald-50 text-emerald-700",
  refund_requested: "bg-red-100 text-red-700",
  refunded: "bg-zinc-200 text-zinc-700",
  cancelled: "bg-zinc-200 text-zinc-500",
};
const ACTION_BUTTON = {
  approve: "bg-cyan-700 hover:bg-cyan-800",
  pay: "bg-amber-600 hover:bg-amber-700",
  accept: "bg-yellow-600 hover:bg-yellow-700",
  deliver: "bg-violet-700 hover:bg-violet-800",
  verify: "bg-emerald-700 hover:bg-emerald-800",
  reject_delivery: "bg-red-600 hover:bg-red-700",
  request_refund: "bg-red-600 hover:bg-red-700",
  refund: "bg-zinc-900 hover:bg-zinc-700",
  cancel: "bg-zinc-500 hover:bg-zinc-600",
};
const FILTERS = [...PO_STATUSES.map((id) => ({ id, label: PO_STATUS_LABELS[id] })), { id: "open", label: "ค้างอยู่ทั้งหมด" }, { id: "all", label: "ทั้งหมด" }];

const TRACK = [
  { key: "requested", label: "ขอซื้อ" },
  { key: "approved", label: "อนุมัติ" },
  { key: "paid", label: "โอนเงิน" },
  { key: "accepted", label: "ซัพรับออเดอร์" },
  { key: "delivered", label: "ของมาถึง" },
  { key: "received", label: "ตรวจแล้ว เข้า stock" },
];
const TRACK_AT = { requested: 0, approved: 1, paid: 2, accepted: 3, delivered: 4, partial: 4, received: 5 };

function OrderTrack({ order }) {
  if (["refund_requested", "refunded", "cancelled"].includes(order.status)) return null;
  const at = TRACK_AT[order.status] ?? 0;
  return (
    <ol className="grid grid-cols-6 gap-1.5" aria-label="ขั้นตอนของใบนี้">
      {TRACK.map((step, index) => (
        <li key={step.key} className="flex flex-col gap-1">
          <span className={`h-1.5 rounded-full ${index <= at ? (index === at && order.status !== "received" ? "bg-[#D90005]" : "bg-emerald-600") : "bg-zinc-200"}`} />
          <span className={`text-[11px] font-extrabold ${index === at ? "text-zinc-900" : "text-zinc-500"}`}>{index === 4 && order.status === "partial" ? "ได้บางส่วน" : step.label}</span>
        </li>
      ))}
    </ol>
  );
}

function DeliveryCard({ delivery }) {
  const tone = delivery.status === "verified" ? "border-emerald-200 bg-emerald-50/50" : delivery.status === "rejected" ? "border-red-200 bg-red-50/50" : "border-violet-200 bg-violet-50/60";
  const check = delivery.topup;
  return (
    <div className={`flex flex-col gap-1.5 rounded-xl border px-3.5 py-3 text-sm ${tone}`}>
      <div className="flex flex-wrap items-center gap-2">
        <b>{DELIVERY_METHOD_LABELS[delivery.method]}</b>
        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-black">{DELIVERY_STATUS_LABELS[delivery.status]}</span>
        {delivery.supplierRef ? <span className="text-xs">ORDER #{delivery.supplierRef}</span> : null}
        <span className="ml-auto text-xs text-zinc-600">บันทึกโดย {delivery.recordedBy || "—"} · {formatDate(delivery.createdAt)}</span>
      </div>
      <p>{delivery.lines.map((line) => `${line.label || "แพ็ค"} × ${line.qty}`).join(", ")}</p>
      {delivery.method === "topup" ? (
        <p className="text-[13px]">
          เติมเข้า <b className="break-all">{delivery.topupAccount}</b> · ก่อน {delivery.balanceBefore} → หลัง {delivery.balanceAfter} = ได้ <b>{check?.got}</b>
          {check?.matches === true ? <span className="ml-1 font-black text-emerald-700">✓ ตรงกับที่ควรได้ {delivery.expected}</span> : null}
          {check?.matches === false ? <span className="ml-1 font-black text-red-700">⚠ ควรได้ {delivery.expected} ขาด {check.short}</span> : null}
        </p>
      ) : null}
      {delivery.expiresOn ? <p className="text-[13px]">หมดอายุ {delivery.expiresOn}</p> : null}
      {delivery.proofUrl ? <a href={delivery.proofUrl} target="_blank" rel="noopener noreferrer" className="flex w-fit items-center gap-1 text-[13px] font-extrabold text-[#B00004] hover:underline">รูปหลักฐาน <ExternalLink size={12} /></a> : null}
      {delivery.note ? <p className="text-[13px] text-zinc-700">{delivery.note}</p> : null}
      {delivery.status !== "pending" ? (
        <p className="text-xs text-zinc-700">
          {delivery.status === "verified" ? "ตรวจโดย" : "ตีกลับโดย"} <b>{delivery.checkedBy || "—"}</b> · {formatDate(delivery.checkedAt)}
          {delivery.selfChecked ? <span className="ml-1 font-black text-amber-800">(คนบันทึกตรวจเอง)</span> : null}
          {delivery.checkNote ? ` · ${delivery.checkNote}` : ""}
        </p>
      ) : null}
    </div>
  );
}

const formatDate = (value) => (value ? new Date(value).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) : "");
const money = (amount, currency) => `${formatStockNumber(amount)} ${currency}`;

export function PurchaseOrderStatusPill({ status }) {
  return <span className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-black ${STATUS_CLASS[status] || STATUS_CLASS.requested}`}>{PO_STATUS_LABELS[status] || status}</span>;
}

function matches(order, query, filter) {
  if (filter === "open" && !PO_OPEN_STATUSES.includes(order.status)) return false;
  if (filter !== "open" && filter !== "all" && order.status !== filter) return false;
  if (!query) return true;
  const text = [order.code, order.accountCode, order.gameName, order.supplier, order.paymentChannel, order.buyer, order.note,
    order.supplierRef, order.searchText, ...order.lines.map((line) => line.label)].join(" ").toLowerCase();
  return text.includes(query);
}

export default function StockPurchaseOrders({ orders, accounts, games = [], wallets = [], canEdit, currentUserId = null, initialOpenId = null, initialQuery = "" }) {
  const [query, setQuery] = useState(initialQuery);
  const [filter, setFilter] = useState(initialQuery || initialOpenId ? "all" : "open");
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState(initialOpenId);
  const counts = Object.fromEntries(PO_STATUSES.map((status) => [status, orders.filter((order) => order.status === status).length]));
  const waitingThb = orders.filter((order) => ["paid", "partial"].includes(order.status)).reduce((sum, order) => sum + (order.amountThb ?? 0), 0);
  const refundThb = orders.filter((order) => order.status === "refund_requested").reduce((sum, order) => sum + (order.refundAmount ?? 0) * (order.currency === "THB" ? 1 : order.rateThb ?? 0), 0);
  const shown = orders.filter((order) => matches(order, query.trim().toLowerCase(), filter));
  const opened = orders.find((order) => order.id === openId);

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5 px-4 py-7 sm:px-7">
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-[1_1_360px]">
          <p className="text-xs font-black tracking-[0.12em] text-[#B00004]">STOCK · ใบสั่งซื้อ</p>
          <h1 className="mt-1 text-3xl font-extrabold">ใบสั่งซื้อ</h1>
          <p className="mt-1.5 text-sm text-zinc-600">ทุกการซื้อเห็นว่าอยู่ขั้นไหน: ขอซื้อ → โอนเงิน → ได้ของ หรือขอคืนเงิน · ได้ของเมื่อไหร่ ยอดเข้า stock ให้เอง</p>
        </div>
        {canEdit ? (
          <button type="button" onClick={() => setCreating(true)} disabled={!games.length && !accounts.some((account) => account.status !== "closed")}
            className="flex h-11 items-center gap-2 rounded-full bg-[#D90005] px-5 text-sm font-extrabold text-white hover:bg-[#B00004] disabled:opacity-40">
            <Plus size={16} strokeWidth={2.4} /> สร้างใบสั่งซื้อ
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
        <SummaryCard label="ขอซื้อ รอโอน" value={counts.requested} unit="ใบ" className="border-sky-200 bg-sky-50 text-sky-900" />
        <SummaryCard label="โอนแล้ว รอของ" value={counts.paid + counts.partial} unit="ใบ" hint={`≈ ฿${formatStockNumber(waitingThb, 0)} ที่ของยังมาไม่ครบ`} className="border-amber-300 bg-amber-50 text-amber-900" />
        <SummaryCard label="ขอคืนเงิน" value={counts.refund_requested} unit="ใบ" hint={refundThb ? `≈ ฿${formatStockNumber(refundThb, 0)} รอได้คืน` : "ยังไม่มีเงินค้างคืน"} className="border-red-300 bg-red-50 text-red-900" />
        <SummaryCard label="จบแล้ว" value={counts.received + counts.refunded + counts.cancelled} unit="ใบ" hint="ได้ของครบ · คืนเงินแล้ว · ยกเลิก" className="border-zinc-200 bg-white" />
      </div>

      <SupplierBalances orders={orders} onPick={(supplier) => { setQuery(supplier); setFilter("all"); }} />

      <div className="flex flex-wrap items-center gap-2.5">
        <label className="flex h-[46px] min-w-0 flex-[1_1_320px] items-center gap-2.5 rounded-xl border border-zinc-300 bg-white px-4">
          <Search size={18} className="text-[#B00004]" aria-hidden="true" />
          <span className="sr-only">ค้นหา</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาเลข PO, เลขออเดอร์ซัพ, TXID, บัญชีที่เติม, ซัพ, แพ็ค..." className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
        </label>
        <div role="group" aria-label="กรองขั้นตอน" className="flex flex-wrap gap-1 rounded-[22px] bg-zinc-200 p-1">
          {FILTERS.map((item) => (
            <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}
              className={`h-[38px] rounded-full px-3.5 text-[13px] font-extrabold ${filter === item.id ? "bg-[#D90005] text-white" : "text-zinc-700 hover:text-zinc-900"}`}>
              {item.label}{counts[item.id] ? ` ${counts[item.id]}` : ""}
            </button>
          ))}
        </div>
      </div>

      {shown.length ? (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-zinc-50 text-left text-xs font-extrabold text-zinc-600">
              <tr>
                <th className="px-4 py-3">ใบสั่งซื้อ</th>
                <th className="px-4 py-3">ขั้นตอน</th>
                <th className="px-4 py-3">ซัพ / ช่องทางจ่าย</th>
                <th className="px-4 py-3">ของเข้าไอดี</th>
                <th className="px-4 py-3 text-right">ยอดจ่าย</th>
                <th className="px-4 py-3 text-right">เข้า stock แล้ว / สั่ง</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {shown.map((order) => (
                <tr key={order.id} className="border-t border-zinc-100 align-top">
                  <td className="px-4 py-3">
                    <p className="font-black">{order.code}</p>
                    <p className="text-xs text-zinc-600">{formatDate(order.createdAt)}{order.buyer ? ` · ${order.buyer}` : ""}</p>
                  </td>
                  <td className="px-4 py-3"><PurchaseOrderStatusPill status={order.status} /></td>
                  <td className="px-4 py-3">
                    <p className="font-extrabold">{order.supplier}</p>
                    <p className="text-xs text-zinc-600">{order.paymentChannel || "—"}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/stock/${order.accountCode}`} className="font-extrabold hover:underline">{order.accountCode}</Link>
                    <p className="text-xs text-zinc-600">{order.lines.map((line) => `${line.label} × ${line.qtyOrdered}`).join(", ")}</p>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <p className="font-black">{money(order.amount, order.currency)}</p>
                    {order.currency !== "CNY" && order.amountCny != null ? <p className="text-xs text-zinc-600">≈ ¥{formatStockNumber(order.amountCny)}</p> : null}
                    {order.currency !== "THB" && order.amountThb != null ? <p className="text-xs text-zinc-600">≈ ฿{formatStockNumber(order.amountThb)}</p> : null}
                    {order.cnyRate != null ? <p className="text-xs text-zinc-500">CNY Rate {order.cnyRate}</p> : null}
                    {order.refundAmount != null ? <p className="text-xs font-bold text-red-700">ขอคืน {money(order.refundAmount, order.currency)}</p> : null}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <p className="font-extrabold">{order.qtyReceived} / {order.qtyOrdered}</p>
                    {order.status === "delivered" ? <p className="text-xs text-violet-700">ยังไม่นับ จนกว่าจะมีคนตรวจ</p> : null}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" onClick={() => setOpenId(order.id)} className="h-9 rounded-full bg-zinc-900 px-3.5 text-[13px] font-extrabold text-white hover:bg-zinc-700">เปิดดู / ทำต่อ</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-14 text-center text-sm text-zinc-600">
          {orders.length ? "ไม่มีใบสั่งซื้อที่ตรงกับตัวกรอง" : canEdit ? "ยังไม่มีใบสั่งซื้อ — กด \"สร้างใบสั่งซื้อ\" เพื่อเริ่ม" : "ยังไม่มีใบสั่งซื้อ"}
        </div>
      )}

      {creating ? <CreatePurchaseOrderDialog accounts={accounts} games={games} usedCurrencies={[...new Set(orders.map((order) => order.currency).filter(Boolean))]} onClose={() => setCreating(false)} /> : null}
      {opened ? <PurchaseOrderDialog key={`${opened.id}-${opened.status}-${opened.qtyReceived}`} order={opened} wallets={wallets} canEdit={canEdit} currentUserId={currentUserId} onClose={() => setOpenId(null)} /> : null}
    </div>
  );
}

/** Per supplier: what we still have to pay, goods still to come for money sent, refunds not back. */
function SupplierBalances({ orders, onPick }) {
  const [showAll, setShowAll] = useState(false);
  const rows = supplierBalances(orders);
  if (!rows.length) return null;
  const open = rows.filter((row) => row.openCount);
  const shown = showAll ? rows : open;
  // Per currency, so an order without a THB rate still shows; ≈ THB only where rates exist.
  const total = (key) => {
    const bag = {};
    for (const row of open) for (const [currency, amount] of Object.entries(row[key])) bag[currency] = (bag[currency] || 0) + amount;
    const thb = open.reduce((sum, row) => sum + row[`${key}Thb`], 0);
    const text = formatCurrencyBag(bag, (n) => formatStockNumber(n, 0));
    return text ? `${text}${thb ? ` (≈ ฿${formatStockNumber(thb, 0)})` : ""}` : "—";
  };
  const cell = (bag, thb) => {
    const text = formatCurrencyBag(bag, (n) => formatStockNumber(n));
    if (!text) return <span className="text-zinc-400">—</span>;
    return <><p className="font-extrabold">{text}</p>{thb ? <p className="text-xs text-zinc-600">≈ ฿{formatStockNumber(thb, 0)}</p> : null}</>;
  };
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-4">
        <div>
          <h2 className="text-base font-black">ยอดค้างต่อซัพ</h2>
          <p className="text-xs text-zinc-600">
            {open.length ? `ค้างอยู่ ${open.length} เจ้า · ต้องจ่าย ${total("toPay")} · จ่ายแล้วรอของ ${total("goods")} · รอเงินคืน ${total("refund")}` : "ไม่มีซัพที่ค้างเงินหรือของ"}
          </p>
        </div>
        <button type="button" onClick={() => setShowAll((value) => !value)} className="text-sm font-extrabold text-[#B00004] hover:underline">
          {showAll ? "เฉพาะที่ค้าง" : `ดูทุกเจ้า (${rows.length})`}
        </button>
      </div>
      {shown.length ? (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-zinc-50 text-left text-xs font-extrabold text-zinc-600">
              <tr>
                <th className="px-4 py-2">ซัพ</th>
                <th className="px-4 py-2 text-right">ต้องจ่าย (ยังไม่โอน)</th>
                <th className="px-4 py-2 text-right">โอนแล้ว ของยังไม่ครบ</th>
                <th className="px-4 py-2 text-right">รอเงินคืน</th>
                <th className="px-4 py-2 text-right">ซื้อทั้งหมด</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={row.supplier} className="border-t border-zinc-100 align-top">
                  <td className="px-4 py-2.5">
                    <button type="button" onClick={() => onPick(row.supplier)} className="font-black hover:underline">{row.supplier}</button>
                    <p className="text-xs text-zinc-600">{row.openCount ? `ค้าง ${row.openCount} ใบ · ` : ""}{row.orderCount} ใบ{row.lastAt ? ` · ล่าสุด ${new Date(row.lastAt).toLocaleDateString("th-TH", { dateStyle: "short" })}` : ""}</p>
                    {row.missingRate ? <p className="text-xs font-bold text-amber-700">บางใบไม่มีเรท ยอดบาทจึงไม่ครบ</p> : null}
                  </td>
                  <td className="px-4 py-2.5 text-right">{cell(row.toPay, row.toPayThb)}</td>
                  <td className="px-4 py-2.5 text-right">{cell(row.goods, row.goodsThb)}</td>
                  <td className="px-4 py-2.5 text-right">{cell(row.refund, row.refundThb)}</td>
                  <td className="px-4 py-2.5 text-right text-zinc-600">{formatCurrencyBag(row.bought, (n) => formatStockNumber(n, 0)) || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="px-4 pb-4 pt-2 text-sm text-zinc-600">ทุกใบจบแล้ว ไม่มีอะไรต้องจ่ายหรือรอ</p>}
      {shown.length ? <p className="px-4 pb-3 pt-2 text-xs text-zinc-500">&quot;โอนแล้ว ของยังไม่ครบ&quot; คิดจากยอดที่จ่าย × สัดส่วนแพ็คที่ยังไม่ได้รับ · กดชื่อซัพเพื่อดูใบของเจ้านั้น</p> : null}
    </section>
  );
}

function SummaryCard({ label, value, unit, hint, className }) {
  return (
    <div className={`rounded-2xl border px-[18px] py-4 ${className}`}>
      <p className="text-[13px]">{label}</p>
      <p className="mt-1 text-3xl font-black">{value} <span className="text-base font-bold">{unit}</span></p>
      {hint ? <p className="mt-0.5 text-xs">{hint}</p> : null}
    </div>
  );
}

const emptyLine = () => ({ key: Math.random().toString(36).slice(2), itemId: "", newLabel: "", qty: "", unitCost: "" });
const NEW_ACCOUNT = "new";
const NEW_PACK = "new";

// Every GameInfo game, plus the games of stock accounts that are not linked to
// one, keyed so a game's accounts can be found: "g<gameId>" or "n<name>".
function orderGames(games, accounts) {
  const byName = new Map(games.map((game) => [game.name.toLowerCase(), `g${game.id}`]));
  const keyOf = (account) => (account.gameId ? `g${account.gameId}` : byName.get(String(account.gameName || "").toLowerCase()) || `n${account.gameName || account.code}`);
  const list = games.map((game) => ({ key: `g${game.id}`, id: game.id, name: game.name }));
  for (const account of accounts) {
    const key = keyOf(account);
    if (!list.some((game) => game.key === key)) list.push({ key, id: account.gameId || null, name: account.gameName || `ไอดี ${account.code} (ไม่ได้ผูกเกม)` });
  }
  const withStock = new Set(accounts.map(keyOf));
  return { list: list.map((game) => ({ ...game, hasStock: withStock.has(game.key) })).sort((a, b) => a.name.localeCompare(b.name)), keyOf };
}

// A suggested code for a new account: the Latin letters of the game's name + "1".
const suggestCode = (name) => {
  const base = String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 20);
  return base.length >= 2 ? `${base}1` : "";
};

// The currency box offers these first; any 3–5 letter code can still be typed.
const PO_COMMON_CURRENCIES = ["THB", "USDT", "USD", "CNY", "USDC"];

function CreatePurchaseOrderDialog({ accounts, games, usedCurrencies = [], onClose }) {
  const router = useRouter();
  const open = accounts.filter((account) => account.status !== "closed");
  const { list: gameList, keyOf } = orderGames(games, open);
  const first = open.find((account) => account.items.length) || open[0];
  const [form, setForm] = useState({ gameKey: first ? keyOf(first) : "", accountId: first ? String(first.id) : "", supplier: "", paymentChannel: "", buyer: "", currency: "THB", amount: "", rateThb: "", productRate: "", cnyRate: "", receiptUrl: "", note: "" });
  const [newAccount, setNewAccount] = useState({ code: "", dataMode: "uid" });
  const [packState, setPackState] = useState({ key: "", names: [] });
  const [lines, setLines] = useState([emptyLine()]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const game = gameList.find((item) => item.key === form.gameKey);
  const gameAccounts = open.filter((account) => keyOf(account) === form.gameKey);
  const creatingAccount = !!game && (form.accountId === NEW_ACCOUNT || !gameAccounts.length);
  const account = creatingAccount ? null : gameAccounts.find((item) => String(item.id) === form.accountId);
  const items = account?.items || [];
  const dataMode = creatingAccount ? newAccount.dataMode : account?.dataMode || "uid";
  const packNames = game?.id && packState.key === `${game.id}-${dataMode}` ? packState.names : [];
  const set = (patch) => setForm((current) => ({ ...current, ...patch }));
  // The 1.1 sheet's rates: Product Rate (CNY per 1 USD of packs), CNY Rate (CNY per 1 USDT).
  // USDT to pay = Total USD × Product Rate ÷ CNY Rate. The THB rate is typed on its own.
  const positive = (value) => { const number = Number(String(value ?? "").replace(/,/g, "")); return Number.isFinite(number) && number > 0 ? number : null; };
  const amountNumber = positive(form.amount);
  const sheetRates = SHEET_RATE_CURRENCIES.includes(form.currency);
  const productRateNumber = sheetRates ? positive(form.productRate) : null;
  const cnyRateNumber = sheetRates ? positive(form.cnyRate) : null;
  const amountCny = amountNumber == null ? null : purchaseOrderCny({ amount: amountNumber, currency: form.currency, productRate: productRateNumber, cnyRate: cnyRateNumber });
  const orderThb = amountNumber == null ? null : form.currency === "THB" ? amountNumber : positive(form.rateThb) ? amountNumber * positive(form.rateThb) : null;
  // Pack value in USD from the chosen packs, as the sheet's Total USD.
  const packUsd = creatingAccount ? null : (() => {
    const chosen = lines.filter((line) => line.itemId && line.itemId !== NEW_PACK && Number(line.qty) > 0);
    if (!chosen.length) return null;
    let total = 0;
    for (const line of chosen) {
      const usd = Number(items.find((item) => String(item.id) === String(line.itemId))?.unitUsd);
      if (!(usd > 0)) return null;
      total += usd * Number(line.qty);
    }
    return Math.round(total * 100) / 100;
  })();
  const usdForSheet = form.currency === "USD" ? amountNumber : packUsd;
  const sheetUsdt = sheetRates ? sheetUsdtForUsd(usdForSheet, productRateNumber, cnyRateNumber) : null;
  // What the server fills in when no cost is typed: the order's THB split by each pack's USD value.
  const autoCosts = Object.fromEntries(allocatePurchaseOrderCosts(
    lines.filter((line) => line.itemId && !creatingAccount && line.itemId !== NEW_PACK && Number(line.qty) > 0).map((line) => ({ itemId: line.itemId, qty: Number(line.qty), unitCost: line.unitCost })),
    Object.fromEntries((items || []).map((item) => [String(item.id), item.unitUsd])),
    orderThb,
  ).filter((line) => line.costAllocated).map((line) => [line.itemId, line.unitCost]));
  const setLine = (key, patch) => setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  const isNewPack = (line) => creatingAccount || line.itemId === NEW_PACK;
  const filled = lines.filter((line) => (isNewPack(line) ? line.newLabel.trim() : line.itemId) && Number(line.qty) > 0);

  function pickGame(key) {
    const picked = gameList.find((item) => item.key === key);
    const own = open.filter((item) => keyOf(item) === key);
    set({ gameKey: key, accountId: own[0] ? String(own[0].id) : NEW_ACCOUNT });
    setNewAccount((current) => ({ ...current, code: suggestCode(picked?.name) }));
    setLines([emptyLine()]);
  }

  // The game's pack names in GameInfo, offered when typing a new pack.
  useEffect(() => {
    if (!game?.id) return undefined;
    let live = true;
    const key = `${game.id}-${dataMode}`;
    apiJson(`/api/stock/games/${game.id}/packs?mode=${dataMode}`)
      .then((data) => { if (live) setPackState({ key, names: data.packs || [] }); })
      .catch(() => { if (live) setPackState({ key, names: [] }); });
    return () => { live = false; };
  }, [game?.id, dataMode]);

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await apiJson("/api/stock/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          accountId: creatingAccount ? null : Number(form.accountId),
          newAccount: creatingAccount ? { code: newAccount.code, dataMode: newAccount.dataMode, gameId: game?.id || null, gameName: game?.id ? game.name : "" } : null,
          lines: filled.map((line) => (isNewPack(line)
            ? { newLabel: line.newLabel.trim(), packName: packNames.includes(line.newLabel.trim()) ? line.newLabel.trim() : "", qty: Number(line.qty), unitCost: line.unitCost }
            : { itemId: Number(line.itemId), qty: Number(line.qty), unitCost: line.unitCost })),
        }),
        fallbackError: "สร้างใบสั่งซื้อไม่สำเร็จ",
      });
      router.refresh();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save}>
      <StockDialog title="สร้างใบสั่งซื้อ" subtitle="ขั้นแรก: ขอซื้อ · ยังไม่แตะยอด stock จนกว่าจะกดรับของ" icon={<ClipboardList size={20} strokeWidth={2.2} />} iconClass="bg-sky-50 text-sky-800" onClose={onClose} wide
        footer={
          <>
            <button type="button" onClick={onClose} className="h-11 rounded-full border border-zinc-300 bg-white px-5 text-sm font-extrabold text-zinc-700">ยกเลิก</button>
            <button type="submit" disabled={saving || !game || (creatingAccount ? !newAccount.code.trim() : !account) || !filled.length} className="flex h-11 items-center gap-2 rounded-full bg-[#D90005] px-6 text-sm font-black text-white hover:bg-[#B00004] disabled:opacity-50">
              {saving ? <Loader2 size={16} className="animate-spin" /> : null} บันทึกใบสั่งซื้อ
            </button>
          </>
        }>
        <div className="grid gap-3 sm:grid-cols-2">
          <StockField label="ซัพพลายเออร์ / ร้าน" htmlFor="po-supplier">
            <input id="po-supplier" value={form.supplier} onChange={(event) => set({ supplier: event.target.value })} className={stockInputClass} placeholder="เช่น Twocard, Panghou, OffGamer" required />
          </StockField>
          <StockField label="เกม" htmlFor="po-game" hint={games.length ? `${gameList.length} เกม · ★ = มีไอดี stock แล้ว` : "ต่อ GameInfo ไม่ได้ตอนนี้ — เลือกได้เฉพาะเกมที่มีไอดี stock แล้ว"}>
            <StockGamePicker id="po-game" games={gameList} value={form.gameKey} onPick={pickGame} />
          </StockField>
        </div>

        {game ? (
          <div className="grid gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3.5 sm:grid-cols-2">
            {gameAccounts.length ? (
              <StockField label="รับของเข้าไอดี stock" htmlFor="po-account">
                <select id="po-account" value={creatingAccount ? NEW_ACCOUNT : form.accountId} onChange={(event) => { set({ accountId: event.target.value }); setLines([emptyLine()]); }} className={stockInputClass}>
                  {gameAccounts.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.items.length} แพ็ค</option>)}
                  <option value={NEW_ACCOUNT}>+ สร้างไอดี stock ใหม่</option>
                </select>
              </StockField>
            ) : (
              <p className="text-[13px] text-zinc-700 sm:col-span-2">เกมนี้ยังไม่มีไอดี stock — ตั้งชื่อไอดีด้านล่าง ระบบจะสร้างให้ตอนบันทึกใบสั่งซื้อ</p>
            )}
            {creatingAccount ? (
              <>
                <StockField label="ชื่อไอดีใหม่" htmlFor="po-new-code" hint="a-z 0-9 . _ - เช่น pes1, lastwar2">
                  <input id="po-new-code" value={newAccount.code} onChange={(event) => setNewAccount((current) => ({ ...current, code: event.target.value }))} className={stockInputClass} required />
                </StockField>
                <StockField label="โหมด" htmlFor="po-new-mode">
                  <select id="po-new-mode" value={newAccount.dataMode} onChange={(event) => setNewAccount((current) => ({ ...current, dataMode: event.target.value }))} className={stockInputClass}>
                    <option value="uid">UID</option><option value="idpass">ID-PASS</option>
                  </select>
                </StockField>
              </>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <StockField label="ช่องทางจ่าย" htmlFor="po-channel" hint="ธนาคาร / กระเป๋าที่โอนออก">
            <input id="po-channel" value={form.paymentChannel} onChange={(event) => set({ paymentChannel: event.target.value })} className={stockInputClass} placeholder="เช่น Bybit Inblack Gaming, KBANK P'aek" />
          </StockField>
          <StockField label="ผู้ซื้อ" htmlFor="po-buyer">
            <input id="po-buyer" value={form.buyer} onChange={(event) => set({ buyer: event.target.value })} className={stockInputClass} placeholder="เช่น RIN, BOMMY" />
          </StockField>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <StockField label="ยอดที่ต้องจ่าย" htmlFor="po-amount">
            <input id="po-amount" inputMode="decimal" value={form.amount} onChange={(event) => set({ amount: event.target.value })} className={stockInputClass} required />
          </StockField>
          <StockField label="สกุลเงิน" htmlFor="po-currency">
            <ComboInput id="po-currency" value={form.currency} onChange={(currency) => set({ currency })} upper placeholder="THB, USDT, CNY"
              groups={[{ label: "ใช้บ่อย", options: PO_COMMON_CURRENCIES }, { label: "เคยใช้ในใบสั่งซื้อ", options: usedCurrencies.filter((code) => !PO_COMMON_CURRENCIES.includes(code)).sort() }]} />
          </StockField>
          <StockField label={`เรท (บาทต่อ 1 ${form.currency && form.currency !== "THB" ? form.currency : "หน่วย"})`} htmlFor="po-rate" hint={form.currency === "THB" ? "THB ไม่ต้องใส่" : "ไม่บังคับ ใช้คิดยอดเป็นบาท"}>
            <input id="po-rate" inputMode="decimal" value={form.rateThb} onChange={(event) => set({ rateThb: event.target.value })} className={stockInputClass} disabled={form.currency === "THB"} />
          </StockField>
        </div>
        {sheetRates ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <StockField label="Product Rate (หยวนต่อ 1 USD)" htmlFor="po-product-rate" hint="ไม่บังคับ · ตามชีต 1.1">
              <input id="po-product-rate" inputMode="decimal" value={form.productRate} onChange={(event) => set({ productRate: event.target.value })} className={stockInputClass} />
            </StockField>
            <StockField label="CNY Rate (หยวนต่อ 1 USDT)" htmlFor="po-cny-rate" hint="ไม่บังคับ · ตามชีต 1.1">
              <input id="po-cny-rate" inputMode="decimal" value={form.cnyRate} onChange={(event) => set({ cnyRate: event.target.value })} className={stockInputClass} />
            </StockField>
            <div className="flex flex-col justify-end gap-1 pb-2 text-[13px] text-zinc-700">
              {amountCny != null ? <span>≈ ¥{formatStockNumber(amountCny)}</span> : null}
              {sheetUsdt != null ? (
                <span>
                  {formatStockNumber(usdForSheet)} USD × {formatStockNumber(productRateNumber, 6)} ÷ {formatStockNumber(cnyRateNumber, 6)} = <b>{formatStockNumber(sheetUsdt)} USDT</b>
                  {form.currency === "USDT" && String(sheetUsdt) !== form.amount ? (
                    <button type="button" onClick={() => set({ amount: String(sheetUsdt) })} className="ml-2 font-extrabold text-[#B00004] hover:underline">ใช้ยอดนี้</button>
                  ) : null}
                </span>
              ) : productRateNumber && cnyRateNumber && form.currency === "USDT" ? <span className="text-zinc-500">เลือกแพ็คที่มีราคา USD เพื่อคิดยอด USDT ให้</span> : null}
            </div>
          </div>
        ) : null}

        <div className="overflow-hidden rounded-2xl border border-zinc-200">
          <div className="grid grid-cols-[minmax(0,1.6fr)_96px_minmax(0,1fr)_40px] gap-2.5 bg-zinc-50 px-3.5 py-2.5 text-xs font-extrabold text-zinc-600">
            <span>แพ็คที่สั่ง</span><span>จำนวน</span><span title="เว้นว่างทุกแถว ระบบแบ่งยอดบาทของใบตามมูลค่า USD ของแต่ละแพ็คให้">ต้นทุนต่อชิ้น (฿) · เว้นว่าง = คิดให้</span><span />
          </div>
          {lines.map((line) => (
            <div key={line.key} className="grid grid-cols-[minmax(0,1.6fr)_96px_minmax(0,1fr)_40px] items-center gap-2.5 border-t border-zinc-100 px-3.5 py-2.5">
              <div className="flex flex-col gap-1.5">
                {creatingAccount ? null : (
                  <select aria-label="แพ็ค" value={line.itemId} onChange={(event) => setLine(line.key, { itemId: event.target.value })} className={stockInputClass}>
                    <option value="">เลือกแพ็ค</option>
                    {items.map((item) => (
                      <option key={item.id} value={item.id} disabled={lines.some((other) => other.key !== line.key && other.itemId === String(item.id))}>
                        {item.label}{item.unitUsd != null ? ` (${item.unitUsd} USD)` : ""} · เหลือ {item.left}
                      </option>
                    ))}
                    <option value={NEW_PACK}>+ แพ็คใหม่ (พิมพ์ชื่อ)</option>
                  </select>
                )}
                {isNewPack(line) ? (
                  <input aria-label="ชื่อแพ็คใหม่" list="po-pack-names" value={line.newLabel} onChange={(event) => setLine(line.key, { newLabel: event.target.value })} className={stockInputClass}
                    placeholder={packNames.length ? "พิมพ์หรือเลือกแพ็คจาก GameInfo" : "เช่น 550 Coins"} />
                ) : null}
              </div>
              <input aria-label="จำนวน" type="number" step="1" min="1" value={line.qty} onChange={(event) => setLine(line.key, { qty: event.target.value })} className={stockInputClass} />
              <input aria-label="ต้นทุนต่อชิ้น" inputMode="decimal" value={line.unitCost} onChange={(event) => setLine(line.key, { unitCost: event.target.value })} className={stockInputClass} placeholder={autoCosts[line.itemId] && lines.every((other) => !isNewPack(other)) ? `อัตโนมัติ ฿${formatStockNumber(Number(autoCosts[line.itemId]))}` : "ไม่บังคับ"} />
              <button type="button" onClick={() => setLines((current) => (current.length > 1 ? current.filter((item) => item.key !== line.key) : [emptyLine()]))} aria-label="ลบแถวนี้" className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <button type="button" onClick={() => setLines((current) => [...current, emptyLine()])} className="flex h-12 w-full items-center gap-2 border-t border-dashed border-zinc-300 px-3.5 text-left text-[13px] font-extrabold text-[#B00004] hover:bg-red-50/40">
            <Plus size={14} strokeWidth={2.6} /> เพิ่มแพ็ค
          </button>
          <datalist id="po-pack-names">{packNames.map((name) => <option key={name} value={name} />)}</datalist>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <StockField label="ลิงก์ใบเสร็จ / สลิป" htmlFor="po-receipt">
            <input id="po-receipt" type="url" value={form.receiptUrl} onChange={(event) => set({ receiptUrl: event.target.value })} className={stockInputClass} placeholder="https://..." />
          </StockField>
          <StockField label="หมายเหตุ" htmlFor="po-note">
            <input id="po-note" value={form.note} onChange={(event) => set({ note: event.target.value })} className={stockInputClass} placeholder="เช่น เลข ORDER ของซัพ" />
          </StockField>
        </div>
        <p className="text-xs text-zinc-600">อย่าใส่รหัสผ่าน PIN หรือโค้ดการ์ดในใบสั่งซื้อ — เก็บไว้ใน password manager ของทีม</p>
        {error ? <p className="rounded-xl bg-red-50 px-3.5 py-3 text-[13px] text-red-800">{error}</p> : null}
      </StockDialog>
    </form>
  );
}

function PurchaseOrderDialog({ order: listed, wallets, canEdit, currentUserId, onClose }) {
  const router = useRouter();
  const [detail, setDetail] = useState(null);
  const order = detail || listed;
  const [action, setAction] = useState(null);
  const [note, setNote] = useState("");
  const [refundAmount, setRefundAmount] = useState(String(order.amount ?? ""));
  const remaining = purchaseOrderRemaining(order.lines);
  const [receive, setReceive] = useState(() => Object.fromEntries(order.lines.map((line) => [line.itemId, String(remaining[line.itemId] || "")])));
  const [supplierRef, setSupplierRef] = useState(listed.supplierRef || "");
  const [deliver, setDeliver] = useState({ method: "topup", supplierRef: listed.supplierRef || "", topupAccount: "", balanceBefore: "", balanceAfter: "", expected: "", proofUrl: "", expiresOn: "" });
  const setDelivery = (patch) => setDeliver((current) => ({ ...current, ...patch }));
  const preview = deliver.method === "topup" ? topupCheck(deliver) : null;
  const payable = wallets.filter((wallet) => wallet.status !== "closed" && wallet.currencies.includes(listed.currency));
  const [pay, setPay] = useState(() => ({ walletId: String(payable.find((wallet) => wallet.code === "bybit")?.id || payable[0]?.id || ""), fee: "", txid: "", occurredAt: "", proofUrl: "" }));
  const payOutside = action === "pay" && !pay.walletId;
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const actions = canEdit ? purchaseOrderActions(order.status) : [];

  useEffect(() => {
    let live = true;
    apiJson(`/api/stock/purchase-orders/${listed.id}`, { fallbackError: "โหลดใบสั่งซื้อไม่สำเร็จ" })
      .then((data) => { if (live) setDetail(data.order); })
      .catch((err) => { if (live) setError(err.message); });
    return () => { live = false; };
  }, [listed.id]);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const data = await apiJson(`/api/stock/purchase-orders/${order.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          note,
          refundAmount,
          walletId: action === "pay" && pay.walletId ? Number(pay.walletId) : undefined,
          outside: payOutside || undefined,
          proofUrl: payOutside ? pay.proofUrl : undefined,
          fee: pay.fee,
          txid: pay.txid,
          occurredAt: pay.occurredAt ? new Date(pay.occurredAt).toISOString() : undefined,
          supplierRef,
          delivery: action === "deliver" ? { ...deliver, lines: Object.entries(receive).map(([itemId, qty]) => ({ itemId: Number(itemId), qty: Number(qty) || 0 })) } : undefined,
        }),
        fallbackError: "บันทึกขั้นตอนไม่สำเร็จ",
      });
      setDetail(data.order);
      setAction(null);
      setNote("");
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const events = detail?.events || [];
  const deliveries = detail?.deliveries || [];
  const waiting = deliveries.find((delivery) => delivery.status === "pending");
  return (
    <StockDialog title={`${order.code} · ${order.supplier}`} subtitle={`เข้าไอดี ${order.accountCode} · สร้างโดย ${order.createdByName || "—"} ${formatDate(order.createdAt)}`} icon={<ClipboardList size={20} strokeWidth={2.2} />} iconClass="bg-zinc-100 text-zinc-800" onClose={onClose} wide>
      <div className="flex flex-wrap items-center gap-3">
        <PurchaseOrderStatusPill status={order.status} />
        <span className="text-sm font-black">{money(order.amount, order.currency)}</span>
        {order.currency !== "CNY" && order.amountCny != null ? <span className="text-sm text-zinc-600">≈ ¥{formatStockNumber(order.amountCny)}</span> : null}
        {order.currency !== "THB" && order.amountThb != null ? <span className="text-sm text-zinc-600">≈ ฿{formatStockNumber(order.amountThb)} (เรท {order.rateThb})</span> : null}
        {order.productRate != null || order.cnyRate != null ? (
          <span className="text-sm text-zinc-600">{[order.productRate != null ? `Product Rate ${order.productRate} หยวน/USD` : "", order.cnyRate != null ? `CNY Rate ${order.cnyRate} หยวน/USDT` : ""].filter(Boolean).join(" · ")}</span>
        ) : null}
        {order.paidWalletName ? <Link href="/stock/wallets" className="text-sm font-extrabold text-zinc-800 hover:underline">หักจาก {order.paidWalletName}</Link> : null}
        {order.paymentChannel ? <span className="text-sm text-zinc-600">ช่องทาง {order.paymentChannel}</span> : null}
        {order.buyer ? <span className="text-sm text-zinc-600">ผู้ซื้อ {order.buyer}</span> : null}
        {order.receiptUrl ? (
          <a href={order.receiptUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sm font-extrabold text-[#B00004] hover:underline">ใบเสร็จ <ExternalLink size={13} /></a>
        ) : null}
      </div>
      <OrderTrack order={order} />
      {order.supplierRef ? <p className="text-sm">เลขออเดอร์ซัพ <b className="select-all">#{order.supplierRef}</b></p> : null}
      {order.note ? <p className="rounded-xl bg-zinc-50 px-3.5 py-2.5 text-[13px] text-zinc-700">{order.note}</p> : null}
      {waiting ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-[13px] font-extrabold text-violet-800">ส่งของแล้ว รอคนตรวจ — ดูหลักฐานแล้วกด &quot;ตรวจแล้ว ถูกต้อง&quot; ยอดถึงจะเข้า stock</p>
          <DeliveryCard delivery={waiting} />
        </div>
      ) : null}
      {order.refundAmount != null ? <p className="rounded-xl bg-red-50 px-3.5 py-2.5 text-[13px] font-bold text-red-800">ขอคืน {money(order.refundAmount, order.currency)}</p> : null}

      <div className="overflow-hidden rounded-2xl border border-zinc-200">
        <div className="grid grid-cols-[minmax(0,1.5fr)_80px_80px_90px] gap-2.5 bg-zinc-50 px-3.5 py-2.5 text-xs font-extrabold text-zinc-600">
          <span>แพ็ค</span><span className="text-right">สั่ง</span><span className="text-right">ได้แล้ว</span><span className="text-right">ต้นทุน/ชิ้น</span>
        </div>
        {order.lines.map((line) => (
          <div key={line.itemId} className="grid grid-cols-[minmax(0,1.5fr)_80px_80px_90px] items-center gap-2.5 border-t border-zinc-100 px-3.5 py-2.5 text-sm">
            <span className="truncate font-extrabold">{line.label}</span>
            <span className="text-right">{line.qtyOrdered}</span>
            <span className={`text-right font-extrabold ${line.qtyReceived >= line.qtyOrdered ? "text-emerald-700" : "text-amber-800"}`}>{line.qtyReceived}</span>
            <span className="text-right text-zinc-600">{line.unitCost != null ? `฿${formatStockNumber(line.unitCost)}` : "—"}</span>
          </div>
        ))}
      </div>

      {actions.some((item) => PO_SECOND_PERSON[item]) ? (
        <p className="rounded-xl bg-cyan-50 px-3.5 py-2.5 text-[13px] text-cyan-900">
          ขั้นนี้ต้องให้<b>คนอื่น</b>ทำ (คนละคนกับคนที่{order.status === "requested" ? "สร้างใบ" : order.status === "delivered" ? "กรอกของที่ได้จากซัพ" : "ขอคืนเงิน"}) เพื่อรีเช็คอีกรอบ
        </p>
      ) : null}
      {actions.length ? (
        <div className="flex flex-wrap gap-2">
          {actions.map((item) => (
            <button key={item} type="button" onClick={() => { setAction(item); setError(""); }} aria-pressed={action === item}
              className={`h-10 rounded-full px-4 text-[13px] font-black text-white ${ACTION_BUTTON[item]} ${action && action !== item ? "opacity-50" : ""}`}>
              {PO_ACTION_LABELS[item]}
            </button>
          ))}
        </div>
      ) : null}
      {actions.length ? (
        <ul className="flex flex-col gap-1 text-[13px] text-zinc-600">
          {(action ? [action] : actions).map((item) => PO_ACTION_HINTS[item] ? (
            <li key={item}><b className="text-zinc-800">{PO_ACTION_LABELS[item]}</b> — กดเมื่อ{PO_ACTION_HINTS[item]}</li>
          ) : null)}
        </ul>
      ) : null}

      {action ? (
        <form onSubmit={submit} className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
          {action === "accept" ? (
            <StockField label="เลขออเดอร์ของซัพ" htmlFor="po-supplier-ref" hint="เช่น ORDER # 47418137 ของ OffGamer หรือเลขที่ซัพให้มา — ใช้ค้นหาภายหลังได้">
              <input id="po-supplier-ref" value={supplierRef} onChange={(event) => setSupplierRef(event.target.value)} className={stockInputClass} required />
            </StockField>
          ) : null}
          {action === "deliver" ? (
            <div className="flex flex-col gap-3">
              <p className="text-[13px] font-extrabold text-zinc-700">ซัพส่งของมาแบบไหน</p>
              <div role="group" aria-label="ซัพส่งของมาแบบไหน" className="flex flex-wrap gap-1 rounded-full bg-zinc-200 p-1">
                {Object.entries(DELIVERY_METHOD_LABELS).map(([method, label]) => (
                  <button key={method} type="button" aria-pressed={deliver.method === method} onClick={() => setDelivery({ method })}
                    className={`h-9 rounded-full px-3.5 text-[13px] font-extrabold ${deliver.method === method ? "bg-violet-700 text-white" : "text-zinc-700"}`}>{label}</button>
                ))}
              </div>
              {deliver.method === "topup" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <StockField label="บัญชีที่เติม (TOP UP MAIL / ID)" htmlFor="po-topup-account">
                    <input id="po-topup-account" value={deliver.topupAccount} onChange={(event) => setDelivery({ topupAccount: event.target.value })} className={stockInputClass} required />
                  </StockField>
                  <StockField label="ยอดที่ควรได้" htmlFor="po-topup-expected" hint="เช่น RAZER USD 350 — ใช้เทียบกับยอดที่เพิ่มขึ้นจริง">
                    <input id="po-topup-expected" inputMode="decimal" value={deliver.expected} onChange={(event) => setDelivery({ expected: event.target.value })} className={stockInputClass} />
                  </StockField>
                  <StockField label="ยอดก่อนเติม" htmlFor="po-topup-before">
                    <input id="po-topup-before" inputMode="decimal" value={deliver.balanceBefore} onChange={(event) => setDelivery({ balanceBefore: event.target.value })} className={stockInputClass} required />
                  </StockField>
                  <StockField label="ยอดหลังเติม" htmlFor="po-topup-after">
                    <input id="po-topup-after" inputMode="decimal" value={deliver.balanceAfter} onChange={(event) => setDelivery({ balanceAfter: event.target.value })} className={stockInputClass} required />
                  </StockField>
                  {preview ? (
                    <p className={`rounded-xl px-3.5 py-2.5 text-[13px] font-bold sm:col-span-2 ${preview.matches === false ? "bg-red-50 text-red-800" : preview.matches ? "bg-emerald-50 text-emerald-800" : "bg-white text-zinc-700"}`}>
                      ได้จริง {preview.got}{preview.matches === true ? " ✓ ตรงกับที่ควรได้" : preview.matches === false ? ` ⚠ ขาด ${preview.short}` : ""}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {deliver.method === "code" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <StockField label="เลข ORDER ของซัพ" htmlFor="po-code-ref">
                    <input id="po-code-ref" value={deliver.supplierRef} onChange={(event) => setDelivery({ supplierRef: event.target.value })} className={stockInputClass} required />
                  </StockField>
                  <StockField label="วันหมดอายุ" htmlFor="po-code-expiry">
                    <input id="po-code-expiry" type="date" value={deliver.expiresOn} onChange={(event) => setDelivery({ expiresOn: event.target.value })} className={stockInputClass} />
                  </StockField>
                  <p className="text-xs text-zinc-600 sm:col-span-2">อย่าใส่ PIN หรือรหัสการ์ดในระบบ — เก็บไว้ใน password manager ของทีม</p>
                </div>
              ) : null}
              <StockField label="ลิงก์รูปหลักฐาน" htmlFor="po-proof" hint="รูปหน้าจอยอดก่อน/หลัง หรือหน้าออเดอร์ (Google Drive ฯลฯ)">
                <input id="po-proof" type="url" value={deliver.proofUrl} onChange={(event) => setDelivery({ proofUrl: event.target.value })} className={stockInputClass} placeholder="https://..." />
              </StockField>
              <p className="text-[13px] font-extrabold text-zinc-700">ได้ของรอบนี้ (เข้า stock เมื่อมีคนกดตรวจแล้ว)</p>
              {order.lines.filter((line) => remaining[line.itemId] > 0).map((line) => (
                <label key={line.itemId} className="grid grid-cols-[minmax(0,1fr)_110px] items-center gap-2.5 text-sm">
                  <span>{line.label} <span className="text-zinc-600">· ค้าง {remaining[line.itemId]}</span></span>
                  <input type="number" step="1" min="0" max={remaining[line.itemId]} value={receive[line.itemId] ?? ""} onChange={(event) => setReceive((current) => ({ ...current, [line.itemId]: event.target.value }))} className={stockInputClass} aria-label={`จำนวนที่ได้ ${line.label}`} />
                </label>
              ))}
            </div>
          ) : null}
          {action === "pay" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <AddressesForRecipient recipient={order.supplier} coin={order.currency} />
              <StockField label={`จ่ายจากกระเป๋า (${order.currency})`} htmlFor="po-pay-wallet" hint={payable.length ? (pay.walletId ? "ระบบหักยอด + fee จากกระเป๋านี้ให้เอง" : "ไม่หักกระเป๋าใด ต้องแนบหลักฐานและบอกช่องทาง") : `ไม่มีกระเป๋าที่ถือ ${order.currency} — เลือกจ่ายทางอื่นพร้อมแนบหลักฐาน`}>
                <select id="po-pay-wallet" value={pay.walletId} onChange={(event) => setPay((current) => ({ ...current, walletId: event.target.value }))} className={stockInputClass}>
                  {payable.map((wallet) => {
                    const balance = wallet.balances.find((item) => item.currency === order.currency)?.balance ?? "0";
                    return <option key={wallet.id} value={wallet.id}>{wallet.name} · เหลือ {balance} {order.currency}</option>;
                  })}
                  <option value="">จ่ายทางอื่น (ไม่หักกระเป๋า · ต้องมีหลักฐาน)</option>
                </select>
              </StockField>
              {payOutside ? (
                <StockField label="ลิงก์หลักฐานการโอน" htmlFor="po-pay-proof" hint="ไม่ต้องใส่ถ้าแนบสลิปไว้ในช่อง &quot;ไฟล์แนบ&quot; ของใบนี้แล้ว">
                  <input id="po-pay-proof" type="url" value={pay.proofUrl} onChange={(event) => setPay((current) => ({ ...current, proofUrl: event.target.value }))} className={stockInputClass} placeholder="https://... (หรือแนบสลิปด้านล่าง)" />
                </StockField>
              ) : null}
              <StockField label={`ค่า fee (${order.currency})`} htmlFor="po-pay-fee">
                <input id="po-pay-fee" inputMode="decimal" value={pay.fee} onChange={(event) => setPay((current) => ({ ...current, fee: event.target.value }))} className={stockInputClass} placeholder="0" />
              </StockField>
              <StockField label="เวลาใบเสร็จ" htmlFor="po-pay-time" hint="เว้นว่าง = ตอนนี้">
                <input id="po-pay-time" type="datetime-local" value={pay.occurredAt} onChange={(event) => setPay((current) => ({ ...current, occurredAt: event.target.value }))} className={stockInputClass} />
              </StockField>
              <StockField label="TXID / เลขอ้างอิง" htmlFor="po-pay-txid">
                <input id="po-pay-txid" value={pay.txid} onChange={(event) => setPay((current) => ({ ...current, txid: event.target.value }))} className={stockInputClass} placeholder="ไม่บังคับ" />
              </StockField>
            </div>
          ) : null}
          {action === "verify" && waiting ? <DeliveryCard delivery={waiting} /> : null}
          {action === "refund" && order.paidWalletName ? <p className="text-[13px] text-zinc-700">เงินคืน {order.refundAmount} {order.currency} จะเข้า {order.paidWalletName} ที่ใช้จ่าย</p> : null}
          {action === "request_refund" ? (
            <StockField label={`ยอดที่ขอคืน (${order.currency})`} htmlFor="po-refund">
              <input id="po-refund" inputMode="decimal" value={refundAmount} onChange={(event) => setRefundAmount(event.target.value)} className={stockInputClass} required />
            </StockField>
          ) : null}
          <StockField label={action === "request_refund" ? "เหตุผลที่ขอคืน" : action === "reject_delivery" ? "ของไม่ตรงตรงไหน" : payOutside ? "จ่ายช่องทางไหน" : "หมายเหตุ"} htmlFor="po-step-note">
            <input id="po-step-note" value={note} onChange={(event) => setNote(event.target.value)} className={stockInputClass} required={action === "request_refund" || action === "reject_delivery" || payOutside}
              placeholder={payOutside ? "เช่น KBANK P'aek โอนตรงให้ซัพ" : action === "pay" ? "เช่น เลขสลิป / TXID" : action === "receive" ? "ไม่บังคับ" : action === "request_refund" ? "เช่น ซัพไม่มีของ" : "ไม่บังคับ"} />
          </StockField>
          {error ? <p className="rounded-xl bg-red-50 px-3.5 py-3 text-[13px] text-red-800">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAction(null)} className="h-10 rounded-full border border-zinc-300 bg-white px-4 text-[13px] font-extrabold text-zinc-700">ยกเลิก</button>
            <button type="submit" disabled={saving} className={`flex h-10 items-center gap-2 rounded-full px-5 text-[13px] font-black text-white disabled:opacity-50 ${ACTION_BUTTON[action]}`}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : null} ยืนยัน: {PO_ACTION_LABELS[action]}
            </button>
          </div>
        </form>
      ) : error ? <p className="rounded-xl bg-red-50 px-3.5 py-3 text-[13px] text-red-800">{error}</p> : null}

      {deliveries.some((delivery) => delivery.status !== "pending") ? (
        <div className="flex flex-col gap-2">
          <p className="text-[13px] font-extrabold text-zinc-700">การส่งของ</p>
          {deliveries.filter((delivery) => delivery.status !== "pending").map((delivery) => <DeliveryCard key={delivery.id} delivery={delivery} />)}
        </div>
      ) : null}

      <StockAttachments kind="po" ownerId={order.id} canEdit={canEdit} currentUserId={currentUserId} title="ไฟล์แนบ / อีเมลซัพ" />

      <div>
        <p className="mb-2 text-[13px] font-extrabold text-zinc-700">ประวัติขั้นตอน</p>
        {detail === null ? <p className="text-sm text-zinc-600"><Loader2 size={14} className="mr-1 inline animate-spin" />กำลังโหลด</p> : (
          <ol className="flex flex-col gap-2">
            {events.map((event) => (
              <li key={event.id} className="flex flex-wrap items-baseline gap-x-2 rounded-xl border border-zinc-100 px-3.5 py-2.5 text-sm">
                <span className="font-extrabold">{PO_ACTION_LABELS[event.action] || event.action}</span>
                <span className="text-zinc-600">→ {PO_STATUS_LABELS[event.toStatus] || event.toStatus}</span>
                <span className="ml-auto text-xs text-zinc-600">{event.actorName || "—"} · {formatDate(event.createdAt)}</span>
                {event.note ? <span className="w-full text-[13px] text-zinc-700">{event.note}</span> : null}
                {event.walletEntryId ? <Link href="/stock/wallets" className="w-full text-xs font-extrabold text-sky-800 hover:underline">{event.action === "refund" ? "คืนเงินเข้ากระเป๋าแล้ว" : "หักยอดกระเป๋าแล้ว"} (รายการ #{event.walletEntryId})</Link> : null}
                {event.moveId ? <Link href={`/stock/${order.accountCode}`} className="w-full text-xs font-extrabold text-emerald-700 hover:underline">บันทึกรับเข้า stock แล้ว (รายการ #{event.moveId})</Link> : null}
              </li>
            ))}
          </ol>
        )}
      </div>
    </StockDialog>
  );
}
