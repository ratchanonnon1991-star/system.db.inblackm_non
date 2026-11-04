"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowDownToLine, ArrowRight, ArrowRightLeft, Loader2, Repeat, ShoppingCart, SlidersHorizontal, Wallet } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { PO_STATUS_LABELS } from "@/lib/stock-purchase-orders";
import { WALLET_ENTRY_LABELS, WALLET_PAYMENT_STATUS_LABELS, WALLET_REVIEW_LABELS } from "@/lib/stock-wallets";
import { StockDialog, StockField, stockInputClass } from "@/components/stock-ui";

const KIND_LOOK = {
  deposit: { icon: <ArrowDownToLine size={18} strokeWidth={2.4} />, iconClass: "bg-emerald-50 text-emerald-700", subtitle: "เงินเข้ากระเป๋า เช่น Russia deposit เข้า Bitazza" },
  transfer: { icon: <ArrowRightLeft size={18} strokeWidth={2.4} />, iconClass: "bg-sky-50 text-sky-800", subtitle: "ย้ายสกุลเดียวกันข้ามกระเป๋า เช่น Bitazza → BITKUB, BITKUB → Bybit" },
  exchange: { icon: <Repeat size={18} strokeWidth={2.4} />, iconClass: "bg-violet-50 text-violet-800", subtitle: "แลกสกุลในกระเป๋าเดียว เช่น USDT → THB ใน BITKUB" },
  payment: { icon: <ShoppingCart size={18} strokeWidth={2.4} />, iconClass: "bg-red-50 text-red-700", subtitle: "จ่ายค่าสินค้าที่ไม่ได้ผ่านใบสั่งซื้อ · ถ้าเป็นของเข้า stock ให้จ่ายจากใบสั่งซื้อ" },
  adjust: { icon: <SlidersHorizontal size={18} strokeWidth={2.4} />, iconClass: "bg-amber-100 text-amber-800", subtitle: "แก้ยอดให้ตรงกับยอดจริงในแอป ต้องใส่เหตุผล · ยอดเปลี่ยนทันที" },
};
const KIND_TONE = {
  deposit: "bg-emerald-50 text-emerald-700",
  transfer: "bg-sky-50 text-sky-800",
  exchange: "bg-violet-50 text-violet-800",
  payment: "bg-red-50 text-red-700",
  refund: "bg-emerald-50 text-emerald-700",
  adjust: "bg-amber-100 text-amber-800",
};

const formatTime = (value) => (value ? new Date(value).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) : "");
const formatAmount = (value) => {
  const [whole, frac] = String(value ?? "0").split(".");
  return `${Number(whole).toLocaleString("en-US")}${frac ? `.${frac}` : ""}`;
};
const signed = (value) => (String(value).startsWith("-") ? `−${formatAmount(String(value).slice(1))}` : `+${formatAmount(value)}`);
const nowLocal = () => {
  const at = new Date();
  at.setMinutes(at.getMinutes() - at.getTimezoneOffset());
  return at.toISOString().slice(0, 16);
};

// The sheet's extra columns: [field, label, placeholder].
const SHEET_FIELDS = [
  ["channel", "ช่องทาง", "เช่น Application"],
  ["destinationAccount", "ชื่อบัญชีปลายทาง", "ไม่บังคับ"],
  ["seller", "ผู้ขาย", "ไม่บังคับ"],
  ["buyer", "ผู้ซื้อ", "ไม่บังคับ"],
  ["credit", "ยอดเครดิต", "0"],
];

function SheetDetails({ entry }) {
  const shown = SHEET_FIELDS.filter(([key]) => entry[key]);
  if (!shown.length) return null;
  return (
    <p className="mt-0.5 text-xs text-zinc-600">
      {shown.map(([key, label], index) => (
        <span key={key}>{index ? " · " : ""}{label} <b className="text-zinc-800">{key === "credit" ? formatAmount(entry[key]) : entry[key]}</b></span>
      ))}
    </p>
  );
}

/** The payment's step: its order's status when it paid one, else its own. */
export function walletEntryStatus(entry) {
  if (entry.kind !== "payment") return null;
  if (entry.orderId) return { label: PO_STATUS_LABELS[entry.orderStatus] || "ใบสั่งซื้อ", done: ["received", "refunded", "cancelled"].includes(entry.orderStatus) };
  return { label: WALLET_PAYMENT_STATUS_LABELS[entry.status], done: entry.status === "done" };
}

export default function StockWallets({ wallets, entries, canEdit }) {
  const router = useRouter();
  const [dialog, setDialog] = useState(null);
  const [walletFilter, setWalletFilter] = useState("all");
  const [busy, setBusy] = useState(null);
  const shown = walletFilter === "all" ? entries : entries.filter((entry) => entry.legs.some((leg) => String(leg.walletId) === walletFilter));

  const awaiting = entries.filter((entry) => entry.status === "awaiting_approval");

  async function review(entry, decision) {
    const note = decision === "reject" ? window.prompt("เหตุผลที่ไม่อนุมัติ") : "";
    if (decision === "reject" && !note) return;
    setBusy(entry.id);
    try {
      await apiJson(`/api/stock/wallets/entries/${entry.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note }),
        fallbackError: "อนุมัติการปรับยอดไม่สำเร็จ",
      });
      router.refresh();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function toggle(entry) {
    setBusy(entry.id);
    try {
      await apiJson(`/api/stock/wallets/entries/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: entry.status === "done" ? "pending" : "done" }),
        fallbackError: "แก้สถานะไม่สำเร็จ",
      });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5 px-4 py-7 sm:px-7">
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-[1_1_360px]">
          <p className="text-xs font-black tracking-[0.12em] text-[#B00004]">STOCK · กระเป๋าเงิน</p>
          <h1 className="mt-1 text-3xl font-extrabold">กระเป๋าเงิน</h1>
          <p className="mt-1.5 text-sm text-zinc-600">ยอดคงเหลือคิดจากทุกรายการเข้า-ออก รวม fee · จ่ายค่าของเข้า stock ให้ทำจาก <Link href="/stock/purchase-orders" className="font-extrabold text-[#B00004] hover:underline">ใบสั่งซื้อ</Link></p>
        </div>
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            {["deposit", "transfer", "exchange", "payment", "adjust"].map((kind) => (
              <button key={kind} type="button" onClick={() => setDialog(kind)}
                className={`flex h-11 items-center gap-2 rounded-full px-4 text-sm font-extrabold ${kind === "transfer" ? "bg-[#D90005] text-white hover:bg-[#B00004]" : "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50"}`}>
                {KIND_LOOK[kind].icon} {WALLET_ENTRY_LABELS[kind]}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col items-stretch gap-3 lg:flex-row lg:items-center">
        {wallets.map((wallet, index) => (
          <div key={wallet.id} className="flex flex-1 flex-col items-stretch gap-3 lg:flex-row lg:items-center">
            {index > 0 ? <ArrowRight size={22} className="mx-auto shrink-0 rotate-90 text-zinc-400 lg:rotate-0" aria-hidden="true" /> : null}
            <article className="flex-1 rounded-[18px] border border-zinc-200 bg-white px-[18px] py-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900 text-white"><Wallet size={18} /></span>
                <div className="min-w-0">
                  <p className="truncate text-[17px] font-black">{wallet.name}</p>
                  <p className="text-[13px] text-zinc-600">{wallet.role}</p>
                </div>
              </div>
              <dl className="mt-3 flex flex-col gap-1.5">
                {wallet.balances.map((item) => (
                  <div key={item.currency} className="flex items-baseline justify-between gap-3 border-t border-zinc-100 pt-1.5">
                    <dt className="text-sm font-extrabold text-zinc-700">{item.currency}</dt>
                    <dd className="text-right">
                      <span className={`text-lg font-black ${String(item.balance).startsWith("-") ? "text-red-700" : ""}`}>{formatAmount(item.balance)}</span>
                      {item.fees !== "0" ? <span className="block text-xs text-zinc-600">fee รวม {formatAmount(item.fees)}</span> : null}
                    </dd>
                  </div>
                ))}
              </dl>
            </article>
          </div>
        ))}
      </div>

      {awaiting.length ? (
        <p className="rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-900">
          มีการปรับยอดเก่า <b>{awaiting.length}</b> รายการที่ยังค้างรออนุมัติ — กดอนุมัติหรือไม่อนุมัติให้จบ (ปรับยอดใหม่มีผลทันที ไม่ต้องรออนุมัติแล้ว)
        </p>
      ) : null}

      <div role="group" aria-label="กรองกระเป๋า" className="flex w-fit flex-wrap gap-1 rounded-full bg-zinc-200 p-1">
        {[{ id: "all", name: "ทุกกระเป๋า" }, ...wallets.map((wallet) => ({ id: String(wallet.id), name: wallet.name }))].map((item) => (
          <button key={item.id} type="button" aria-pressed={walletFilter === item.id} onClick={() => setWalletFilter(item.id)}
            className={`h-[38px] rounded-full px-4 text-[13px] font-extrabold ${walletFilter === item.id ? "bg-[#D90005] text-white" : "text-zinc-700 hover:text-zinc-900"}`}>
            {item.name}
          </button>
        ))}
      </div>

      {shown.length ? (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-zinc-50 text-left text-xs font-extrabold text-zinc-600">
              <tr>
                <th className="px-4 py-3">เวลาใบเสร็จ</th>
                <th className="px-4 py-3">ประเภท</th>
                <th className="px-4 py-3">ชื่อรายการ</th>
                <th className="px-4 py-3">กระเป๋า · ยอด · fee</th>
                <th className="px-4 py-3 text-right">ยอดคงเหลือ</th>
                <th className="px-4 py-3">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((entry) => {
                const status = walletEntryStatus(entry);
                return (
                  <tr key={entry.id} className="border-t border-zinc-100 align-top">
                    <td className="px-4 py-3 whitespace-nowrap">{formatTime(entry.occurredAt)}<p className="text-xs text-zinc-600">{entry.actorName}</p></td>
                    <td className="px-4 py-3"><span className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-black ${KIND_TONE[entry.kind]}`}>{WALLET_ENTRY_LABELS[entry.kind]}</span></td>
                    <td className="px-4 py-3">
                      <p className="font-extrabold">{entry.title || "—"}</p>
                      {entry.txid ? <p className="break-all text-xs text-zinc-600">TXID {entry.txid}</p> : null}
                      {entry.note ? <p className="text-xs text-zinc-600">{entry.note}</p> : null}
                      <SheetDetails entry={entry} />
                    </td>
                    <td className="px-4 py-3">
                      {entry.legs.map((leg, index) => (
                        <p key={index} className="whitespace-nowrap">
                          <span className="text-zinc-600">{leg.walletName}</span>{" "}
                          <b className={String(leg.amount).startsWith("-") ? "text-red-700" : "text-emerald-700"}>{signed(leg.amount)} {leg.currency}</b>
                          {leg.fee !== "0" ? <span className="text-xs text-zinc-600"> (fee {formatAmount(leg.fee)})</span> : null}
                        </p>
                      ))}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {entry.legs.map((leg, index) => <p key={index} className="whitespace-nowrap font-extrabold">{formatAmount(leg.balanceAfter)} {leg.currency}</p>)}
                    </td>
                    <td className="px-4 py-3">
                      {entry.status === "awaiting_approval" ? (
                        <div className="flex flex-col items-start gap-1">
                          <span className="whitespace-nowrap rounded-full bg-cyan-100 px-3 py-1 text-xs font-black text-cyan-800">{WALLET_REVIEW_LABELS.awaiting_approval} · ยังไม่นับในยอด</span>
                          {canEdit ? (
                            <span className="flex gap-1">
                              <button type="button" disabled={busy === entry.id} onClick={() => review(entry, "approve")} className="rounded-full bg-emerald-700 px-2.5 py-1 text-xs font-black text-white hover:bg-emerald-800 disabled:opacity-50">อนุมัติ</button>
                              <button type="button" disabled={busy === entry.id} onClick={() => review(entry, "reject")} className="rounded-full border border-red-300 bg-white px-2.5 py-1 text-xs font-black text-red-700 hover:bg-red-50 disabled:opacity-50">ไม่อนุมัติ</button>
                            </span>
                          ) : null}
                        </div>
                      ) : entry.status === "rejected" ? (
                        <span className="whitespace-nowrap rounded-full bg-zinc-200 px-3 py-1 text-xs font-black text-zinc-600" title={entry.reviewNote}>{WALLET_REVIEW_LABELS.rejected} · {entry.reviewedBy}</span>
                      ) : entry.kind === "adjust" && entry.reviewedBy ? (
                        <span className="whitespace-nowrap text-xs font-bold text-emerald-700">อนุมัติโดย {entry.reviewedBy}</span>
                      ) : status ? (
                        entry.orderId ? (
                          <Link href={`/stock/purchase-orders?open=${entry.orderId}`} title="เปิดใบสั่งซื้อ ดูว่าของอยู่ขั้นไหน" className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-black ${status.done ? "bg-emerald-50 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>{status.label} →</Link>
                        ) : (
                          <button type="button" disabled={!canEdit || busy === entry.id} onClick={() => toggle(entry)} title={canEdit ? "กดเพื่อสลับ รอสินค้า / เรียบร้อย" : undefined}
                            className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-black ${status.done ? "bg-emerald-50 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>
                            {busy === entry.id ? <Loader2 size={12} className="inline animate-spin" /> : status.label}
                          </button>
                        )
                      ) : <span className="text-xs text-zinc-500">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-14 text-center text-sm text-zinc-600">
          {entries.length ? "ไม่มีรายการของกระเป๋านี้" : canEdit ? "ยังไม่มีรายการ — เริ่มจาก \"ปรับยอด\" ใส่ยอดตั้งต้นตามแอปของแต่ละกระเป๋า" : "ยังไม่มีรายการ"}
        </div>
      )}

      {dialog ? <WalletEntryDialog kind={dialog} wallets={wallets} onClose={() => setDialog(null)} /> : null}
    </div>
  );
}

function WalletSide({ id, label, wallets, walletId, currency, onChange, lockedWalletId }) {
  const wallet = wallets.find((item) => String(item.id) === walletId);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-2.5">
      <StockField label={label} htmlFor={`${id}-wallet`}>
        <select id={`${id}-wallet`} value={walletId} disabled={Boolean(lockedWalletId)} onChange={(event) => {
          const next = wallets.find((item) => String(item.id) === event.target.value);
          onChange({ walletId: event.target.value, currency: next?.currencies.includes(currency) ? currency : next?.currencies[0] || "" });
        }} className={stockInputClass}>
          {wallets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </StockField>
      <StockField label="สกุล" htmlFor={`${id}-currency`}>
        <select id={`${id}-currency`} value={currency} onChange={(event) => onChange({ walletId, currency: event.target.value })} className={stockInputClass}>
          {(wallet?.currencies || []).map((code) => <option key={code} value={code}>{code}</option>)}
        </select>
      </StockField>
    </div>
  );
}

function WalletEntryDialog({ kind, wallets, onClose }) {
  const router = useRouter();
  const byCode = Object.fromEntries(wallets.map((wallet) => [wallet.code, wallet]));
  // Defaults follow the flow: Russia → Bitazza → BITKUB → Bybit.
  const preset = {
    deposit: { to: byCode.bitazza },
    transfer: { from: byCode.bitkub, to: byCode.bybit },
    exchange: { from: byCode.bitkub, to: byCode.bitkub },
    payment: { from: byCode.bybit },
    adjust: { to: byCode.bybit },
  }[kind];
  const first = wallets[0];
  const sideOf = (wallet, fallbackCurrency) => {
    const chosen = wallet || first;
    return { walletId: String(chosen?.id || ""), currency: chosen?.currencies.includes(fallbackCurrency) ? fallbackCurrency : chosen?.currencies[0] || "" };
  };
  const [from, setFrom] = useState(sideOf(preset.from, "USDT"));
  const [to, setTo] = useState(sideOf(preset.to, kind === "exchange" ? "THB" : "USDT"));
  const [form, setForm] = useState({ amount: "", amountTo: "", fee: "", title: kind === "deposit" ? "Russia deposit" : "", txid: "", note: "", occurredAt: nowLocal(), status: "pending", channel: "", destinationAccount: "", seller: "", buyer: "", credit: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const look = KIND_LOOK[kind];
  const set = (patch) => setForm((current) => ({ ...current, ...patch }));
  const hasFrom = ["transfer", "exchange", "payment"].includes(kind);
  const hasTo = ["deposit", "transfer", "exchange", "adjust"].includes(kind);

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await apiJson("/api/stock/wallets/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          ...form,
          occurredAt: form.occurredAt ? new Date(form.occurredAt).toISOString() : undefined,
          fromWalletId: hasFrom ? Number(from.walletId) : undefined,
          fromCurrency: hasFrom ? from.currency : undefined,
          toWalletId: hasTo ? Number(kind === "exchange" ? from.walletId : to.walletId) : undefined,
          toCurrency: hasTo ? to.currency : undefined,
        }),
        fallbackError: "บันทึกรายการไม่สำเร็จ",
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
      <StockDialog title={WALLET_ENTRY_LABELS[kind]} subtitle={look.subtitle} icon={look.icon} iconClass={look.iconClass} onClose={onClose} wide
        footer={
          <>
            <button type="button" onClick={onClose} className="h-11 rounded-full border border-zinc-300 bg-white px-5 text-sm font-extrabold text-zinc-700">ยกเลิก</button>
            <button type="submit" disabled={saving} className="flex h-11 items-center gap-2 rounded-full bg-[#D90005] px-6 text-sm font-black text-white hover:bg-[#B00004] disabled:opacity-50">
              {saving ? <Loader2 size={16} className="animate-spin" /> : null} บันทึก{WALLET_ENTRY_LABELS[kind]}
            </button>
          </>
        }>
        <div className="grid gap-3 sm:grid-cols-2">
          {hasFrom ? <WalletSide id="from" label={kind === "exchange" ? "กระเป๋า · สกุลที่แลกออก" : "จ่ายออกจาก"} wallets={wallets} {...from} onChange={(side) => { setFrom(side); if (kind === "exchange") setTo((current) => ({ ...current, walletId: side.walletId })); }} /> : null}
          {hasTo ? <WalletSide id="to" label={kind === "exchange" ? "สกุลที่ได้" : kind === "adjust" ? "กระเป๋าที่ปรับ" : "รับเข้า"} wallets={wallets} {...(kind === "exchange" ? { ...to, walletId: from.walletId } : to)} lockedWalletId={kind === "exchange" ? from.walletId : null} onChange={setTo} /> : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <StockField label={kind === "adjust" ? "ยอดที่ปรับ (+/−)" : kind === "exchange" ? `ยอดที่แลกออก (${from.currency})` : "ยอด"} htmlFor="wallet-amount">
            <input id="wallet-amount" inputMode="decimal" value={form.amount} onChange={(event) => set({ amount: event.target.value })} className={stockInputClass} required />
          </StockField>
          {kind === "exchange" ? (
            <StockField label={`ยอดที่ได้ (${to.currency})`} htmlFor="wallet-amount-to">
              <input id="wallet-amount-to" inputMode="decimal" value={form.amountTo} onChange={(event) => set({ amountTo: event.target.value })} className={stockInputClass} required />
            </StockField>
          ) : null}
          {kind !== "adjust" ? (
            <StockField label="ค่า fee" htmlFor="wallet-fee" hint={kind === "deposit" ? "หักจากยอดที่เข้า" : "หักเพิ่มจากฝั่งที่จ่าย"}>
              <input id="wallet-fee" inputMode="decimal" value={form.fee} onChange={(event) => set({ fee: event.target.value })} className={stockInputClass} placeholder="0" />
            </StockField>
          ) : null}
          <StockField label="เวลาใบเสร็จ" htmlFor="wallet-time">
            <input id="wallet-time" type="datetime-local" value={form.occurredAt} onChange={(event) => set({ occurredAt: event.target.value })} className={stockInputClass} />
          </StockField>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <StockField label={kind === "payment" ? "ชื่อรายการสินค้า" : "ชื่อรายการ"} htmlFor="wallet-title">
            <input id="wallet-title" value={form.title} onChange={(event) => set({ title: event.target.value })} className={stockInputClass} required={kind === "payment"} placeholder={kind === "payment" ? "เช่น Razer Gold 100 USD" : "ไม่บังคับ"} />
          </StockField>
          <StockField label="TXID / เลขอ้างอิง" htmlFor="wallet-txid">
            <input id="wallet-txid" value={form.txid} onChange={(event) => set({ txid: event.target.value })} className={stockInputClass} placeholder="ไม่บังคับ" />
          </StockField>
        </div>
        <div className={`grid gap-3 ${kind === "payment" ? "sm:grid-cols-[minmax(0,1fr)_180px]" : ""}`}>
          <StockField label={kind === "adjust" ? "เหตุผล" : "หมายเหตุ"} htmlFor="wallet-note">
            <input id="wallet-note" value={form.note} onChange={(event) => set({ note: event.target.value })} className={stockInputClass} required={kind === "adjust"} placeholder={kind === "adjust" ? "เช่น ยอดตั้งต้นตามแอป 4 พ.ย." : "ไม่บังคับ"} />
          </StockField>
          {kind === "payment" ? (
            <StockField label="สถานะ" htmlFor="wallet-status">
              <select id="wallet-status" value={form.status} onChange={(event) => set({ status: event.target.value })} className={stockInputClass}>
                <option value="pending">{WALLET_PAYMENT_STATUS_LABELS.pending}</option>
                <option value="done">{WALLET_PAYMENT_STATUS_LABELS.done}</option>
              </select>
            </StockField>
          ) : null}
        </div>
        {kind !== "adjust" ? (
          <details className="rounded-xl border border-zinc-200 px-3.5 py-2.5" open={SHEET_FIELDS.some(([key]) => form[key])}>
            <summary className="cursor-pointer text-sm font-extrabold text-zinc-700">รายละเอียดตามชีต (ไม่บังคับ)</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {SHEET_FIELDS.map(([key, label, placeholder]) => (
                <StockField key={key} label={label} htmlFor={`wallet-${key}`}>
                  <input id={`wallet-${key}`} inputMode={key === "credit" ? "decimal" : undefined} value={form[key]} onChange={(event) => set({ [key]: event.target.value })} className={stockInputClass} placeholder={placeholder} />
                </StockField>
              ))}
            </div>
          </details>
        ) : null}
        {error ? <p className="rounded-xl bg-red-50 px-3.5 py-3 text-[13px] text-red-800">{error}</p> : null}
      </StockDialog>
    </form>
  );
}
