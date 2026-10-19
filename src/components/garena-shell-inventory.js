"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Download, RefreshCw, Search } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { topupInventoryPath } from "@/lib/topup-inventory";
import { codaQuickDates } from "@/lib/usdcodashop-overview";
import { SHELL_ACCOUNTS, SHELL_COST_PER_UNIT, shellAccount } from "@/lib/garena-shell-inventory";

const endpoint = "/api/projectm/garena-shell";
const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-ll-hairline-strong bg-ll-surface-1 px-4 text-sm text-ll-ink hover:bg-ll-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ll-primary disabled:opacity-50";
const input = "min-h-11 w-full min-w-0 rounded-lg border border-ll-hairline-strong bg-ll-surface-1 px-3 text-sm text-ll-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ll-primary";
const money = (value) => value == null ? "—" : Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const when = (value) => value ? new Date(value).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" }) : "—";

function AccountCard({ card, active, onSelect }) {
  return <article className={`min-w-0 rounded-xl border bg-ll-surface-1 p-5 ${active ? "border-ll-primary" : "border-ll-hairline"}`}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h2 className="break-words text-lg font-semibold">{card.name}</h2><p className="mt-1 text-sm text-ll-ink-subtle">ผู้ดูแล: {card.owner} · BOT</p></div><button type="button" className={button} aria-pressed={active} onClick={onSelect}>{active ? "แสดงทุกบัญชี" : "ดูออเดอร์บัญชีนี้"}</button></div>
    <div className="mt-5"><p className="text-sm text-ll-ink-subtle">คงเหลือล่าสุดจากบอท (Shell)</p><p className="mt-1 text-3xl font-semibold tabular-nums">{money(card.balance)}</p><p className="mt-2 break-words text-xs text-ll-ink-subtle">บอทบันทึก ณ {when(card.balanceAt)}{card.balanceOrderId && ` · ${card.balanceOrderId}`}</p></div>
    <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-ll-hairline pt-4 text-sm">
      <div><dt className="text-ll-ink-subtle">Shell ออกในช่วงวันที่</dt><dd className="mt-1 tabular-nums">{money(card.used)}</dd></div>
      <div><dt className="text-ll-ink-subtle">ออเดอร์ในช่วงวันที่</dt><dd className="mt-1 tabular-nums">{card.orders}</dd></div>
    </dl>
    <details className="mt-4 border-t border-ll-hairline pt-3 text-sm"><summary className="min-h-11 cursor-pointer py-3 text-ll-ink-subtle focus-visible:outline-2 focus-visible:outline-ll-primary">ยอดอ้างอิงจากชีท (ไม่ใช่ยอดบอท)</summary>
      <dl className="grid grid-cols-3 gap-2 py-2 text-xs"><div><dt className="text-ll-ink-subtle">ปัจจุบัน</dt><dd className="mt-1 tabular-nums">{money(card.reference.current)}</dd></div><div><dt className="text-ll-ink-subtle">ใช้ไป</dt><dd className="mt-1 tabular-nums">{money(card.reference.used)}</dd></div><div><dt className="text-ll-ink-subtle">คงเหลือ</dt><dd className="mt-1 tabular-nums">{money(card.reference.remaining)}</dd></div></dl>
      <p className="mt-2 text-xs text-ll-ink-subtle">สถานะอ้างอิง: {card.reference.status} · ตัวเลขที่แจ้งไว้ ไม่ได้นำมาบวกหรือหักยอดบอท และยังไม่ได้ยืนยันวันตัดยอด</p>
    </details>
  </article>;
}

function OrdersTable({ entries }) {
  const headings = ["วันที่ (ไทย)", "Order / รายการ", "บัญชี", "เกม / แพ็ก", "ยอดโอน (THB)", "ต้นทุน (THB)", "กำไร (THB / %)", "Shell ออก", "Shell คงเหลือ (บอท)"];
  return <div className="max-h-[70vh] overflow-auto rounded-xl border border-ll-hairline bg-ll-surface-1" tabIndex={0} role="region" aria-label="ตารางออเดอร์ Garena Shell">
    <table className="w-full min-w-[1250px] text-left text-sm"><caption className="sr-only">รายการสำเร็จของสองบัญชี Garena Shell ตามตัวกรอง</caption>
      <thead className="sticky top-0 z-10 bg-ll-surface-2"><tr>{headings.map((heading, i) => <th key={heading} scope="col" className={`whitespace-nowrap px-3 py-3 font-semibold ${i >= 4 ? "text-right" : ""}`}>{heading}</th>)}</tr></thead>
      <tbody>{entries.map((entry) => <tr key={entry.id} className="border-t border-ll-hairline align-top hover:bg-ll-surface-2">
        <td className="whitespace-nowrap px-3 py-3">{when(entry.occurredAt)}</td>
        <td className="max-w-64 break-words px-3 py-3"><p className="font-medium">{entry.orderId}</p><p className="mt-1 text-xs text-ll-ink-subtle">{entry.details.sheetOperator || entry.details.operator}</p><details className="mt-2"><summary className="cursor-pointer py-2 text-xs text-ll-ink-subtle focus-visible:outline-2 focus-visible:outline-ll-primary">รายละเอียด</summary><dl className="space-y-2 py-2 text-xs"><div><dt className="text-ll-ink-subtle">เลขธุรกรรม</dt><dd>{entry.details.invoice || "—"}</dd></div><div><dt className="text-ll-ink-subtle">ลูกค้า</dt><dd>{entry.details.customer || "—"}</dd></div><div><dt className="text-ll-ink-subtle">UID / บัญชีปลายทาง</dt><dd>{entry.details.playerId || "—"}</dd></div><div><dt className="text-ll-ink-subtle">หลักฐานยอดออก</dt><dd>{entry.usageSource === "balances" ? "ยอดก่อน − ยอดหลัง" : entry.usageSource === "shell_used" ? "shell_used จากบอท" : "ข้อมูลไม่ครบหรือขัดแย้ง ต้องตรวจสอบ"}</dd></div></dl></details></td>
        <td className="max-w-44 break-words px-3 py-3">{shellAccount(entry.account)?.name}</td>
        <td className="max-w-52 break-words px-3 py-3"><p>{entry.details.game}</p><p className="mt-1 text-xs text-ll-ink-subtle">{entry.details.pack}</p>{entry.fillCount > 1 && <details className="mt-2"><summary className="min-h-11 cursor-pointer py-2 text-xs text-ll-ink-subtle focus-visible:outline-2 focus-visible:outline-ll-primary">รวม {entry.fillCount} รายการย่อย</summary><ul className="space-y-2 text-xs">{entry.fills.map((fill) => <li key={fill.id} className="border-t border-ll-hairline py-2"><p>{fill.details.pack}</p><p className="mt-1 tabular-nums">Shell ออก {money(fill.used)} · คงเหลือ {money(fill.balance)}</p><p className="mt-1 break-words text-ll-ink-subtle">คิวบอท {fill.id} · {when(fill.observedAt || fill.occurredAt)}</p></li>)}</ul></details>}</td>
        <td className="px-3 py-3 text-right tabular-nums">{money(entry.figures.sale)}{entry.fillCount > 1 && <p className="mt-1 text-xs text-ll-ink-subtle">ยอดรวม ไม่คิดซ้ำต่อรายการย่อย</p>}{entry.details.salePacks > (entry.fillCount || 1) && <p className="mt-1 text-xs text-ll-ink-subtle">เฉพาะส่วนในบัญชี/ช่วงนี้ จากยอดเต็ม {money(entry.details.saleTotalThb)}</p>}{entry.figures.sale == null && entry.details.saleNative != null && <p className="mt-1 text-xs text-ll-ink-subtle">{entry.details.saleNative} {entry.details.saleCurrency} · รอยอด THB</p>}</td>
        <td className="px-3 py-3 text-right tabular-nums">{money(entry.figures.cost)}</td>
        <td className="px-3 py-3 text-right tabular-nums">{money(entry.figures.profit)}<p className="mt-1 text-xs text-ll-ink-subtle">{entry.figures.margin == null ? "—" : `${entry.figures.margin}%`}</p></td>
        <td className="px-3 py-3 text-right tabular-nums">{money(entry.used)}{entry.fillCount > 1 && <p className="mt-1 text-xs text-ll-ink-subtle">{entry.details.shellBreakdown}</p>}</td>
        <td className="px-3 py-3 text-right font-semibold tabular-nums">{money(entry.balance)}</td>
      </tr>)}</tbody>
    </table>
    {!entries.length && <p className="p-6 text-center text-sm text-ll-ink-subtle">ไม่พบรายการในช่วงวันที่หรือตัวกรองนี้</p>}
  </div>;
}

export default function GarenaShellInventory({ lang }) {
  const [dates, setDates] = useState(() => codaQuickDates("month"));
  const [draft, setDraft] = useState(dates);
  const [account, setAccount] = useState("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const alive = useRef(false), generation = useRef(0);
  const viewKey = new URLSearchParams({ ...dates, account, search, page: String(page) }).toString();
  const load = useCallback(async () => {
    const version = ++generation.current;
    setLoading(true); setError("");
    try {
      const result = await apiJson(`${endpoint}?${viewKey}`, { cache: "no-store" });
      if (!Array.isArray(result?.cards) || result.cards.length !== 2 || !Array.isArray(result.entries) || !result.summary) throw new Error("ข้อมูลไม่ครบ กรุณาโหลดใหม่");
      if (alive.current && generation.current === version) setData({ ...result, viewKey });
    } catch (e) { if (alive.current && generation.current === version) setError(e.message || "โหลดข้อมูลไม่สำเร็จ"); }
    finally { if (alive.current && generation.current === version) setLoading(false); }
  }, [viewKey]);
  const invalidate = useCallback(() => { generation.current++; }, []);
  useEffect(() => {
    alive.current = true;
    const timer = setTimeout(load, 0);
    return () => { alive.current = false; invalidate(); clearTimeout(timer); };
  }, [load, invalidate]);
  function apply(next) {
    const nextKey = new URLSearchParams({ ...next, account, search: query, page: "1" }).toString();
    invalidate(); setError(""); setDates(next); setDraft(next); setSearch(query); setPage(1);
    if (nextKey === viewKey) void load();
  }
  function selectAccount(value) { invalidate(); setError(""); setAccount(value); setPage(1); }
  const ready = data?.viewKey === viewKey && !error;
  return <main className="mx-auto flex min-h-screen min-w-0 max-w-7xl flex-col gap-6 px-4 pb-14 pt-10 text-ll-ink sm:px-6">
    <header className="flex flex-wrap items-center justify-between gap-4 pr-12"><div><p className="text-xs text-ll-ink-tertiary">TOPUP INVENTORY</p><h1 className="mt-2 text-3xl font-semibold">Garena Shell</h1><p className="mt-2 text-sm text-ll-ink-subtle">เฉพาะสองบัญชีที่กำหนด · ใช้ยอดที่บอทบันทึก ไม่เชื่อมการสั่งเติม</p></div><Link href={topupInventoryPath(lang)} className={button}><ArrowLeft size={16} aria-hidden />กลับ Topup Inventory</Link></header>
    <form onSubmit={(event) => { event.preventDefault(); apply(draft); }} aria-label="กรอง Garena Shell" className="space-y-4 rounded-xl border border-ll-hairline bg-ll-surface-1 p-4">
      <div className="flex flex-wrap gap-2">{[["today", "วันนี้"], ["yesterday", "เมื่อวาน"], ["month", "เดือนนี้"]].map(([preset, label]) => <button type="button" key={preset} className={button} onClick={() => apply(codaQuickDates(preset))}>{label}</button>)}</div>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className="space-y-2 text-sm"><span>วันที่เริ่มต้น</span><input type="date" required value={draft.dateFrom} max={draft.dateTo || undefined} onChange={(e) => setDraft({ ...draft, dateFrom: e.target.value })} className={input} /></label><label className="space-y-2 text-sm"><span>วันที่สิ้นสุด</span><input type="date" required value={draft.dateTo} min={draft.dateFrom || undefined} onChange={(e) => setDraft({ ...draft, dateTo: e.target.value })} className={input} /></label><label className="space-y-2 text-sm"><span>บัญชี Shell</span><select aria-label="บัญชี Shell" value={account} onChange={(e) => selectAccount(e.target.value)} className={input}><option value="">ทุกบัญชี</option>{SHELL_ACCOUNTS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="space-y-2 text-sm"><span>ค้นหา Order / เกม / ผู้เติม</span><input type="search" value={query} maxLength={200} onChange={(e) => setQuery(e.target.value)} className={input} /></label></div>
      <div className="flex flex-wrap gap-2"><button type="submit" className={button}><Search size={16} aria-hidden />ค้นหา</button><button type="button" onClick={load} disabled={loading} className={button}><RefreshCw size={16} aria-hidden />โหลดใหม่</button>{ready && !loading && <a className={button} href={`${endpoint}?${viewKey}&format=csv`} download><Download size={16} aria-hidden />Export CSV</a>}</div>
      <p className="text-xs text-ll-ink-subtle">เวลาไทย · เลือกได้ไม่เกิน 93 วัน · ต้นทุน = Shell ออกจริง × {SHELL_COST_PER_UNIT} บาท · กำไร % = กำไร ÷ ยอดโอน × 100</p>
    </form>
    {error && <p role="alert" className="rounded-xl border border-ll-hairline bg-ll-surface-1 p-4 text-sm">{error} · กดโหลดใหม่เพื่อลองอีกครั้ง</p>}
    {loading && <p role="status" className="text-sm text-ll-ink-subtle">กำลังโหลดข้อมูล…</p>}
    {ready && !loading && <>
      <section aria-label="สองบัญชี Garena Shell" className="grid min-w-0 gap-4 lg:grid-cols-2">{data.cards.map((card) => <AccountCard key={card.id} card={card} active={account === card.id} onSelect={() => selectAccount(account === card.id ? "" : card.id)} />)}</section>
      <p className="text-xs text-ll-ink-subtle">ยอดคงเหลือคือค่าที่บอทอ่านได้ล่าสุด ไม่ใช่ยอดตรวจสดจาก Garena และไม่เปลี่ยนตามช่วงวันที่ ส่วน Shell ออกบนการ์ดรวมเฉพาะช่วงวันที่ ไม่ตามคำค้น รายการที่ไม่มี username หรือใช้บัญชีอื่นจะไม่ถูกนำมารวม</p>
      <section aria-label="ผลการค้นหา" className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">ประวัติรายการสำเร็จ</h2><p className="text-sm text-ll-ink-subtle">{data.total.toLocaleString("en-US")} ออเดอร์{data.summary.fills != null && ` · ${data.summary.fills} รายการย่อย`}</p></div>
        <dl className="grid grid-cols-1 gap-3 rounded-xl border border-ll-hairline bg-ll-surface-1 p-4 text-sm sm:grid-cols-3">{[["ยอดโอนตามตัวกรอง (THB)", data.summary.sale], ["ต้นทุนตามตัวกรอง (THB)", data.summary.cost], ["กำไรตามตัวกรอง (THB)", data.summary.profit]].map(([label, value]) => <div key={label}><dt className="text-ll-ink-subtle">{label}</dt><dd className="mt-2 text-xl font-semibold tabular-nums">{money(value)}</dd></div>)}</dl>
        {(data.summary.missingSales > 0 || data.summary.missingCosts > 0) && <p role="status" className="text-sm text-ll-ink-subtle">ข้อมูลไม่ครบ: ยอดโอน {data.summary.missingSales} · ต้นทุน {data.summary.missingCosts} รายการ ยอดรวมที่คำนวณไม่ครบแสดง — ไม่แทนด้วยศูนย์</p>}
        <OrdersTable entries={data.entries} />
        <nav aria-label="เปลี่ยนหน้าประวัติ" className="flex flex-wrap items-center justify-end gap-3"><button type="button" className={button} disabled={page <= 1} onClick={() => { invalidate(); setPage(page - 1); }}>ก่อนหน้า</button><span className="text-sm">หน้า {page} / {Math.max(1, Math.ceil(data.total / data.pageSize))}</span><button type="button" className={button} disabled={page * data.pageSize >= data.total} onClick={() => { invalidate(); setPage(page + 1); }}>ถัดไป</button></nav>
      </section>
    </>}
  </main>;
}
