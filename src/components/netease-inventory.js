"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Download, RefreshCw } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { topupInventoryPath } from "@/lib/topup-inventory";
import { codaQuickDates } from "@/lib/usdcodashop-overview";
import { NETEASE_ACCOUNTS, neteaseAccount } from "@/lib/netease-inventory";

const endpoint = "/api/projectm/netease";
const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-ll-hairline-strong bg-ll-surface-1 px-4 text-sm text-ll-ink hover:bg-ll-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ll-primary disabled:opacity-50";
const input = "min-h-11 w-full min-w-0 rounded-lg border border-ll-hairline-strong bg-ll-surface-1 px-3 text-sm text-ll-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ll-primary";
const money = (v) => v == null ? "—" : Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const when = (v) => v ? new Date(v).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" }) : "—";
const initialRates = Object.fromEntries(NETEASE_ACCOUNTS.map((a) => [a.id, a.rate || a.divisor]));

function WalletCard({ card, onSelect }) {
  return <article className="min-w-0 rounded-xl border border-ll-hairline bg-ll-surface-1 p-4">
    <h3 className="font-semibold">{card.name}</h3><p className="mt-1 break-all text-xs text-ll-ink-subtle">{card.email || "ยังไม่มีอีเมลที่ยืนยัน"}</p>
    <p className="mt-4 text-xs text-ll-ink-subtle">คงเหลือล่าสุดจากบอท ({card.currency})</p><p className="mt-1 text-2xl font-semibold tabular-nums">{money(card.balance)}</p>
    <p className="mt-1 text-xs text-ll-ink-subtle">{card.balanceAt ? when(card.balanceAt) : "ยังไม่มีประวัติที่ระบุกระเป๋านี้ได้แน่นอน"}</p>
    <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-ll-hairline pt-3 text-sm"><div><dt className="text-ll-ink-subtle">ใช้ไปในช่วงวันที่</dt><dd className="mt-1 tabular-nums">{money(card.used)} {card.currency}</dd></div><div><dt className="text-ll-ink-subtle">ออเดอร์</dt><dd className="mt-1">{card.orders ?? "—"}</dd></div></dl>
    {card.pending && <p className="mt-2 text-xs text-ll-ink-subtle">รอยืนยันการจับคู่กระเป๋า ไม่แสดงยอดที่ยังตรวจสอบไม่ครบเป็นศูนย์</p>}
    {card.reference && <details className="mt-2 text-xs"><summary className="min-h-11 cursor-pointer py-3 text-ll-ink-subtle focus-visible:outline-2 focus-visible:outline-ll-primary">ยอดอ้างอิงจากชีท</summary><dl className="grid grid-cols-3 gap-2"><div><dt>ปัจจุบัน</dt><dd>{money(card.reference.current)}</dd></div><div><dt>ใช้ไป</dt><dd>{money(card.reference.used)}</dd></div><div><dt>คงเหลือ</dt><dd>{money(card.reference.remaining)}</dd></div></dl><p className="mt-2 text-ll-ink-subtle">ไม่ใช่ยอดสด และไม่นำมาบวก/หักกับยอดบอท</p></details>}
    <button type="button" className={`${button} mt-3 w-full`} onClick={onSelect}>ดูรายการ {card.name}</button>
  </article>;
}

function History({ entries }) {
  return <div className="max-h-[70vh] overflow-auto rounded-xl border border-ll-hairline" role="region" aria-label="ประวัติ Netease" tabIndex={0}>
    <table className="w-full min-w-[1250px] text-left text-sm"><caption className="sr-only">ประวัติ Netease รวมยอดโอนหนึ่งครั้งต่อออเดอร์และกระเป๋า</caption>
      <thead className="sticky top-0 bg-ll-surface-2"><tr>{["วันที่ (ไทย)", "Order / เกม / แพ็ก", "บัญชี", "ยอดโอน THB", "ต้นทุน THB", "กำไร THB / %", "ยอดออก", "คงเหลือ (บอท)"].map((h, i) => <th scope="col" key={h} className={`whitespace-nowrap px-3 py-3 ${i > 2 ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
      <tbody>{entries.map((e) => <tr key={`${e.walletKey}:${e.source}:${e.orderId}`} className="border-t border-ll-hairline bg-ll-surface-1 align-top">
        <td className="whitespace-nowrap px-3 py-3">{when(e.occurredAt)}</td>
        <td className="max-w-72 break-words px-3 py-3"><p className="font-semibold">{e.orderId}</p><p className="mt-1">{e.details.game}</p><p className="mt-1 text-xs text-ll-ink-subtle">{e.details.pack}</p><details className="mt-2"><summary className="min-h-11 cursor-pointer py-3 text-xs focus-visible:outline-2 focus-visible:outline-ll-primary">รายละเอียด · {e.fillCount} รายการย่อย</summary>
          <p className="text-xs">ลูกค้า: {e.details.customer || "—"} · ผู้เติม: {e.details.sheetOperator || e.details.operator}</p>
          <ul className="mt-2 space-y-2 text-xs">{e.fills.map((f) => <li key={f.id} className="border-t border-ll-hairline py-2"><p>{f.details.pack} · ออก {money(f.used)} {f.currency || "ไม่ระบุสกุลเงิน"}</p><p className="mt-1 break-all text-ll-ink-subtle">คิวบอท {f.codaId} · ใบเสร็จ {f.details.invoice || "—"}</p></li>)}</ul>
          {e.details.saleNative != null && <p className="mt-2 text-xs">ยอดโอนสกุลเดิม {e.details.saleNative} {e.details.saleCurrency} {e.details.saleConversion && `(เรทอ้างอิง ${e.details.saleConversion.rate})`}</p>}
        </details></td>
        <td className="max-w-60 break-words px-3 py-3"><p>{neteaseAccount(e.account)?.name || "ยังไม่ระบุ Pay/Credit"}</p><p className="mt-1 break-all text-xs text-ll-ink-subtle">{e.email || "ไม่มีอีเมล"}</p></td>
        <td className="px-3 py-3 text-right tabular-nums">{money(e.figures.sale)}{e.fillCount > 1 && <p className="mt-1 text-xs text-ll-ink-subtle">รวมแล้ว ไม่คิดซ้ำ</p>}</td>
        <td className="px-3 py-3 text-right tabular-nums">{money(e.figures.cost)}</td>
        <td className="px-3 py-3 text-right tabular-nums">{money(e.figures.profit)}<p className="mt-1 text-xs text-ll-ink-subtle">{e.figures.margin == null ? "—" : `${e.figures.margin}%`}</p></td>
        <td className="px-3 py-3 text-right tabular-nums">{money(e.used)}<p className="mt-1 text-xs text-ll-ink-subtle">{e.currency || "ยังไม่ยืนยันสกุลเงิน"}</p>{e.conflict && <p className="mt-1 text-xs">ยอดก่อน/หลังขัดแย้ง</p>}</td>
        <td className="px-3 py-3 text-right font-semibold tabular-nums">{money(e.balance)}<p className="mt-1 text-xs font-normal text-ll-ink-subtle">{e.currency || "ยังไม่ยืนยันสกุลเงิน"}</p></td>
      </tr>)}</tbody>
    </table>{!entries.length && <p className="p-6 text-center text-sm text-ll-ink-subtle">ไม่พบรายการตามตัวกรอง</p>}
  </div>;
}

export default function NeteaseInventory({ lang }) {
  const [filters, setFilters] = useState(() => ({ ...codaQuickDates("month"), account: "", search: "", rates: JSON.stringify(initialRates), page: "1" }));
  const [draft, setDraft] = useState(filters), [rates, setRates] = useState(initialRates);
  const [data, setData] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const generation = useRef(0), alive = useRef(false);
  const invalidate = useCallback(() => { generation.current++; }, []);
  const viewKey = new URLSearchParams(filters).toString();
  const load = useCallback(async () => {
    const version = ++generation.current; setLoading(true); setError("");
    try {
      const result = await apiJson(`${endpoint}?${viewKey}`, { cache: "no-store" });
      if (!Array.isArray(result?.cards) || result.cards.length !== NETEASE_ACCOUNTS.length || !Array.isArray(result.entries) || !result.summary) throw new Error("ข้อมูลไม่ครบ กรุณาโหลดใหม่");
      if (alive.current && generation.current === version) setData({ ...result, viewKey });
    } catch (e) { if (alive.current && generation.current === version) setError(e.message || "โหลดข้อมูลไม่สำเร็จ"); }
    finally { if (alive.current && generation.current === version) setLoading(false); }
  }, [viewKey]);
  useEffect(() => { alive.current = true; const timer = setTimeout(load, 0); return () => { alive.current = false; invalidate(); clearTimeout(timer); }; }, [load, invalidate]);
  function apply(next) { generation.current++; setError(""); setFilters(next); setDraft(next); if (new URLSearchParams(next).toString() === viewKey) void load(); }
  const ready = data?.viewKey === viewKey && !loading && !error;
  return <main className="mx-auto flex min-h-screen min-w-0 max-w-7xl flex-col gap-6 px-4 pb-14 pt-10 text-ll-ink sm:px-6">
    <header className="flex flex-wrap items-center justify-between gap-4 pr-12"><div><p className="text-xs text-ll-ink-tertiary">TOPUP INVENTORY</p><h1 className="mt-2 text-3xl font-semibold">Netease</h1><p className="mt-2 text-sm text-ll-ink-subtle">Pay / Credit ตามชีท · อ่านประวัติบอท ไม่สั่งเติมและไม่หักเงิน</p></div><Link href={topupInventoryPath(lang)} className={button}><ArrowLeft size={16} aria-hidden />กลับ Topup Inventory</Link></header>
    <form className="space-y-4 rounded-xl border border-ll-hairline bg-ll-surface-1 p-4" aria-label="กรอง Netease" onSubmit={(e) => { e.preventDefault(); apply({ ...draft, rates: JSON.stringify(rates), page: "1" }); }}>
      <div className="flex flex-wrap gap-2">{[["today", "วันนี้"], ["yesterday", "เมื่อวาน"], ["month", "เดือนนี้"]].map(([key, title]) => <button type="button" className={button} key={key} onClick={() => apply({ ...draft, ...codaQuickDates(key), rates: JSON.stringify(rates), page: "1" })}>{title}</button>)}</div>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-2 text-sm"><span>วันที่เริ่มต้น</span><input type="date" required value={draft.dateFrom} className={input} onChange={(e) => setDraft({ ...draft, dateFrom: e.target.value })} /></label>
        <label className="space-y-2 text-sm"><span>วันที่สิ้นสุด</span><input type="date" required value={draft.dateTo} className={input} onChange={(e) => setDraft({ ...draft, dateTo: e.target.value })} /></label>
        <label className="space-y-2 text-sm"><span>บัญชี Netease</span><select aria-label="บัญชี Netease" value={draft.account} className={input} onChange={(e) => setDraft({ ...draft, account: e.target.value })}><option value="">ทุกบัญชี</option>{NETEASE_ACCOUNTS.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}<option value="unmapped">ยังไม่ระบุ Pay/Credit</option></select></label>
        <label className="space-y-2 text-sm"><span>ค้นหา Order / เกม / อีเมล</span><input type="search" maxLength={200} value={draft.search} className={input} onChange={(e) => setDraft({ ...draft, search: e.target.value })} /></label>
      </div>
      <details><summary className="min-h-11 cursor-pointer py-3 text-sm focus-visible:outline-2 focus-visible:outline-ll-primary">เรทต้นทุนตามชีท (ปรับเพื่อดูผลคำนวณ)</summary>
        <p className="mb-3 text-xs text-ll-ink-subtle">USD ออก × บาทต่อ USD · KRW ออก ÷ KRW ต่อบาท · ค่าเริ่มต้นจากสูตรในชีท ไม่ใช่เรท GoogleFinance สด การปรับเปลี่ยนเฉพาะหน้าจอและ Export ไม่แก้ประวัติบอท และไม่บันทึกเมื่อเปิดหน้าใหม่</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{NETEASE_ACCOUNTS.map((a) => <label key={a.id} className="space-y-2 text-xs"><span>{a.name} ({a.divisor ? "KRW ต่อบาท" : "บาทต่อ USD"})</span><input className={input} type="number" min="0.00000001" max="999999" step="0.00000001" required value={rates[a.id]} onChange={(e) => setRates({ ...rates, [a.id]: e.target.value })} /></label>)}</div>
      </details>
      <div className="flex flex-wrap gap-2"><button type="submit" className={button}>ค้นหา / ใช้เรทนี้</button><button type="button" className={button} disabled={loading} onClick={load}><RefreshCw size={16} aria-hidden />โหลดใหม่</button>{ready && <a className={button} href={`${endpoint}?${viewKey}&format=csv`} download><Download size={16} aria-hidden />Export CSV</a>}</div>
      <p className="text-xs text-ll-ink-subtle">เวลาไทย · ไม่เกิน 93 วัน · กำไร = ยอดโอน − ต้นทุน · กำไร % = กำไร ÷ ยอดโอน × 100</p>
    </form>
    {error && <p role="alert" className="rounded-xl border border-ll-hairline p-4 text-sm">{error} · กดโหลดใหม่เพื่อลองอีกครั้ง</p>}
    {loading && <p role="status" className="text-sm text-ll-ink-subtle">กำลังโหลดข้อมูล…</p>}
    {ready && <>
      {data.unassigned > 0 && <aside className="rounded-xl border border-ll-hairline bg-ll-surface-1 p-4 text-sm"><p>มี {data.unassigned} ออเดอร์ที่ยังระบุ Pay/Credit ไม่ได้ เช่น เมลร่วมของ Pay 2 / Credit 2 จะแสดงประวัติแยกไว้ ไม่เดาชนิดกระเป๋าจากชื่อเกม และไม่ใช้คำนวณยอดคงเหลือบนการ์ดหรือต้นทุน</p><button type="button" className={`${button} mt-3`} onClick={() => apply({ ...filters, account: "unmapped", page: "1" })}>ตรวจรายการที่ยังไม่ระบุกระเป๋า</button></aside>}
      <section aria-label="บัญชี Netease" className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">{data.cards.map((card) => <WalletCard key={card.id} card={card} onSelect={() => apply({ ...filters, account: card.id, page: "1" })} />)}</section>
      <p className="text-xs text-ll-ink-subtle">ยอดบอทคือยอดหลังรายการล่าสุด ไม่ใช่การเช็กกระเป๋าสด และไม่เปลี่ยนตามช่วงวันที่ · ใช้ไปบนการ์ดนับตามช่วงวันที่ ไม่ตามคำค้น · ไม่รวม USD กับ KRW · รายการสกุลเงินว่างจะอ้างอิงสกุลเงินได้เฉพาะบัญชีที่จับคู่จากชีทได้แน่นอน</p>
      <section className="space-y-4" aria-label="ผลการค้นหา"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">ประวัติรายการ</h2><p className="text-sm">{data.total} ออเดอร์ · {data.summary.fills} รายการย่อย</p></div>
        <dl className="grid gap-3 rounded-xl border border-ll-hairline bg-ll-surface-1 p-4 sm:grid-cols-3">{[["ยอดโอน THB", data.summary.sale], ["ต้นทุน THB", data.summary.cost], ["กำไร THB", data.summary.profit]].map(([label, value]) => <div key={label}><dt className="text-sm text-ll-ink-subtle">{label}</dt><dd className="mt-2 text-xl font-semibold tabular-nums">{money(value)}</dd></div>)}</dl>
        {(data.summary.missingSales > 0 || data.summary.missingCosts > 0) && <p role="status" className="text-sm text-ll-ink-subtle">ข้อมูลไม่ครบ: ยอดโอน {data.summary.missingSales} · ต้นทุน {data.summary.missingCosts} รายการ ยอดรวมที่ข้อมูลไม่ครบจะแสดง — ไม่แทนด้วยศูนย์</p>}
        <History entries={data.entries} />
        <nav aria-label="เปลี่ยนหน้าประวัติ" className="flex items-center justify-end gap-3"><button type="button" className={button} disabled={data.page <= 1} onClick={() => apply({ ...filters, page: String(data.page - 1) })}>ก่อนหน้า</button><span className="text-sm">หน้า {data.page} / {Math.max(1, Math.ceil(data.total / data.pageSize))}</span><button type="button" className={button} disabled={data.page * data.pageSize >= data.total} onClick={() => apply({ ...filters, page: String(data.page + 1) })}>ถัดไป</button></nav>
      </section>
    </>}
  </main>;
}
