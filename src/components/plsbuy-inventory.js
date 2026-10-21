"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Download, RefreshCw } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { topupInventoryPath } from "@/lib/topup-inventory";
import { codaQuickDates } from "@/lib/usdcodashop-overview";
import { PLSBUY_REFERENCE_RATE } from "@/lib/plsbuy-inventory";
const endpoint = "/api/projectm/plsbuy";
const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-ll-hairline-strong bg-ll-surface-1 px-4 text-sm text-ll-ink hover:bg-ll-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ll-primary disabled:opacity-50";
const input = "min-h-11 w-full min-w-0 rounded-lg border border-ll-hairline-strong bg-ll-surface-1 px-3 text-sm text-ll-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ll-primary";
const money = (v) => v == null ? "—" : Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const when = (v) => v ? new Date(v).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" }) : "ไม่ระบุเวลา";
const basis = (details) => details.costBasis === "recorded" ? "ต้นทุนที่บันทึกในล็อต MYR" : details.costBasis === "mixed" ? "รวมต้นทุนบันทึกและอ้างอิง" : `อ้างอิงเรท ${details.costRate}`;
function WalletCard({ data }) {
  const api = data.balanceSource === "plsbuy_api";
  return <article className="rounded-xl border border-ll-hairline bg-ll-surface-1 p-5">
    <h2 className="font-semibold">{api ? "ยอด Plsbuy ที่บอทเช็กล่าสุด" : "คงเหลือในล็อต MYR ที่ระบุ Plsbuy"}</h2>
    <p className="mt-3 text-3xl font-semibold tabular-nums">{money(data.balance)} MYR</p>
    <p className="mt-2 text-xs text-ll-ink-subtle">{api ? `เช็กเมื่อ ${when(data.balanceAt)}` : data.lotCount ? `${data.lotCount} ล็อต · ${when(data.balanceAt)}` : "ยังไม่มียอด API หรือล็อต MYR ที่ยืนยัน ไม่ใช่ยอดศูนย์"}</p>
    {api && <p className="mt-2 break-all text-xs text-ll-ink-subtle">บันทึกตอนปิดงาน {data.balanceOrderId} · เป็นยอดบัญชี ณ เวลาเช็ก ไม่ใช่ยอดสดตอนเปิดหน้า และไม่เปลี่ยนตามตัวกรอง</p>}
    <p className="mt-2 text-xs text-ll-ink-subtle">ไม่หักยอดซ้ำ และไม่นำยอดรวม SYSTEM/NONE มาใช้แทน{api && data.lotBalance != null ? ` · คงเหลือเฉพาะล็อต ${money(data.lotBalance)} MYR` : ""}</p>
  </article>;
}
function History({ entries }) {
  return <div role="region" aria-label="ประวัติ Plsbuy" tabIndex={0} className="max-h-[70vh] overflow-auto rounded-xl border border-ll-hairline">
    <table className="w-full min-w-[1280px] text-left text-sm"><caption className="sr-only">ประวัติ Plsbuy สำเร็จ พร้อมยอด MYR คงเหลือที่บอทเช็กในแต่ละ Order</caption><thead className="sticky top-0 bg-ll-surface-2"><tr>{["วันที่ (ไทย)", "Order / เกม / แพ็ก", "ยอดโอน THB", "ต้นทุน THB", "กำไร THB / %", "MYR ออก", "MYR คงเหลือ", "รายละเอียด"].map((h, i) => <th key={h} scope="col" className={`whitespace-nowrap px-3 py-3 ${i >= 2 && i <= 6 ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
      <tbody>{entries.map((e) => <tr key={`${e.source}:${e.orderId}`} className="border-t border-ll-hairline bg-ll-surface-1 align-top">
        <td className="whitespace-nowrap px-3 py-3">{when(e.occurredAt)}</td>
        <td className="max-w-64 break-words px-3 py-3"><p className="font-semibold">{e.orderId}</p><p className="mt-1">{e.details.game}</p><p className="mt-1 text-xs text-ll-ink-subtle">{e.details.pack}</p><p className="mt-1 text-xs text-ll-ink-subtle">ผู้เติม: {e.details.sheetOperator || e.details.operator}</p></td>
        <td className="px-3 py-3 text-right tabular-nums">{money(e.figures.sale)}{e.fillCount > 1 && <p className="mt-1 text-xs text-ll-ink-subtle">รวมแล้ว ไม่คิดซ้ำ</p>}</td>
        <td className="px-3 py-3 text-right tabular-nums">{money(e.figures.cost)}<p className="mt-1 text-xs text-ll-ink-subtle">{basis(e.details)}</p></td>
        <td className="px-3 py-3 text-right tabular-nums">{money(e.figures.profit)}<p className="mt-1 text-xs text-ll-ink-subtle">{e.figures.margin == null ? "—" : `${e.figures.margin}%`}</p></td>
        <td className="px-3 py-3 text-right font-semibold tabular-nums">{money(e.used)}</td>
        <td className="px-3 py-3 text-right tabular-nums"><p className="font-semibold">{money(e.wallet?.amount)}</p><p className="mt-1 text-xs text-ll-ink-subtle">{e.wallet ? `เช็กเมื่อ ${when(e.wallet.checkedAt)}` : "ยังไม่มียอดที่บันทึก"}</p></td>
        <td className="max-w-72 break-words px-3 py-3"><details><summary className="min-h-11 cursor-pointer py-3 text-xs focus-visible:outline-2 focus-visible:outline-ll-primary">{e.fillCount} รายการย่อย</summary><p className="text-xs">ลูกค้า: {e.details.customer || "—"} · UID: {e.details.playerId || "—"}</p><ul className="mt-2 space-y-2 text-xs">{e.fills.map((f) => <li key={f.id} className="border-t border-ll-hairline py-2">
          <p>คิว {f.id} · {f.details.pack}</p><p className="mt-1">MYR ออก {money(f.used)}</p>
          <p className="mt-1">ยอดก่อนเช็ก {money(f.wallet?.before)} MYR · ยอดหลังเช็ก {money(f.wallet?.amount)} MYR</p>
          {f.wallet && <p className="mt-1 text-ll-ink-subtle">เช็กเมื่อ {when(f.wallet.checkedAt)}</p>}
          <p className="mt-1 break-all text-ll-ink-subtle">{f.details.invoice || "ไม่มีเลขธุรกรรม"}</p>{f.ledger.map((l) => <p key={l.id} className="mt-1 text-ll-ink-subtle">Ledger: {money(l.used)} MYR · {l.typed ? `คงเหลือเฉพาะล็อต ${money(l.balance)}` : "SYSTEM/NONE ไม่ใช่ยอดคงเหลือ Plsbuy"}</p>)}
        </li>)}</ul></details></td>
      </tr>)}</tbody>
    </table>{!entries.length && <p className="p-6 text-center text-sm text-ll-ink-subtle">ไม่พบรายการสำเร็จตามตัวกรอง</p>}
  </div>;
}
export default function PlsbuyInventory({ lang }) {
  const [filters, setFilters] = useState(() => ({ ...codaQuickDates("month"), search: "", rate: PLSBUY_REFERENCE_RATE, page: "1" }));
  const [draft, setDraft] = useState(filters), [data, setData] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const generation = useRef(0), alive = useRef(false), viewKey = new URLSearchParams(filters).toString();
  const invalidate = useCallback(() => { generation.current++; }, []);
  const load = useCallback(async () => {
    const version = ++generation.current; setLoading(true); setError("");
    try {
      const result = await apiJson(`${endpoint}?${viewKey}`, { cache: "no-store" });
      if (!Array.isArray(result?.entries) || !result.summary || !result.reference || !Number.isFinite(result.total)) throw new Error("ข้อมูลไม่ครบ กรุณาโหลดใหม่");
      if (alive.current && generation.current === version) setData({ ...result, viewKey });
    } catch (e) { if (alive.current && generation.current === version) setError(e.message || "โหลดข้อมูลไม่สำเร็จ"); }
    finally { if (alive.current && generation.current === version) setLoading(false); }
  }, [viewKey]);
  useEffect(() => { alive.current = true; const timer = setTimeout(load, 0); return () => { alive.current = false; invalidate(); clearTimeout(timer); }; }, [load, invalidate]);
  function apply(next) { invalidate(); setError(""); setFilters(next); setDraft(next); if (new URLSearchParams(next).toString() === viewKey) void load(); }
  const ready = data?.viewKey === viewKey && !loading && !error;
  return <main className="mx-auto flex min-h-screen min-w-0 max-w-7xl flex-col gap-6 px-4 pb-14 pt-10 text-ll-ink sm:px-6">
    <header className="flex flex-wrap items-center justify-between gap-4 pr-12"><div><p className="text-xs text-ll-ink-tertiary">TOPUP INVENTORY</p><h1 className="mt-2 text-3xl font-semibold">(MYR) Plsbuy</h1><p className="mt-2 text-sm text-ll-ink-subtle">ประวัติสำเร็จจากบอท · อ่านอย่างเดียว ไม่สั่งเติมและไม่หักยอดซ้ำ</p></div><Link href={topupInventoryPath(lang)} className={button}><ArrowLeft size={16} aria-hidden />กลับ Topup Inventory</Link></header>
    <form className="space-y-4 rounded-xl border border-ll-hairline bg-ll-surface-1 p-4" aria-label="กรอง Plsbuy" onSubmit={(e) => { e.preventDefault(); apply({ ...draft, page: "1" }); }}>
      <div className="flex flex-wrap gap-2">{[["today", "วันนี้"], ["yesterday", "เมื่อวาน"], ["month", "เดือนนี้"]].map(([key, title]) => <button type="button" key={key} className={button} onClick={() => apply({ ...draft, ...codaQuickDates(key), page: "1" })}>{title}</button>)}</div>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className="space-y-2 text-sm"><span>วันที่เริ่มต้น</span><input type="date" required value={draft.dateFrom} className={input} onChange={(e) => setDraft({ ...draft, dateFrom: e.target.value })} /></label><label className="space-y-2 text-sm"><span>วันที่สิ้นสุด</span><input type="date" required value={draft.dateTo} className={input} onChange={(e) => setDraft({ ...draft, dateTo: e.target.value })} /></label><label className="space-y-2 text-sm"><span>ค้นหา Order / เกม / ผู้เติม</span><input type="search" maxLength={200} value={draft.search} className={input} onChange={(e) => setDraft({ ...draft, search: e.target.value })} /></label><label className="space-y-2 text-sm"><span>เรทอ้างอิง THB ต่อ MYR</span><input type="number" min="0.00000001" max="999999" step="0.00000001" required value={draft.rate} className={input} onChange={(e) => setDraft({ ...draft, rate: e.target.value })} /></label></div>
      <div className="flex flex-wrap gap-2"><button type="submit" className={button}>ค้นหา / ใช้เรทนี้</button><button type="button" className={button} disabled={loading} onClick={load}><RefreshCw size={16} aria-hidden />โหลดใหม่</button>{ready && <a className={button} href={`${endpoint}?${viewKey}&format=csv`} download><Download size={16} aria-hidden />Export CSV</a>}</div><p className="text-xs text-ll-ink-subtle">เวลาไทย · ไม่เกิน 93 วัน · เรทตั้งต้นจากชีท {PLSBUY_REFERENCE_RATE} · การปรับมีผลต่อหน้าจอ/CSV เท่านั้น ไม่บันทึกหรือแก้ประวัติบอท</p>
    </form>
    {error && <p role="alert" className="rounded-xl border border-ll-hairline p-4 text-sm">{error} · กดโหลดใหม่เพื่อลองอีกครั้ง</p>}{loading && <p role="status" className="text-sm text-ll-ink-subtle">กำลังโหลดข้อมูล…</p>}
    {ready && <>
      <section className="grid gap-4 sm:grid-cols-2" aria-label="ยอดคงเหลือและอ้างอิง"><WalletCard data={data} /><article className="rounded-xl border border-ll-hairline bg-ll-surface-1 p-5"><h2 className="font-semibold">ยอดอ้างอิงจากไฟล์ชีท (MYR)</h2><dl className="mt-4 grid grid-cols-3 gap-3 text-sm">{[["ปัจจุบัน", data.reference.current], ["ใช้ไป", data.reference.used], ["คงเหลือ", data.reference.remaining]].map(([title, v]) => <div key={title}><dt className="text-ll-ink-subtle">{title}</dt><dd className="mt-2 font-semibold tabular-nums">{money(v)}</dd></div>)}</dl><p className="mt-4 text-xs text-ll-ink-subtle">สถานะอ้างอิง: {data.reference.status} · ไม่ใช่ยอดสด ไม่นำมาหักยอดออกซ้ำ และไม่ได้ยืนยันวันตัดยอด</p></article></section>
      <p className="rounded-xl border border-ll-hairline bg-ll-surface-1 p-4 text-sm">ยอดออกใช้ amount_used ที่บอทบันทึกให้คิว PlsbuyMYR หากล็อตเป็น SYSTEM/NONE ต้นทุน 0 จะไม่ถูกนับเป็นต้นทุนจริง แต่ใช้อ้างอิง MYR ออก × เรทที่เลือก หากพบต้นทุนล็อต MYR จริงจะใช้ค่าที่บันทึกนั้นและไม่แปลงซ้ำ</p>
      <section className="space-y-4" aria-label="ผลการค้นหา"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">ประวัติ Plsbuy · {data.total} ออเดอร์</h2><p className="text-sm text-ll-ink-subtle">{data.summary.fills} รายการย่อย</p></div><dl className="grid gap-3 rounded-xl border border-ll-hairline bg-ll-surface-1 p-4 sm:grid-cols-2 lg:grid-cols-4">{[["ยอดโอน THB", data.summary.sale], ["ต้นทุน THB (รวมค่าอ้างอิง)", data.summary.cost], ["กำไร THB (รวมค่าอ้างอิง)", data.summary.profit], ["MYR ออกตามตัวกรอง", data.summary.used]].map(([title, v]) => <div key={title}><dt className="text-xs text-ll-ink-subtle">{title}</dt><dd className="mt-2 text-xl font-semibold tabular-nums">{money(v)}</dd></div>)}</dl>
        <p className="text-xs text-ll-ink-subtle">กำไร % = (ยอดโอน − ต้นทุน) ÷ ยอดโอน × 100 · ค่าอ้างอิงจะเปลี่ยนเมื่อปรับเรท ไม่ใช่ต้นทุนซื้อจริงย้อนหลัง · ไม่นับรายการ Failed/Manual ว่าเติมสำเร็จ</p>
        {(data.summary.missingSales > 0 || data.summary.missingCosts > 0) && <p role="status" className="text-sm text-ll-ink-subtle">ข้อมูลไม่ครบ: ยอดโอน {data.summary.missingSales} · ยอดออก {data.summary.missingUsage} · ต้นทุน {data.summary.missingCosts} รายการ ยอดรวมที่ข้อมูลไม่ครบแสดง — ไม่แทนด้วยศูนย์</p>}
        <p className="text-xs text-ll-ink-subtle">เลื่อนตารางแนวนอนเพื่อดู MYR คงเหลือ · ใช้ยอดบัญชีที่บอทเช็กล่าสุดภายใน Order นั้น ไม่ใช่ยอดสดหรือผลรวมยอดคงเหลือ · รายการเก่าที่ไม่เคยบันทึกจะแสดง —</p><History entries={data.entries} /><nav aria-label="เปลี่ยนหน้าประวัติ" className="flex items-center justify-end gap-3"><button type="button" className={button} disabled={data.page <= 1} onClick={() => apply({ ...filters, page: String(data.page - 1) })}>ก่อนหน้า</button><span className="text-sm">หน้า {data.page} / {Math.max(1, Math.ceil(data.total / data.pageSize))}</span><button type="button" className={button} disabled={data.page * data.pageSize >= data.total} onClick={() => apply({ ...filters, page: String(data.page + 1) })}>ถัดไป</button></nav>
      </section>
    </>}
  </main>;
}
