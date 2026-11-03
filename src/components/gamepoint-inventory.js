"use client";
import { createInventoryPageSession } from "@/lib/inventory-page-session";
import { TablePagination } from "@/components/table-pagination";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiJson } from "@/lib/api-json";
import { topupInventoryPath } from "@/lib/topup-inventory";
import { codaQuickDates } from "@/lib/usdcodashop-overview";
import { GAMEPOINT_RATE } from "@/lib/gamepoint-inventory";
const endpoint = "/api/projectm/gamepoint";
const button = "inline-flex min-h-11 items-center justify-center rounded-lg border border-ll-hairline-strong bg-ll-surface-1 px-4 text-sm hover:bg-ll-surface-2 focus-visible:outline-2 focus-visible:outline-ll-primary disabled:opacity-50";
const input = "min-h-11 w-full min-w-0 rounded-lg border border-ll-hairline-strong bg-ll-surface-1 px-3 text-sm focus-visible:outline-2 focus-visible:outline-ll-primary";
const money = (v) => v == null ? "—" : Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const when = (v) => v ? new Date(v).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" }) : "ไม่ระบุเวลา";
const source = (basis) => ({ "provider-lines": "ผลบอทครบทุกแพ็ก", "provider-invoice": "ผล invoice แพ็กเดียว", ledger: "ledger", conflict: "ยอดไม่ตรงกัน", mixed: "หลายแหล่งข้อมูล", unknown: "ข้อมูลไม่ครบ" })[basis] || "ข้อมูลไม่ครบ";
function History({ entries }) {
  return <div role="region" aria-label="ประวัติ Gamepoint" tabIndex={0} className="max-h-[70vh] overflow-auto rounded-xl border border-ll-hairline">
    <table className="w-full min-w-[1250px] text-left text-sm"><caption className="sr-only">ยอดออกและคงเหลือ Gamepoint แยกยอดคำนวณจากยอดที่บันทึก</caption>
      <thead className="sticky top-0 bg-ll-surface-2"><tr>{["วันที่ (ไทย)", "Order / เกม / แพ็ก", "ยอดโอน THB", "ต้นทุน THB", "กำไร THB / %", "MYR ออก (CostMYR)", "MYR คงเหลือ (คำนวณ)", "รายละเอียด"].map((h, i) => <th key={h} scope="col" className={`whitespace-nowrap px-3 py-3 ${i >= 2 && i <= 6 ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
      <tbody>{entries.map((e) => <tr key={`${e.source}:${e.orderId}`} className="border-t border-ll-hairline bg-ll-surface-1 align-top">
        <td className="whitespace-nowrap px-3 py-3">{when(e.occurredAt)}</td>
        <td className="max-w-64 break-words px-3 py-3"><p className="font-semibold">{e.orderId}</p><p className="mt-1">{e.details.game}</p><p className="mt-1 text-xs text-ll-ink-subtle">{e.details.pack}</p><p className="mt-1 text-xs text-ll-ink-subtle">ผู้เติม: {e.details.sheetOperator || e.details.operator}</p></td>
        <td className="px-3 py-3 text-right tabular-nums">{money(e.figures.sale)}{e.fillCount > 1 && <p className="mt-1 text-xs text-ll-ink-subtle">รวมแล้ว ไม่คิดซ้ำ</p>}</td>
        <td className="px-3 py-3 text-right tabular-nums">{money(e.figures.cost)}<p className="mt-1 text-xs text-ll-ink-subtle">อ้างอิงเรท {e.details.costRate}</p></td>
        <td className="px-3 py-3 text-right tabular-nums">{money(e.figures.profit)}<p className="mt-1 text-xs text-ll-ink-subtle">{e.figures.margin == null ? "—" : `${e.figures.margin}%`}</p></td>
        <td className="max-w-64 px-3 py-3 text-right tabular-nums"><p className="font-semibold">{money(e.used)}</p><p className="mt-1 text-xs text-ll-ink-subtle">{source(e.details.usageBasis)}</p>{e.details.usageWarning && <p className="mt-2 rounded border border-ll-hairline p-2 text-xs">{e.details.usageWarning}</p>}</td>
        <td className="px-3 py-3 text-right tabular-nums"><p className="font-semibold">{money(e.wallet?.amount)}</p><p className="mt-1 max-w-48 text-xs text-ll-ink-subtle">{e.wallet ? `ก่อน − ยอดตัด · ไม่ใช่ยอด API หลังเติม · ${when(e.wallet.checkedAt)}` : "ยังคำนวณยอดหลังไม่ได้"}</p></td>
        <td className="max-w-72 break-words px-3 py-3"><details><summary className="min-h-11 cursor-pointer py-3 focus-visible:outline-2 focus-visible:outline-ll-primary">{e.fillCount} รายการย่อย</summary><p className="text-xs">ลูกค้า: {e.details.customer || "—"} · UID: {e.details.playerId || "—"}</p>
          <ul className="mt-3 space-y-3 text-xs">{e.fills.map((f) => <li key={f.id} className="border-t border-ll-hairline py-2"><p>คิว {f.id} · {f.details.pack}</p><p className="mt-1">ยอดออก {money(f.used)} MYR · {source(f.details.usageBasis)}</p><p className="mt-1">ยอดก่อนที่บันทึก {money(f.observation?.before)} MYR · {when(f.observation?.checkedAt)}</p><p className="mt-1">ยอดหลังคำนวณ {money(f.wallet?.amount)} MYR</p><p className="mt-1">ราคาตั้งต้น stored_cost {money(f.details.storedCostMyr)} MYR (ไม่ใช่ยอดตัด)</p><p className="mt-1 break-all">ธุรกรรม {f.details.invoice || "—"}</p>{f.details.usageWarning && <p className="mt-1">{f.details.usageWarning}</p>}</li>)}</ul>
        </details></td>
      </tr>)}</tbody>
    </table>{!entries.length && <p className="p-6 text-center">ไม่พบรายการสำเร็จตามตัวกรอง</p>}
  </div>;
}
export default function GamepointInventory({ lang }) {
  const [filters, setFilters] = useState(() => ({ ...codaQuickDates("month"), search: "", rate: GAMEPOINT_RATE, page: "1" }));
  const [draft, setDraft] = useState(filters), [data, setData] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const generation = useRef(0), alive = useRef(false), viewKey = new URLSearchParams(filters).toString();
  const [pageReader] = useState(() => createInventoryPageSession());
  const invalidate = useCallback(() => { generation.current++; pageReader.cancel(); }, [pageReader]);
  const load = useCallback(async () => {
    const version = ++generation.current; setLoading(true); setError("");
    try {
      const result = await pageReader.run(endpoint, viewKey);
      if (!Array.isArray(result?.entries) || !result.summary || !result.reference || !Number.isFinite(result.total)) throw new Error("ข้อมูลไม่ครบ กรุณาโหลดใหม่");
      if (alive.current && generation.current === version) setData({ ...result, viewKey });
    } catch (e) { if (alive.current && generation.current === version) setError(e.message || "โหลดข้อมูลไม่สำเร็จ"); }
    finally { if (alive.current && generation.current === version) setLoading(false); }
  }, [viewKey, pageReader]);
  useEffect(() => { alive.current = true; const timer = setTimeout(load, 0); return () => { alive.current = false; invalidate(); clearTimeout(timer); }; }, [load, invalidate]);
  function apply(next) { invalidate(); setError(""); setFilters(next); setDraft(next); if (new URLSearchParams(next).toString() === viewKey) void load(); }
  const ready = data?.viewKey === viewKey && !loading && !error;
  return <main className="mx-auto flex min-h-screen min-w-0 max-w-7xl flex-col gap-6 px-4 pb-14 pt-10 text-ll-ink sm:px-6">
    <header className="flex flex-wrap items-center justify-between gap-4 pr-12"><div><p className="text-xs text-ll-ink-tertiary">TOPUP INVENTORY</p><h1 className="mt-2 text-3xl font-semibold">(MYR) Gamepoint</h1><p className="mt-2 text-sm text-ll-ink-subtle">ประวัติสำเร็จจากบอท · อ่านอย่างเดียว ไม่สั่งเติม ไม่หักยอดซ้ำ</p></div><Link href={topupInventoryPath(lang)} className={button}>กลับ Topup Inventory</Link></header>
    <form aria-label="กรอง Gamepoint" className="space-y-4 rounded-xl border border-ll-hairline bg-ll-surface-1 p-4" onSubmit={(e) => { e.preventDefault(); apply({ ...draft, page: "1" }); }}>
      <div className="flex flex-wrap gap-2">{[["today", "วันนี้"], ["yesterday", "เมื่อวาน"], ["month", "เดือนนี้"]].map(([key, title]) => <button type="button" key={key} className={button} onClick={() => apply({ ...draft, ...codaQuickDates(key), page: "1" })}>{title}</button>)}</div>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">{[["dateFrom", "วันที่เริ่มต้น", "date"], ["dateTo", "วันที่สิ้นสุด", "date"], ["search", "ค้นหา Order / เกม / ผู้เติม", "search"], ["rate", "เรทอ้างอิง THB ต่อ MYR", "number"]].map(([key, label, type]) => <label key={key} className="space-y-2 text-sm"><span>{label}</span><input className={input} type={type} required={key !== "search"} {...(key === "rate" ? { min: "0.00000001", max: "999999", step: "0.00000001" } : key === "search" ? { maxLength: 200 } : {})} value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} /></label>)}</div>
      <div className="flex flex-wrap gap-2"><button type="submit" className={button}>ค้นหา / ใช้เรทนี้</button><button type="button" className={button} disabled={loading} onClick={load}>โหลดใหม่</button>{ready && <a className={button} href={`${endpoint}?${viewKey}&format=csv`} download>Export CSV</a>}</div><p className="text-xs text-ll-ink-subtle">เวลาไทย · ไม่เกิน 93 วัน · รวมทุกแพ็กของ Order ที่มีรายการในช่วงวันที่ แม้บางแพ็กอยู่นอกช่วง · เรทตั้งต้นจากชีท {GAMEPOINT_RATE} · เปลี่ยนเรทเฉพาะรายงาน/CSV ไม่แก้ฐานข้อมูล</p>
    </form>
    {error && <p role="alert" className="rounded-xl border border-ll-hairline p-4">{error}</p>}{loading && <p role="status">กำลังโหลดข้อมูล…</p>}
    {ready && <>
      <section aria-label="ยอดบอทและชีท" className="grid gap-4 sm:grid-cols-2">
        <article className="rounded-xl border border-ll-hairline bg-ll-surface-1 p-5"><h2 className="font-semibold">ยอดก่อนรายการล่าสุดที่บอทบันทึก</h2><p className="mt-3 text-3xl font-semibold tabular-nums">{money(data.observation?.before)} MYR</p><p className="mt-3 break-all text-xs text-ll-ink-subtle">{data.observation ? `${when(data.observation.checkedAt)} · ${data.observation.orderId}` : "ยังไม่มียอดก่อนรายการที่ยืนยัน"}</p><p className="mt-2 text-xs text-ll-ink-subtle">ไม่ใช่ยอดคงเหลือปัจจุบันหรือยอด API หลังเติม · ไม่เปลี่ยนตามตัวกรอง</p></article>
        <article className="rounded-xl border border-ll-hairline bg-ll-surface-1 p-5"><h2 className="font-semibold">ยอดอ้างอิงจากชีท (แยกจากบอท)</h2><p className="mt-3">ยอดเริ่ม {money(data.reference.opening)} MYR</p><p className="mt-2">คงเหลืออ้างอิง {money(data.reference.remaining)} MYR</p><p className="mt-3 text-xs text-ll-ink-subtle">ไม่ใช่ยอดสด ไม่ได้นำมาหักยอดบอทซ้ำ และไม่ได้ยืนยันวันตัดยอด</p></article>
      </section>
      <p className="rounded-xl border border-ll-hairline p-4 text-sm">CostMYR ใช้ยอดผลบอทครบทุกแพ็ก หรือ ledger ที่ตรวจสอบได้ ไม่ใช้ stored_cost แทนยอดตัด · ต้นทุน THB = MYR ออก × เรท · กำไร % = (ยอดโอน − ต้นทุน) ÷ ยอดโอน × 100 · ยอดคงเหลือในตารางเป็นยอดก่อน − ยอดตัด ไม่ใช่ยอด API หลังเติม และอาจต่างเมื่อมีรายการอื่นพร้อมกัน</p>
      <section aria-label="ผลการค้นหา" className="space-y-4"><h2 className="text-xl font-semibold">ประวัติ Gamepoint · {data.total} ออเดอร์ · {data.summary.fills} รายการย่อย</h2>
        <dl className="grid gap-3 rounded-xl border border-ll-hairline bg-ll-surface-1 p-4 sm:grid-cols-2 lg:grid-cols-4">{[["ยอดโอน THB", data.summary.sale], ["ต้นทุน THB (อ้างอิง)", data.summary.cost], ["กำไร THB (อ้างอิง)", data.summary.profit], ["MYR ออก", data.summary.used]].map(([title, v]) => <div key={title}><dt className="text-xs text-ll-ink-subtle">{title}</dt><dd className="mt-2 text-xl font-semibold tabular-nums">{money(v)}</dd></div>)}</dl>
        {(data.summary.missingSales > 0 || data.summary.missingUsage > 0 || data.summary.missingCosts > 0) && <p role="status" className="text-sm">ข้อมูลไม่ครบ: ยอดโอน {data.summary.missingSales} · ยอดออก {data.summary.missingUsage} · ต้นทุน {data.summary.missingCosts} รายการ · ยอดรวมที่ไม่ครบแสดง — ไม่แทนด้วยศูนย์</p>}
        <p className="text-xs text-ll-ink-subtle">เลื่อนตารางแนวนอนเพื่อดูครบทุกคอลัมน์ · เลข Order เดียวกันรวมยอดโอนครั้งเดียวตามสัดส่วนรายการย่อย · ยอดคงเหลือไม่รวมบวกกัน</p><History entries={data.entries} />
        <TablePagination page={data.page} pageSize={data.pageSize} total={data.total} totalPages={Math.max(1, Math.ceil(data.total / data.pageSize))} observedAt={data.pagination?.observedAt} loading={loading} onPage={(page) => apply({ ...filters, page: String(page) })} onPageSize={(size) => apply({ ...filters, page: "1", pageSize: String(size) })} label="แบ่งหน้าประวัติ" />
      </section>
    </>}
  </main>;
}
