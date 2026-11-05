"use client";

import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowDownToLine, ArrowRightLeft, ChevronDown, ExternalLink, FileSpreadsheet, Link2, Loader2, Repeat, Search, ShoppingCart, SlidersHorizontal, Wallet } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { bestWalletPaymentMatch, LINK_DAYS, PO_STATUS_LABELS, walletPaymentCandidates } from "@/lib/stock-purchase-orders";
import { fromWalletUnits, toWalletUnits, WALLET_CHECK_LABELS, WALLET_ENTRY_LABELS, WALLET_GROUPS, WALLET_PAYMENT_STATUS_LABELS, WALLET_REVIEW_LABELS, walletCheckState } from "@/lib/stock-wallets";
import { StockDialog, StockField, stockInputClass } from "@/components/stock-ui";
import StockAttachments from "@/components/stock-attachments";

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

const MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const monthLabel = (period) => `${MONTHS[Number(period.slice(5, 7)) - 1]} ${period.slice(0, 4)}`;
const CHECK_TONE = {
  ok: "bg-emerald-50 text-emerald-800",
  checked: "bg-emerald-600 text-white",
  diff: "bg-red-50 text-red-800",
  stale: "bg-amber-100 text-amber-900",
};
const isUrl = (value) => /^https?:\/\//i.test(String(value || ""));
const sheetHref = (sheet) => (sheet?.period && sheet?.tab
  ? `/stock/sheets?period=${sheet.period}&name=${encodeURIComponent(sheet.tab)}${sheet.rowNo ? `&row=${sheet.rowNo}` : ""}`
  : null);
const sinceDays = (at) => (at ? Math.floor((Date.now() - new Date(at).getTime()) / 86400000) : null);

function walletsHref(filters, change = {}) {
  const next = { ...filters, ...change };
  const params = new URLSearchParams();
  if (next.wallet) params.set("wallet", next.wallet);
  if (next.others && !next.wallet) params.set("others", "1");
  if (next.month) params.set("month", next.month);
  if (next.kind) params.set("kind", next.kind);
  if (next.q) params.set("q", next.q);
  if (next.issues) params.set("issues", "1");
  if (next.entry) params.set("entry", String(next.entry));
  const text = params.toString();
  return text ? `/stock/wallets?${text}` : "/stock/wallets";
}

/** Per wallet: how many months are fine, signed off, or need a look. */
function checkSummary(checks, walletId) {
  const mine = checks.filter((check) => check.walletId === walletId);
  const states = mine.map(walletCheckState);
  return { total: mine.length, todo: states.filter((state) => state === "diff" || state === "stale").length, signed: states.filter((state) => state === "checked").length };
}

// Who runs the wallet, by its name: the provider's own icon (by domain), else
// its initials on the brand colour. Custom wallets match by name too.
const WALLET_BRANDS = [
  [/bitazza/i, "bitazza.com", "BZ", "bg-[#1B2B5B] text-white"],
  [/bitkub/i, "bitkub.com", "BK", "bg-[#00C373] text-white"],
  [/bybit/i, "bybit.com", "BY", "bg-[#17181E] text-[#F7A600]"],
  [/binance/i, "binance.com", "BN", "bg-[#F0B90B] text-zinc-900"],
  [/okx/i, "okx.com", "OK", "bg-black text-white"],
  [/tnt/i, "smart.com.ph", "TNT", "bg-[#F5A800] text-zinc-900"],
  [/zelle/i, "zellepay.com", "Z", "bg-[#6D1ED4] text-white"],
  [/amaten/i, "amaten.com", "AM", "bg-[#E60033] text-white"],
  [/plsbuy/i, "plsbuy.com", "PB", "bg-sky-600 text-white"],
  [/google/i, "google.com", "G", "bg-white text-zinc-800 border border-zinc-200"],
  [/(^|[^a-z])xl([^a-z]|$)/i, "xl.co.id", "XL", "bg-[#0A3D91] text-white"],
  [/kbank|kasikorn/i, "kasikornbank.com", "K+", "bg-[#138F2D] text-white"],
  [/(^|[^a-z])kkp([^a-z]|$)/i, "kkpfg.com", "KKP", "bg-[#594F9F] text-white"],
  [/apple/i, "apple.com", "A", "bg-zinc-900 text-white"],
];
const CURRENCY_TONE = { PHP: "bg-blue-700 text-white", IDR: "bg-red-600 text-white", JPY: "bg-rose-600 text-white", USD: "bg-emerald-700 text-white", MYR: "bg-indigo-700 text-white", UAH: "bg-yellow-400 text-blue-900" };

function walletBrand(wallet) {
  const hit = WALLET_BRANDS.find(([match]) => match.test(wallet.name || wallet.code || ""));
  if (hit) return { domain: hit[1], mark: hit[2], tone: hit[3] };
  const currency = wallet.currencies?.[0] || wallet.balances?.[0]?.currency || "";
  return { domain: null, mark: currency.slice(0, 3) || (wallet.name || "?").slice(0, 2).toUpperCase(), tone: CURRENCY_TONE[currency] || "bg-zinc-900 text-white" };
}

function WalletLogo({ wallet, size = 40 }) {
  const brand = walletBrand(wallet);
  const [broken, setBroken] = useState(false);
  const box = { width: size, height: size };
  if (brand.domain && !broken) {
    return (
      <span className="flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm" style={box}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`https://www.google.com/s2/favicons?domain=${brand.domain}&sz=128`} alt="" onError={() => setBroken(true)} onLoad={(event) => { if (event.currentTarget.naturalWidth <= 16) setBroken(true); }}
          className="object-contain" style={{ width: size * 0.7, height: size * 0.7 }} />
      </span>
    );
  }
  return (
    <span aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-xl font-black tracking-tight shadow-sm ${brand.tone}`} style={{ ...box, fontSize: Math.round(size * (brand.mark.length > 2 ? 0.3 : 0.36)) }}>
      {brand.mark || <Wallet size={18} />}
    </span>
  );
}

function WalletCard({ wallet, summary, filters, compact = false }) {
  const active = filters.wallet === wallet.code;
  const idle = sinceDays(wallet.lastActivity);
  return (
    <Link href={walletsHref(filters, { wallet: active ? "" : wallet.code })} aria-current={active ? "true" : undefined}
      className={`flex flex-col rounded-[18px] border bg-white px-[18px] py-4 transition hover:border-zinc-400 ${active ? "border-[#D90005] ring-2 ring-[#D90005]/30" : "border-zinc-200"}`}>
      <div className="flex items-center gap-3">
        <WalletLogo wallet={wallet} />
        <div className="min-w-0">
          <p className="truncate text-[17px] font-black">{wallet.name}</p>
          <p className="truncate text-[13px] text-zinc-600">{wallet.role}</p>
        </div>
      </div>
      <dl className="mt-3 flex flex-col gap-1.5">
        {wallet.balances.map((item) => (
          <div key={item.currency} className="flex items-baseline justify-between gap-3 border-t border-zinc-100 pt-1.5">
            <dt className="text-sm font-extrabold text-zinc-700">{item.currency}</dt>
            <dd className="text-right">
              <span className={`${compact ? "text-base" : "text-lg"} font-black ${String(item.balance).startsWith("-") ? "text-red-700" : ""}`}>{formatAmount(item.balance)}</span>
              {!compact && item.fees !== "0" ? <span className="block text-xs text-zinc-600">fee รวม {formatAmount(item.fees)}</span> : null}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-extrabold">
        {summary.total ? (
          summary.todo
            ? <span className="rounded-full bg-red-50 px-2 py-0.5 text-red-800">ต้องตรวจ {summary.todo} เดือน</span>
            : <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-800">ตรงกับชีตทุกเดือน{summary.signed ? ` · เซ็นแล้ว ${summary.signed}` : ""}</span>
        ) : null}
        {idle != null && idle > 30 ? <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-600">ไม่มีรายการมา {idle} วัน</span> : null}
      </div>
    </Link>
  );
}

function CheckPanel({ wallet, checks, canEdit }) {
  const router = useRouter();
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(null);
  const mine = checks.filter((check) => check.walletId === wallet.id);
  if (!mine.length) return null;
  async function sign(check) {
    const note = window.prompt(`ยืนยันว่าตรวจ ${wallet.name} ${check.currency} เดือน ${monthLabel(check.period)} กับชีตแล้ว\nหมายเหตุ (ไม่บังคับ)`, "");
    if (note === null) return;
    setBusy(`${check.period}-${check.currency}`);
    try {
      await apiJson("/api/stock/wallets/checks", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletId: wallet.id, period: check.period, currency: check.currency, note }), fallbackError: "บันทึกการตรวจไม่สำเร็จ" });
      router.refresh();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setBusy(null);
    }
  }
  const diff = (a, b) => (a == null || b == null ? null : fromWalletUnits(toWalletUnits(a) - toWalletUnits(b)));
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-4 py-3">
        <div>
          <h2 className="text-base font-black">ตรวจยอด {wallet.name} กับชีต</h2>
          <p className="text-xs text-zinc-600">ทุกเดือน: ยอดยกมาและยอดปิดเดือนในชีต เทียบกับที่ระบบคำนวณจากรายการ · แถวที่ยอดในชีตไม่ต่อจากแถวบนจะขึ้นให้กดดู</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-zinc-50 text-left text-xs font-extrabold text-zinc-600">
            <tr>
              <th className="px-3 py-2">เดือน</th><th className="px-3 py-2">สกุล</th>
              <th className="px-3 py-2 text-right">ยกมา · ชีต</th><th className="px-3 py-2 text-right">ยกมา · ระบบ</th>
              <th className="px-3 py-2 text-right">ปิดเดือน · ชีต</th><th className="px-3 py-2 text-right">ปิดเดือน · ระบบ</th>
              <th className="px-3 py-2 text-right">รายการ</th><th className="px-3 py-2">ผล</th><th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {mine.map((check) => {
              const state = walletCheckState(check);
              const id = `${check.period}-${check.currency}`;
              const openDiff = diff(check.sheetOpen, check.systemOpen);
              const closeDiff = diff(check.sheetClose, check.systemClose);
              return (
                <Fragment key={id}>
                  <tr className="border-t border-zinc-100 align-top">
                    <td className="whitespace-nowrap px-3 py-2 font-extrabold">{monthLabel(check.period)}</td>
                    <td className="px-3 py-2">{check.currency}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{check.sheetOpen == null ? "—" : formatAmount(check.sheetOpen)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${openDiff && openDiff !== "0" ? "font-black text-red-700" : ""}`}>
                      {check.systemOpen == null ? "ต้นปี" : formatAmount(check.systemOpen)}
                      {openDiff && openDiff !== "0" ? <span className="block text-[11px]">ต่าง {signed(openDiff)}</span> : null}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{check.sheetClose == null ? "—" : formatAmount(check.sheetClose)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${closeDiff && closeDiff !== "0" ? "font-black text-red-700" : ""}`}>
                      {check.systemClose == null ? "—" : formatAmount(check.systemClose)}
                      {closeDiff && closeDiff !== "0" ? <span className="block text-[11px]">ต่าง {signed(closeDiff)}</span> : null}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{check.rows}</td>
                    <td className="px-3 py-2">
                      <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-black ${CHECK_TONE[state]}`}>{WALLET_CHECK_LABELS[state]}</span>
                      {check.checkedAt ? <p className="mt-1 text-[11px] text-zinc-600">{check.checkedBy} · {formatTime(check.checkedAt)}{check.checkedNote ? ` · ${check.checkedNote}` : ""}</p> : null}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      <div className="flex justify-end gap-1.5">
                        {check.drifts.length ? (
                          <button type="button" onClick={() => setOpen(open === id ? null : id)} className="rounded-full border border-red-200 bg-white px-2.5 py-1 text-xs font-black text-red-700 hover:bg-red-50">
                            {open === id ? "ซ่อน" : `ดู ${check.drifts.length} แถว`}
                          </button>
                        ) : null}
                        <Link href={sheetHref({ period: check.period, tab: check.tab })} className="rounded-full border border-zinc-300 bg-white px-2.5 py-1 text-xs font-black text-zinc-700 hover:bg-zinc-50">ชีต</Link>
                        {canEdit && state !== "checked" ? (
                          <button type="button" disabled={busy === id} onClick={() => sign(check)} className="rounded-full bg-zinc-900 px-2.5 py-1 text-xs font-black text-white hover:bg-zinc-700 disabled:opacity-50">
                            {busy === id ? <Loader2 size={12} className="inline animate-spin" /> : "ตรวจแล้ว"}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                  {open === id ? (
                    <tr className="bg-red-50/40">
                      <td colSpan={9} className="px-3 py-2">
                        <p className="mb-1 text-xs font-bold text-red-900">แถวที่ยอดคงเหลือในชีตไม่เท่ากับยอดแถวบน + เข้า − ออก (ต่างไปเท่าไรจากแถวก่อนหน้า)</p>
                        <ul className="flex flex-col gap-1 text-[13px]">
                          {check.drifts.map((drift) => (
                            <li key={drift.rowNo} className="flex flex-wrap gap-x-3">
                              <Link href={sheetHref({ period: check.period, tab: check.tab, rowNo: drift.rowNo })} className="font-black text-[#B00004] hover:underline">แถว {drift.rowNo}</Link>
                              <span>{drift.desc || "—"}</span>
                              <span>ชีต {formatAmount(drift.sheet)} · ระบบ {formatAmount(drift.system)}</span>
                              <b className="text-red-700">ต่าง {signed(drift.step)}</b>
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const entryHref = (id) => `/stock/wallets?entry=${id}`;
const plain = (value) => formatAmount(String(value).replace(/^-/, ""));

/** One entry another one leads to: the link to follow it there. */
function TrailItem({ item, currency }) {
  const other = item.kind === "transfer" ? item.legs.find((leg) => String(leg.amount).startsWith("-")) : null;
  const into = item.kind === "transfer" ? item.legs.find((leg) => !String(leg.amount).startsWith("-")) : null;
  const what = item.kind === "transfer" ? `${other?.walletName} → ${into?.walletName}`
    : item.kind === "adjust" ? "ยอดยกมา / ปรับยอด" : item.title || WALLET_ENTRY_LABELS[item.kind];
  return (
    <li>
      <Link href={entryHref(item.entryId)} className="flex flex-wrap items-baseline gap-x-2 rounded-lg px-2 py-1 hover:bg-white hover:ring-1 hover:ring-zinc-200">
        <span className="text-xs text-zinc-500">{formatTime(item.occurredAt)}</span>
        <span className={`rounded-full px-2 text-[11px] font-black ${KIND_TONE[item.kind]}`}>{WALLET_ENTRY_LABELS[item.kind]}</span>
        <b className="text-zinc-900">{what}</b>
        <span className="text-xs text-zinc-600">ส่วนนี้ {plain(item.portion)} {currency}</span>
        <span className="text-xs font-black text-[#B00004]">ตามต่อ →</span>
      </Link>
      {item.receivedSheet && sheetHref(item.receivedSheet) ? (
        <Link href={sheetHref(item.receivedSheet)} className="ml-2 text-xs font-bold text-zinc-600 hover:underline">ชีตปลายทาง {item.receivedSheet.tab} แถว {item.receivedSheet.rowNo}</Link>
      ) : null}
    </li>
  );
}

/** Where the money came from and where it went, first in, first out: each step is a link to follow. */
function MoneyTrail({ entry }) {
  const [trail, setTrail] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    apiJson(`/api/stock/wallets/entries/${entry.id}/trail`)
      .then((data) => { if (live) setTrail(data.trail); })
      .catch((err) => { if (live) setError(err instanceof Error ? err.message : "อ่านที่มาที่ไปไม่สำเร็จ"); });
    return () => { live = false; };
  }, [entry.id]);
  const toSheet = entry.kind !== "transfer" && entry.receivedSheet && sheetHref(entry.receivedSheet);
  if (error) return <p className="text-xs font-bold text-red-700 sm:col-span-2">{error}</p>;
  if (!trail) return <p className="flex items-center gap-1 text-xs text-zinc-500 sm:col-span-2"><Loader2 size={12} className="animate-spin" /> กำลังหาที่มาที่ไป…</p>;
  return (
    <div className="flex flex-col gap-2 border-t border-zinc-200 pt-2.5 sm:col-span-2">
      {trail.map((leg, index) => (
        <div key={index}>
          <p className="text-xs font-black text-zinc-700">
            {leg.direction === "from" ? `ที่มา: เงิน ${plain(leg.amount)} ${leg.currency} ที่ออกจาก ${leg.walletName} มาจาก` : `ที่ไป: ${plain(leg.amount)} ${leg.currency} ที่เข้า ${leg.walletName} ถูกใช้กับ`}
          </p>
          {leg.items.length ? (
            <ul className="mt-0.5 flex flex-col">{leg.items.map((item) => <TrailItem key={item.entryId} item={item} currency={leg.currency} />)}</ul>
          ) : (
            <p className="px-2 text-xs text-zinc-500">{leg.direction === "from" ? "ไม่พบเงินเข้าก่อนหน้านี้" : "ยังไม่ได้ใช้ (ยังอยู่ในกระเป๋า)"}</p>
          )}
        </div>
      ))}
      {entry.kind === "payment" ? (
        toSheet ? (
          <p className="text-xs font-black text-zinc-700">ที่ไป: <Link href={toSheet} className="text-[#B00004] hover:underline">ผู้ขายรับเงินไว้ที่ชีต {entry.receivedSheet.tab} แถว {entry.receivedSheet.rowNo} →</Link> <span className="font-normal text-zinc-500">(แถวถัดไปในชีตนั้นคือของที่ได้)</span></p>
        ) : <p className="text-xs text-zinc-500">ที่ไป: ไม่พบแถวรับเงินยอดนี้ในชีตผู้ขาย (เช่น Order (Miles)) ของเดือนที่มีในระบบ</p>
      ) : null}
      <p className="text-[11px] text-zinc-500">จับคู่แบบเข้าก่อนออกก่อน (FIFO) ในกระเป๋าและสกุลเดียวกัน</p>
    </div>
  );
}

/** Under the entry's name: links straight to where its money came from and the documents behind it. */
function EntryLinks({ entry, open, onTrail }) {
  const proofs = entry.details.filter((item) => isUrl(item.value));
  const link = "whitespace-nowrap font-bold text-[#B00004] hover:underline";
  const parts = [
    entry.kind !== "adjust" ? <button key="trail" type="button" onClick={onTrail} className={link}>{open ? "ซ่อนที่มา" : "ที่มาของเงิน →"}</button> : null,
    sheetHref(entry.sheet) ? <Link key="sheet" href={sheetHref(entry.sheet)} className={link}>เอกสาร: แถว {entry.sheet.rowNo} ชีต {entry.sheet.tab}</Link> : null,
    entry.receivedSheet && sheetHref(entry.receivedSheet)
      ? <Link key="received" href={sheetHref(entry.receivedSheet)} className={link}>{entry.kind === "transfer" ? "ฝั่งรับเข้า" : "ชีตผู้ขาย"}: แถว {entry.receivedSheet.rowNo} {entry.receivedSheet.tab}</Link>
      : null,
    entry.orderId ? <Link key="order" href={`/stock/purchase-orders?open=${entry.orderId}`} className={link}>ใบสั่งซื้อ</Link> : null,
    ...proofs.map((item, index) => <a key={`proof-${index}`} href={item.value} target="_blank" rel="noreferrer" className={link}>{item.label}</a>),
  ].filter(Boolean);
  if (!parts.length) return null;
  return (
    <p className="mt-0.5 flex flex-wrap gap-x-1.5 pl-5 text-xs">
      {parts.map((part, index) => <Fragment key={index}>{index ? <span className="text-zinc-300">·</span> : null}{part}</Fragment>)}
    </p>
  );
}

/** What the sheet row says, and what proves it. */
function EntryTrail({ entry, canEdit = false, currentUserId = null }) {
  const proofs = entry.details.filter((item) => isUrl(item.value));
  const facts = entry.details.filter((item) => !isUrl(item.value));
  const from = entry.legs.find((leg) => String(leg.amount).startsWith("-"));
  const to = entry.legs.find((leg) => !String(leg.amount).startsWith("-"));
  const where = entry.kind === "transfer" ? `${from?.walletName} → ${to?.walletName}`
    : entry.kind === "exchange" ? `${from?.currency} → ${to?.currency} ใน ${from?.walletName}`
    : entry.kind === "payment" ? `${from?.walletName} → ${entry.title || "ไม่ระบุ"}${entry.destinationAccount ? ` (${entry.destinationAccount})` : ""}`
    : entry.kind === "deposit" ? `${entry.title || "ไม่ระบุ"} → ${to?.walletName}` : null;
  return (
    <div className="grid gap-3 rounded-xl bg-zinc-50 px-4 py-3 text-[13px] sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-1">
        {where ? <p><span className="text-zinc-500">เส้นทาง</span> <b>{where}</b></p> : null}
        {facts.map((item, index) => <p key={index}><span className="text-zinc-500">{item.label}</span> <b className="break-all">{item.value}</b></p>)}
        {entry.txid ? <p><span className="text-zinc-500">TXID</span> <b className="break-all">{entry.txid}</b></p> : null}
        {entry.statusChangedBy ? <p className="text-zinc-600">เปลี่ยนสถานะล่าสุดโดย {entry.statusChangedBy} · {formatTime(entry.statusChangedAt)}</p> : null}
        {entry.reviewNote ? <p className="text-zinc-600">{entry.reviewNote}</p> : null}
      </div>
      <div className="flex flex-col items-start gap-1.5">
        {proofs.length ? proofs.map((item, index) => (
          <a key={index} href={item.value} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-black text-[#B00004] ring-1 ring-zinc-200 hover:bg-red-50">
            <ExternalLink size={12} /> {item.label}
          </a>
        )) : <p className="text-xs text-zinc-500">ไม่มีลิงก์รูปหลักฐานในชีต</p>}
        {sheetHref(entry.sheet) ? (
          <Link href={sheetHref(entry.sheet)} className="flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-black text-zinc-800 ring-1 ring-zinc-200 hover:bg-zinc-100">
            <FileSpreadsheet size={12} /> เปิดแถว {entry.sheet.rowNo} ในชีต {entry.sheet.tab}
          </Link>
        ) : null}
        {entry.kind === "transfer" && sheetHref(entry.receivedSheet) ? (
          <Link href={sheetHref(entry.receivedSheet)} className="flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-black text-zinc-800 ring-1 ring-zinc-200 hover:bg-zinc-100">
            <FileSpreadsheet size={12} /> ฝั่งรับเข้า: แถว {entry.receivedSheet.rowNo} ในชีต {entry.receivedSheet.tab}
          </Link>
        ) : null}
      </div>
      <MoneyTrail entry={entry} />
      <div className="sm:col-span-2"><StockAttachments kind="wallet_entry" ownerId={entry.id} canEdit={canEdit} currentUserId={currentUserId} /></div>
    </div>
  );
}

function PaymentStatus({ entry, canEdit, currentUserId, busy, act }) {
  const status = walletEntryStatus(entry);
  const request = entry.statusRequest;
  if (entry.orderId) {
    return <Link href={`/stock/purchase-orders?open=${entry.orderId}`} title="เปิดใบสั่งซื้อ ดูว่าของอยู่ขั้นไหน" className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-black ${status.done ? "bg-emerald-50 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>{status.label} →</Link>;
  }
  if (request) {
    const mine = Number(request.byId) === Number(currentUserId);
    return (
      <div className="flex flex-col items-start gap-1">
        <span className="whitespace-nowrap rounded-full bg-cyan-100 px-3 py-1 text-xs font-black text-cyan-900">ขอเปลี่ยนเป็น{WALLET_PAYMENT_STATUS_LABELS[request.to]} · รออีกคนยืนยัน</span>
        <span className="text-[11px] text-zinc-600">ขอโดย {request.by} · {request.reason}</span>
        {canEdit ? (
          mine ? (
            <button type="button" disabled={busy} onClick={() => act("decide", "cancel")} className="rounded-full border border-zinc-300 bg-white px-2.5 py-1 text-xs font-black text-zinc-700 hover:bg-zinc-50 disabled:opacity-50">ยกเลิกคำขอ</button>
          ) : (
            <span className="flex gap-1">
              <button type="button" disabled={busy} onClick={() => act("decide", "approve")} className="rounded-full bg-emerald-700 px-2.5 py-1 text-xs font-black text-white hover:bg-emerald-800 disabled:opacity-50">ยืนยันเปลี่ยน</button>
              <button type="button" disabled={busy} onClick={() => act("decide", "reject")} className="rounded-full border border-red-300 bg-white px-2.5 py-1 text-xs font-black text-red-700 hover:bg-red-50 disabled:opacity-50">ไม่ยืนยัน</button>
            </span>
          )
        ) : null}
      </div>
    );
  }
  return (
    <button type="button" disabled={!canEdit || busy} onClick={() => act("toggle")}
      title={canEdit ? (status.done ? "ขอเปลี่ยนกลับเป็นรอสินค้า (ต้องให้อีกคนยืนยัน)" : "กดเมื่อได้สินค้าแล้ว") : undefined}
      className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-black ${status.done ? "bg-emerald-50 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>
      {busy ? <Loader2 size={12} className="inline animate-spin" /> : status.label}
    </button>
  );
}

export default function StockWallets({ wallets, entries, checks = [], filters = {}, selected = null, waitingOrders = [], canEdit, currentUserId = null }) {
  const focused = filters.entry ? Number(filters.entry) : null;
  const router = useRouter();
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(null);
  const [linking, setLinking] = useState(null);
  // Rows the person toggled; the entry a trail link led to starts open (toggling it closes it).
  const [expanded, setExpanded] = useState(() => new Set());
  const main = wallets.filter((wallet) => wallet.group === "main");
  const others = wallets.filter((wallet) => wallet.group !== "main");
  const awaiting = entries.filter((entry) => entry.status === "awaiting_approval");
  const statusRequests = entries.filter((entry) => entry.statusRequest);
  const months = [...new Set(checks.map((check) => check.period))].sort().reverse();
  const toggleRow = (id) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

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

  // "toggle": waiting → done at once; done → a request for someone else to confirm.
  async function statusAction(entry, action, decision) {
    let body = null;
    let url = `/api/stock/wallets/entries/${entry.id}`;
    let method = "PATCH";
    if (action === "toggle") {
      const to = entry.status === "done" ? "pending" : "done";
      let reason = "";
      if (to === "pending") {
        reason = window.prompt("รายการนี้เรียบร้อยแล้ว — ขอเปลี่ยนกลับเป็น \"รอสินค้า\" ต้องให้อีกคนยืนยัน\nใส่เหตุผล:");
        if (!reason) return;
      }
      body = { status: to, reason };
    } else {
      url = `/api/stock/wallets/entries/${entry.id}/status`;
      method = "POST";
      body = { decision };
    }
    setBusy(entry.id);
    try {
      await apiJson(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), fallbackError: "เปลี่ยนสถานะไม่สำเร็จ" });
      router.refresh();
    } catch (err) {
      window.alert(err.message);
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
          <p className="mt-1.5 text-sm text-zinc-600">กดการ์ดกระเป๋าเพื่อดูรายการและตรวจยอดกับชีตทีละเดือน · ใต้ชื่อรายการมีลิงก์ที่มาของเงินและเอกสาร (แถวในชีต) ให้กดตามได้ · จ่ายค่าของเข้า stock ให้ทำจาก <Link href="/stock/purchase-orders" className="font-extrabold text-[#B00004] hover:underline">ใบสั่งซื้อ</Link></p>
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

      <div className="grid gap-3 lg:grid-cols-3">
        {main.map((wallet) => <WalletCard key={wallet.id} wallet={wallet} summary={checkSummary(checks, wallet.id)} filters={filters} />)}
      </div>

      {others.length ? (
        filters.others ? (
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-black">กระเป๋าอื่น ({others.length})</h2>
              <Link href={walletsHref(filters, { others: false, wallet: "" })} className="text-sm font-extrabold text-[#B00004] hover:underline">ซ่อนกระเป๋าอื่น</Link>
            </div>
            {WALLET_GROUPS.filter((group) => group.code !== "main").map((group) => {
              const list = others.filter((wallet) => wallet.group === group.code);
              if (!list.length) return null;
              return (
                <div key={group.code} className="flex flex-col gap-2">
                  <p className="text-xs font-extrabold text-zinc-600">{group.label} · <span className="font-bold text-zinc-500">{group.hint}</span></p>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {list.map((wallet) => <WalletCard key={wallet.id} wallet={wallet} summary={checkSummary(checks, wallet.id)} filters={filters} compact />)}
                  </div>
                </div>
              );
            })}
          </section>
        ) : (
          <Link href={walletsHref(filters, { others: true })} className="w-fit rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-extrabold text-zinc-700 hover:bg-zinc-50">
            แสดงกระเป๋าอื่น ({others.length}) · เติมเงินต่างประเทศ, คริปโตบัญชีอื่น, JPY/MYR/UAH
          </Link>
        )
      ) : null}

      {awaiting.length ? (
        <p className="rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-900">
          มีการปรับยอดเก่า <b>{awaiting.length}</b> รายการที่ยังค้างรออนุมัติ — กดอนุมัติหรือไม่อนุมัติให้จบ (ปรับยอดใหม่มีผลทันที ไม่ต้องรออนุมัติแล้ว)
        </p>
      ) : null}
      {statusRequests.length ? (
        <p className="rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-900">
          มีคำขอเปลี่ยนสถานะรายการที่เรียบร้อยแล้ว <b>{statusRequests.length}</b> รายการ รออีกคนกดยืนยัน
        </p>
      ) : null}

      {selected ? <CheckPanel wallet={selected} checks={checks} canEdit={canEdit} /> : null}

      <form action="/stock/wallets" className="flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2.5">
        {filters.wallet ? <input type="hidden" name="wallet" value={filters.wallet} /> : null}
        {filters.others && !filters.wallet ? <input type="hidden" name="others" value="1" /> : null}
        <span className="text-sm font-extrabold text-zinc-700">{selected ? selected.name : filters.others ? "ทุกกระเป๋า" : "3 กระเป๋าหลัก"}</span>
        {selected ? <Link href={walletsHref(filters, { wallet: "" })} className="text-xs font-bold text-[#B00004] hover:underline">(ดูทั้งหมด)</Link> : null}
        <select name="month" defaultValue={filters.month} className="h-9 rounded-xl border border-zinc-300 bg-white px-2 text-sm">
          <option value="">ทุกเดือน</option>
          {months.map((period) => <option key={period} value={period}>{monthLabel(period)}</option>)}
        </select>
        <select name="kind" defaultValue={filters.kind} className="h-9 rounded-xl border border-zinc-300 bg-white px-2 text-sm">
          <option value="">ทุกประเภท</option>
          {Object.entries(WALLET_ENTRY_LABELS).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}
        </select>
        <label className="flex h-9 flex-1 items-center gap-2 rounded-xl border border-zinc-300 px-2.5">
          <Search size={14} className="text-zinc-400" aria-hidden="true" />
          <input name="q" defaultValue={filters.q} placeholder="ค้นชื่อรายการ ปลายทาง Order เบอร์" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
        </label>
        <label className="flex items-center gap-1.5 text-sm font-bold text-zinc-700">
          <input type="checkbox" name="issues" value="1" defaultChecked={filters.issues} /> เฉพาะที่ต้องตรวจ
        </label>
        <button className="h-9 rounded-xl bg-[#D90005] px-4 text-sm font-extrabold text-white hover:bg-[#B00004]">กรอง</button>
      </form>
      {focused ? (
        <p className="-mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
          ดูรายการเดียวตามที่มาที่ไป · กด &quot;ตามต่อ&quot; เพื่อไปขั้นถัดไป
          <button type="button" onClick={() => router.back()} className="font-extrabold text-[#B00004] hover:underline">← ย้อนกลับ</button>
          <Link href={walletsHref({ ...filters, entry: "" })} className="font-extrabold text-[#B00004] hover:underline">ดูรายการทั้งหมด</Link>
        </p>
      ) : null}
      <p className="-mt-3 text-xs text-zinc-500">แสดง {entries.length >= 400 ? "400 รายการล่าสุด — เลือกเดือนเพื่อดูครบ" : `${entries.length} รายการ`}</p>

      {entries.length ? (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="bg-zinc-50 text-left text-xs font-extrabold text-zinc-600">
              <tr>
                <th className="px-4 py-3">เวลาใบเสร็จ</th>
                <th className="px-4 py-3">ประเภท</th>
                <th className="px-4 py-3">ชื่อรายการ / ปลายทาง</th>
                <th className="px-4 py-3">กระเป๋า · ยอด · fee</th>
                <th className="px-4 py-3 text-right">ยอดคงเหลือ</th>
                <th className="px-4 py-3">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const candidates = canEdit ? walletPaymentCandidates(entry, waitingOrders) : [];
                const best = bestWalletPaymentMatch(candidates);
                const open = expanded.has(entry.id) !== (entry.id === focused);
                return (
                  <Fragment key={entry.id}>
                    <tr className={`border-t border-zinc-100 align-top ${open ? "bg-zinc-50/60" : ""}`}>
                      <td className="whitespace-nowrap px-4 py-3">{formatTime(entry.occurredAt)}<p className="text-xs text-zinc-600">{entry.actorName}</p></td>
                      <td className="px-4 py-3"><span className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-black ${KIND_TONE[entry.kind]}`}>{WALLET_ENTRY_LABELS[entry.kind]}</span></td>
                      <td className="min-w-[300px] px-4 py-3">
                        <button type="button" onClick={() => toggleRow(entry.id)} aria-expanded={open} className="flex items-start gap-1 text-left">
                          <ChevronDown size={15} className={`mt-0.5 shrink-0 text-zinc-500 transition ${open ? "rotate-180" : ""}`} aria-hidden="true" />
                          <span>
                            <span className="font-extrabold">{entry.title || (entry.kind === "adjust" ? "ปรับยอด" : "—")}</span>
                            {entry.note ? <span className="block text-xs text-zinc-600">{entry.note}</span> : null}
                          </span>
                        </button>
                        <EntryLinks entry={entry} open={open} onTrail={() => toggleRow(entry.id)} />
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
                        {entry.sheetRemovedAt ? (
                          <span className="mb-1.5 inline-block whitespace-nowrap rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-900"
                            title="แถวนี้ไม่มีในชีตแล้ว แต่มีคนผูกใบสั่งซื้อหรือเปลี่ยนสถานะไว้ จึงเก็บไว้ให้ตรวจ">หายจากชีต · ไม่นับในยอด</span>
                        ) : null}
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
                        ) : entry.kind === "payment" ? (
                          <PaymentStatus entry={entry} canEdit={canEdit} currentUserId={currentUserId} busy={busy === entry.id} act={(action, decision) => statusAction(entry, action, decision)} />
                        ) : <span className="text-xs text-zinc-500">—</span>}
                        {!entry.orderId && candidates.length ? (
                          <button type="button" onClick={() => setLinking(entry)}
                            className={`mt-1.5 flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-black ${best ? "bg-zinc-900 text-white hover:bg-zinc-700" : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"}`}>
                            <Link2 size={12} /> {best ? `ผูกกับ ${best.code}?` : `ผูกใบสั่งซื้อ (${candidates.length})`}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                    {open ? (
                      <tr className="bg-zinc-50/60">
                        <td colSpan={6} className="px-4 pb-3"><EntryTrail entry={entry} canEdit={canEdit} currentUserId={currentUserId} /></td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-14 text-center text-sm text-zinc-600">
          {filters.month || filters.kind || filters.q || filters.issues ? "ไม่มีรายการตามที่กรอง" : canEdit ? "ยังไม่มีรายการ — เริ่มจาก \"ปรับยอด\" ใส่ยอดตั้งต้นตามแอปของแต่ละกระเป๋า" : "ยังไม่มีรายการ"}
        </div>
      )}

      {dialog ? <WalletEntryDialog kind={dialog} wallets={wallets} onClose={() => setDialog(null)} /> : null}
      {linking ? <LinkPaymentDialog entry={linking} candidates={walletPaymentCandidates(linking, waitingOrders)} onClose={() => setLinking(null)} /> : null}
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

const LINK_REASONS = [
  { key: "amountMatch", yes: "ยอดตรง", no: null },
  { key: "nameMatch", yes: "ชื่อซัพ / เกม / ไอดีตรง", no: null },
  { key: "dateMatch", yes: `ห่างกันไม่เกิน ${LINK_DAYS} วัน`, no: null },
];

/** Picks the order a wallet payment paid for; the best match is chosen first, a person confirms. */
function LinkPaymentDialog({ entry, candidates, onClose }) {
  const router = useRouter();
  const best = bestWalletPaymentMatch(candidates);
  const [orderId, setOrderId] = useState(best ? String(best.orderId) : "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const chosen = candidates.find((candidate) => String(candidate.orderId) === orderId);
  const leg = entry.legs[0];

  async function submit() {
    if (!chosen) return;
    setSaving(true);
    setError("");
    try {
      await apiJson(`/api/stock/wallets/entries/${entry.id}/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: chosen.orderId }),
        fallbackError: "ผูกรายการจ่ายกับใบสั่งซื้อไม่สำเร็จ",
      });
      onClose();
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <StockDialog title="ผูกรายการจ่ายกับใบสั่งซื้อ" subtitle={`${entry.title} · ${leg?.walletName} ${leg?.amount} ${leg?.currency}`} icon={<Link2 size={18} strokeWidth={2.4} />} iconClass="bg-zinc-100 text-zinc-800" onClose={onClose}
      footer={(
        <>
          <button type="button" onClick={onClose} className="h-10 rounded-full border border-zinc-300 px-4 text-sm font-extrabold text-zinc-700 hover:bg-zinc-50">ยกเลิก</button>
          <button type="button" disabled={!chosen || saving} onClick={submit} className="flex h-10 items-center gap-1.5 rounded-full bg-zinc-900 px-4 text-sm font-extrabold text-white hover:bg-zinc-700 disabled:opacity-50">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />} {chosen ? `ผูกกับ ${chosen.code}` : "เลือกใบสั่งซื้อ"}
          </button>
        </>
      )}>
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-[13px] text-zinc-700">
          ใบสั่งซื้อจะขึ้นเป็น &quot;โอนแล้ว รอซัพตอบ&quot; โดยใช้รายการนี้เป็นการจ่าย <b>ไม่หักเงินกระเป๋าซ้ำ</b> · แสดงเฉพาะใบที่ &quot;รอโอนเงิน&quot; สกุล {leg?.currency} และยอดตรงกับที่จ่าย
        </p>
        <div className="flex flex-col gap-2">
          {candidates.map((candidate) => (
            <label key={candidate.orderId} className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-2.5 ${String(candidate.orderId) === orderId ? "border-zinc-900 bg-zinc-50" : "border-zinc-200 hover:bg-zinc-50"}`}>
              <input type="radio" name="link-order" value={candidate.orderId} checked={String(candidate.orderId) === orderId} onChange={(event) => setOrderId(event.target.value)} className="mt-1" />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <b>{candidate.code}</b>
                  <span>{candidate.supplier} · {candidate.accountCode}</span>
                  <span className="ml-auto font-extrabold">{candidate.amount} {candidate.currency}</span>
                </span>
                <span className="mt-1 flex flex-wrap gap-1">
                  {LINK_REASONS.map((reason) => {
                    const label = candidate[reason.key] ? reason.yes : reason.no;
                    if (!label) return null;
                    return <span key={reason.key} className={`rounded-full px-2 py-0.5 text-xs font-bold ${candidate[reason.key] ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{label}</span>;
                  })}
                  {candidate.sure && best?.orderId === candidate.orderId ? <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-xs font-bold text-white">น่าจะใช่</span> : null}
                </span>
              </span>
            </label>
          ))}
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-3.5 py-2.5 text-[13px] font-bold text-red-700">{error}</p> : null}
      </div>
    </StockDialog>
  );
}
