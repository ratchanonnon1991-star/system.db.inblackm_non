"use client";

import { createInventoryPageSession } from "@/lib/inventory-page-session";
import { TablePagination } from "@/components/table-pagination";
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, RefreshCw, Search } from "lucide-react";
import TopupInventoryPage from "@/components/topup-inventory-page";
import { tivButton as button, tivField, tivInput as input, tivPrimary, tivTable, tivTableBox } from "@/lib/topup-inventory-ui";
import { codaQuickDates } from "@/lib/usdcodashop-overview";
import { SHELL_ACCOUNTS, SHELL_COST_PER_UNIT, shellAccount } from "@/lib/garena-shell-inventory";

const endpoint = "/api/projectm/garena-shell";
const money = (value) => value == null ? "—" : Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const when = (value) => value ? new Date(value).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" }) : "—";

function AccountCard({ card, active, onSelect }) {
  return <article className={`tiv-kpi ${active ? "border-ll-primary!" : ""}`}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h2 className="break-words text-lg font-bold">{card.name}</h2><p className="mt-1!">ผู้ดูแล: {card.owner} · BOT</p></div><button type="button" className={`${button}${active ? " on" : ""}`} aria-pressed={active} onClick={onSelect}>{active ? "แสดงทุกบัญชี" : "ดูออเดอร์บัญชีนี้"}</button></div>
    <div className="mt-5"><small>คงเหลือล่าสุดจากบอท (Shell)</small><b className={card.balance == null ? "mut" : ""}>{money(card.balance)}</b><p className="break-words">บอทบันทึก ณ {when(card.balanceAt)}{card.balanceOrderId && ` · ${card.balanceOrderId}`}</p></div>
    <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-ll-hairline pt-4 text-sm">
      <div className="min-w-0"><dt>Shell ออกในช่วงวันที่</dt><dd className="mt-1! text-base! tabular-nums">{money(card.used)}</dd></div>
      <div className="min-w-0"><dt>ออเดอร์ในช่วงวันที่</dt><dd className="mt-1! text-base! tabular-nums">{card.orders}</dd></div>
    </dl>
    <details className="mt-4 border-t border-ll-hairline pt-3 text-sm"><summary className="min-h-11 cursor-pointer py-3 text-ll-ink-subtle">ยอดอ้างอิงจากชีท (ไม่ใช่ยอดบอท)</summary>
      <dl className="tiv-subbox mt-0! grid grid-cols-3 gap-2 text-xs"><div className="min-w-0"><dt>ปัจจุบัน</dt><dd className="mt-1! text-sm! tabular-nums">{money(card.reference.current)}</dd></div><div className="min-w-0"><dt>ใช้ไป</dt><dd className="mt-1! text-sm! tabular-nums">{money(card.reference.used)}</dd></div><div className="min-w-0"><dt>คงเหลือ</dt><dd className="mt-1! text-sm! tabular-nums">{money(card.reference.remaining)}</dd></div></dl>
      <p>สถานะอ้างอิง: {card.reference.status} · ตัวเลขที่แจ้งไว้ ไม่ได้นำมาบวกหรือหักยอดบอท และยังไม่ได้ยืนยันวันตัดยอด</p>
    </details>
  </article>;
}

function OrdersTable({ entries }) {
  const headings = ["วันที่ (ไทย)", "Order / รายการ", "บัญชี", "เกม / แพ็ก", "ยอดโอน (THB)", "ต้นทุน (THB)", "กำไร (THB / %)", "Shell ออก", "Shell คงเหลือ (บอท)"];
  return <div className={`${tivTableBox} max-h-[70vh] overflow-auto`} tabIndex={0} role="region" aria-label="ตารางออเดอร์ Garena Shell">
    <table className={`${tivTable} min-w-[1250px]`}><caption className="sr-only">รายการสำเร็จของสองบัญชี Garena Shell ตามตัวกรอง</caption>
      <thead className="sticky top-0 z-10 backdrop-blur"><tr>{headings.map((heading, i) => <th key={heading} scope="col" className={i >= 4 ? "r" : ""}>{heading}</th>)}</tr></thead>
      <tbody>{entries.map((entry) => <tr key={entry.id}>
        <td className="whitespace-nowrap">{when(entry.occurredAt)}</td>
        <td className="max-w-64 break-words"><span className="oid">{entry.orderId}</span><span className="sm">{entry.details.sheetOperator || entry.details.operator}</span><details className="mt-2"><summary>รายละเอียด</summary><dl className="tiv-subbox space-y-2"><div><dt className="text-ll-ink-subtle">เลขธุรกรรม</dt><dd>{entry.details.invoice || "—"}</dd></div><div><dt className="text-ll-ink-subtle">ลูกค้า</dt><dd>{entry.details.customer || "—"}</dd></div><div><dt className="text-ll-ink-subtle">UID / บัญชีปลายทาง</dt><dd>{entry.details.playerId || "—"}</dd></div><div><dt className="text-ll-ink-subtle">หลักฐานยอดออก</dt><dd>{entry.usageSource === "balances" ? "ยอดก่อน − ยอดหลัง" : entry.usageSource === "shell_used" ? "shell_used จากบอท" : "ข้อมูลไม่ครบหรือขัดแย้ง ต้องตรวจสอบ"}</dd></div></dl></details></td>
        <td className="max-w-44 break-words">{shellAccount(entry.account)?.name}</td>
        <td className="max-w-52 break-words">{entry.details.game}<span className="sm">{entry.details.pack}</span>{entry.fillCount > 1 && <details className="mt-2"><summary>รวม {entry.fillCount} รายการย่อย</summary><ul className="tiv-subbox space-y-2">{entry.fills.map((fill) => <li key={fill.id} className="border-t border-ll-hairline pt-2 first:border-t-0 first:pt-0"><p>{fill.details.pack}</p><p className="tabular-nums">Shell ออก {money(fill.used)} · คงเหลือ {money(fill.balance)}</p><p className="break-words">คิวบอท {fill.id} · {when(fill.observedAt || fill.occurredAt)}</p></li>)}</ul></details>}</td>
        <td className="r">{money(entry.figures.sale)}{entry.fillCount > 1 && <span className="sm">ยอดรวม ไม่คิดซ้ำต่อรายการย่อย</span>}{entry.details.salePacks > (entry.fillCount || 1) && <span className="sm">เฉพาะส่วนในบัญชี/ช่วงนี้ จากยอดเต็ม {money(entry.details.saleTotalThb)}</span>}{entry.figures.sale == null && entry.details.saleNative != null && <span className="sm">{entry.details.saleNative} {entry.details.saleCurrency} · รอยอด THB</span>}</td>
        <td className="r">{money(entry.figures.cost)}</td>
        <td className="r"><span className={Number(entry.figures.profit) > 0 ? "tiv-pos" : Number(entry.figures.profit) < 0 ? "tiv-neg" : ""}>{money(entry.figures.profit)}</span><span className="sm">{entry.figures.margin == null ? "—" : `${entry.figures.margin}%`}</span></td>
        <td className="r">{money(entry.used)}{entry.fillCount > 1 && <span className="sm">{entry.details.shellBreakdown}</span>}</td>
        <td className="r b">{money(entry.balance)}</td>
      </tr>)}</tbody>
    </table>
    {!entries.length && <div className="tiv-dempty m-4"><strong>ยังไม่มีรายการ</strong>ไม่พบรายการในช่วงวันที่หรือตัวกรองนี้</div>}
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
  const [pageSize, setPageSize] = useState(25);
  const viewKey = new URLSearchParams({ ...dates, account, search, page: String(page), pageSize: String(pageSize) }).toString();
  const [pageReader] = useState(() => createInventoryPageSession());
  const load = useCallback(async () => {
    const version = ++generation.current;
    setLoading(true); setError("");
    try {
      const result = await pageReader.run(endpoint, viewKey);
      if (!Array.isArray(result?.cards) || result.cards.length !== 2 || !Array.isArray(result.entries) || !result.summary) throw new Error("ข้อมูลไม่ครบ กรุณาโหลดใหม่");
      if (alive.current && generation.current === version) setData({ ...result, viewKey });
    } catch (e) { if (alive.current && generation.current === version) setError(e.message || "โหลดข้อมูลไม่สำเร็จ"); }
    finally { if (alive.current && generation.current === version) setLoading(false); }
  }, [viewKey, pageReader]);
  const invalidate = useCallback(() => { generation.current++; pageReader.cancel(); }, [pageReader]);
  useEffect(() => {
    alive.current = true;
    const timer = setTimeout(load, 0);
    return () => { alive.current = false; invalidate(); clearTimeout(timer); };
  }, [load, invalidate]);
  function apply(next) {
    const nextKey = new URLSearchParams({ ...next, account, search: query, page: "1", pageSize: String(pageSize) }).toString();
    invalidate(); setError(""); setDates(next); setDraft(next); setSearch(query); setPage(1);
    if (nextKey === viewKey) void load();
  }
  function selectAccount(value) { invalidate(); setError(""); setAccount(value); setPage(1); }
  const ready = data?.viewKey === viewKey && !error;
  const quick = Object.entries({ today: "วันนี้", yesterday: "เมื่อวาน", month: "เดือนนี้" }).map(([preset, label]) => ({ preset, label, on: Object.entries(codaQuickDates(preset)).every(([k, v]) => dates[k] === v) }));
  return <TopupInventoryPage provider="garena-shell" description="เฉพาะสองบัญชีที่กำหนด · ใช้ยอดที่บอทบันทึก ไม่เชื่อมการสั่งเติม">
    <form onSubmit={(event) => { event.preventDefault(); apply(draft); }} aria-label="กรอง Garena Shell" className="tiv-card">
      <div className="tiv-tools">{quick.map(({ preset, label, on }) => <button type="button" key={preset} aria-pressed={on} className={`${button}${on ? " on" : ""}`} onClick={() => apply(codaQuickDates(preset))}>{label}</button>)}</div>
      <div className="tiv-fields mt-4"><label className={tivField}><span>วันที่เริ่มต้น</span><input type="date" required value={draft.dateFrom} max={draft.dateTo || undefined} onChange={(e) => setDraft({ ...draft, dateFrom: e.target.value })} className={input} /></label><label className={tivField}><span>วันที่สิ้นสุด</span><input type="date" required value={draft.dateTo} min={draft.dateFrom || undefined} onChange={(e) => setDraft({ ...draft, dateTo: e.target.value })} className={input} /></label><label className={tivField}><span>บัญชี Shell</span><select aria-label="บัญชี Shell" value={account} onChange={(e) => selectAccount(e.target.value)} className={input}><option value="">ทุกบัญชี</option>{SHELL_ACCOUNTS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className={tivField}><span>ค้นหา Order / เกม / ผู้เติม</span><input type="search" value={query} maxLength={200} onChange={(e) => setQuery(e.target.value)} className={input} /></label></div>
      <div className="tiv-tools mt-4"><button type="submit" className={tivPrimary}><Search size={16} aria-hidden />ค้นหา</button><button type="button" onClick={load} disabled={loading} className={button}><RefreshCw size={16} aria-hidden />โหลดใหม่</button>{ready && !loading && <a className={button} href={`${endpoint}?${viewKey}&format=csv`} download><Download size={16} aria-hidden />Export CSV</a>}</div>
      <p className="tiv-hint">เวลาไทย · เลือกได้ไม่เกิน 93 วัน · ต้นทุน = Shell ออกจริง × {SHELL_COST_PER_UNIT} บาท · กำไร % = กำไร ÷ ยอดโอน × 100</p>
    </form>
    {error && <p role="alert" className="tiv-alert">{error} · กดโหลดใหม่เพื่อลองอีกครั้ง</p>}
    {loading && <p role="status" className="tiv-muted">กำลังโหลดข้อมูล…</p>}
    {ready && !loading && <>
      <section aria-label="สองบัญชี Garena Shell" className="tiv-two">{data.cards.map((card) => <AccountCard key={card.id} card={card} active={account === card.id} onSelect={() => selectAccount(account === card.id ? "" : card.id)} />)}</section>
      <div className="tiv-foots"><span>ยอดคงเหลือคือค่าที่บอทอ่านได้ล่าสุด ไม่ใช่ยอดตรวจสดจาก Garena และไม่เปลี่ยนตามช่วงวันที่ ส่วน Shell ออกบนการ์ดรวมเฉพาะช่วงวันที่ ไม่ตามคำค้น รายการที่ไม่มี username หรือใช้บัญชีอื่นจะไม่ถูกนำมารวม</span></div>
      <section aria-label="ผลการค้นหา" className="flex flex-col gap-4"><div className="tiv-sect-h"><h2>ประวัติรายการสำเร็จ</h2><span>{data.total.toLocaleString("en-US")} ออเดอร์{data.summary.fills != null && ` · ${data.summary.fills} รายการย่อย`}</span></div>
        <dl className="tiv-kpis">{[["ยอดโอนตามตัวกรอง (THB)", data.summary.sale], ["ต้นทุนตามตัวกรอง (THB)", data.summary.cost], ["กำไรตามตัวกรอง (THB)", data.summary.profit]].map(([label, value]) => <div key={label} className="tiv-kpi"><dt>{label}</dt><dd className={value == null ? "mut" : ""}>{money(value)}</dd></div>)}</dl>
        {(data.summary.missingSales > 0 || data.summary.missingCosts > 0) && <div className="tiv-foots"><span role="status">ข้อมูลไม่ครบ: ยอดโอน {data.summary.missingSales} · ต้นทุน {data.summary.missingCosts} รายการ ยอดรวมที่คำนวณไม่ครบแสดง — ไม่แทนด้วยศูนย์</span></div>}
        <OrdersTable entries={data.entries} />
        <TablePagination page={data.page} pageSize={data.pageSize} total={data.total} totalPages={Math.max(1, Math.ceil(data.total / data.pageSize))} observedAt={data.pagination?.observedAt} loading={loading} onPage={(nextPage) => { invalidate(); setPage(nextPage); }} onPageSize={(size) => { invalidate(); setPageSize(size); setPage(1); }} label="แบ่งหน้าประวัติ" />
      </section>
    </>}
  </TopupInventoryPage>;
}
