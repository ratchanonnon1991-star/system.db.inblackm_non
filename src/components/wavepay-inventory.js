"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { topupInventoryPath } from "@/lib/topup-inventory";
import { codaQuickDates } from "@/lib/usdcodashop-overview";
import { orderLink, sheetFigures } from "@/lib/usdcodashop-sheet";
import { WAVEPAY_MMK_PER_THB, WAVEPAY_START_DATE, waveDefaultDates, wavePhoneLabel } from "@/lib/wavepay-inventory";

const endpoint = "/api/projectm/wavepay";
const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-ll-hairline-strong bg-ll-surface-1 px-4 text-sm text-ll-ink hover:bg-ll-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ll-primary disabled:opacity-50";
const input = "mt-2 min-h-11 w-full rounded-lg border border-ll-hairline-strong bg-ll-surface-1 px-3 text-sm text-ll-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ll-primary";
const cell = "border-r border-ll-hairline px-3 py-3 align-top";
const money = (v) => v == null ? "—" : Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ks = (v) => v == null ? "—" : Number(v).toLocaleString("en-US", { maximumFractionDigits: 2 });
const when = (v) => v ? new Date(v).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" }) : "—";
const headings = ["วันที่", "ลำดับคิว", "ยอดโอน (THB)", "ต้นทุน (THB)", "กำไร (THB)", "กำไร (%)", "MMK ออก", "MMK คงเหลือ", "หมวดสินค้า", "ผู้เติม", "ชื่อลูกค้า", "ลิงก์", "เกม", "สิ่งที่ซื้อ", "transaction / UID", "เลขธุรกรรม"];

function LineCard({ line, active, onSelect }) {
  const incomplete = line.missingSales > 0 || line.missingCosts > 0;
  return <button type="button" aria-pressed={active} onClick={onSelect}
    className={`flex min-w-0 flex-col gap-3 rounded-xl border bg-ll-surface-1 p-4 text-left text-ll-ink hover:bg-ll-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ll-primary ${active ? "border-ll-primary ring-1 ring-ll-primary" : "border-ll-hairline"}`}>
    <div className="flex items-start justify-between gap-2"><p className="break-all font-semibold tabular-nums">{wavePhoneLabel(line.phone)}</p><span className="shrink-0 rounded-full bg-ll-surface-2 px-2 py-1 text-xs text-ll-ink-subtle">{line.orders.toLocaleString("en-US")} ออเดอร์</span></div>
    <div><p className="text-xs text-ll-ink-subtle">คงเหลือล่าสุด (บอท)</p><p className="mt-1 text-2xl font-semibold tabular-nums">{ks(line.balance)} <span className="text-sm font-normal text-ll-ink-subtle">Ks</span></p><p className="mt-1 text-xs text-ll-ink-subtle">ณ {when(line.balanceAt)}</p></div>
    <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-ll-hairline pt-3 text-xs">
      <div><dt className="text-ll-ink-subtle">MMK ออก</dt><dd className="tabular-nums">{ks(line.used)}</dd></div>
      <div><dt className="text-ll-ink-subtle">ยอดโอน (THB)</dt><dd className="tabular-nums">{money(line.sale)}</dd></div>
      <div><dt className="text-ll-ink-subtle">ต้นทุน (THB)</dt><dd className="tabular-nums">{money(line.cost)}</dd></div>
      <div><dt className="text-ll-ink-subtle">กำไร (THB)</dt><dd className="tabular-nums">{money(line.profit)}{line.margin != null && ` · ${line.margin}%`}</dd></div>
    </dl>
    {incomplete && <p className="text-xs text-ll-ink-subtle">ข้อมูลไม่ครบ: ยอดโอน {line.missingSales} · ต้นทุน {line.missingCosts} รายการ (ยอดรวมแสดง —)</p>}
  </button>;
}

function OrdersTable({ entries, emptyMessage }) {
  return <div className="max-h-[70vh] overflow-auto rounded-xl border border-ll-hairline bg-ll-surface-1">
    <table className="w-full min-w-[2000px] text-left text-sm text-ll-ink">
      <caption className="sr-only">ออเดอร์ WavePay ของเบอร์ที่เลือก ยอดโอน ต้นทุน กำไร และยอดคงเหลือจาก WavePay</caption>
      <thead className="sticky top-0 z-20 bg-ll-surface-2"><tr>{headings.map((h) => <th key={h} scope="col" className="whitespace-nowrap border-r border-ll-hairline px-3 py-3 font-semibold">{h}</th>)}</tr></thead>
      <tbody>{entries.map((row) => {
        const d = row.details || {}; const f = sheetFigures(d); const link = orderLink(d.link);
        return <tr key={row.id} className="border-t border-ll-hairline hover:bg-ll-surface-2">
          <td className={`${cell} whitespace-nowrap`}>{when(row.occurredAt)}</td>
          <td className={`${cell} max-w-64 break-words font-medium`}>{row.orderId}</td>
          <td className={`${cell} tabular-nums`}>{money(f.sale)}{d.salePacks > 1 && <p className="mt-1 whitespace-nowrap text-xs text-ll-ink-subtle">หารจากยอดรวม ÷ {d.salePacks} แพ็ก</p>}{f.sale == null && d.saleNative != null && <p className="mt-1 whitespace-nowrap text-xs text-ll-ink-subtle">{money(d.saleNative)} {d.saleCurrency || "ไม่ทราบสกุล"}<br />รอเรทแปลงเป็น THB</p>}{d.saleConversion && <p className="mt-1 whitespace-nowrap text-xs text-ll-ink-subtle">{d.saleNative} {d.saleCurrency} × {d.saleConversion.rate} (เรทวันนี้)</p>}</td>
          <td className={`${cell} tabular-nums`}>{money(f.cost)}</td>
          <td className={`${cell} tabular-nums`}>{money(f.profit)}</td>
          <td className={`${cell} tabular-nums`}>{f.margin == null ? "—" : `${f.margin}%`}</td>
          <td className={`${cell} tabular-nums`}>{ks(row.usedMmk)}{row.usedSource === "pack" && <p className="mt-1 whitespace-nowrap text-xs text-ll-ink-subtle">ตามราคาแพ็ก (ไม่มียอดก่อน/หลัง)</p>}</td>
          <td className={`${cell} font-semibold tabular-nums`}>{ks(row.balanceMmk)}</td>
          <td className={cell}>{d.category || "—"}</td>
          <td className={`${cell} max-w-44 break-words`}>{d.sheetOperator || d.operator || "—"}</td>
          <td className={`${cell} max-w-52 break-words`}>{d.customer || "—"}</td>
          <td className={cell}>{link ? <a href={link} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">เปิดรายการ</a> : "—"}</td>
          <td className={`${cell} max-w-56 break-words`}>{d.game || "—"}</td>
          <td className={`${cell} max-w-56 break-words`}>{d.pack || "—"}</td>
          <td className={`${cell} max-w-56 break-words`}>{d.playerId || "—"}</td>
          <td className={`${cell} max-w-64 break-words`}>{d.invoice || "—"}</td>
        </tr>;
      })}</tbody>
    </table>
    {!entries.length && <p className="p-6 text-center text-sm text-ll-ink-subtle">{emptyMessage}</p>}
  </div>;
}

export default function WavePayInventory({ lang }) {
  const [dates, setDates] = useState(() => waveDefaultDates(codaQuickDates("month")));
  const [draft, setDraft] = useState(dates);
  const [phone, setPhone] = useState(null); const [query, setQuery] = useState(""); const [search, setSearch] = useState("");
  const [page, setPage] = useState(1); const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const alive = useRef(false); const generation = useRef(0);
  const viewKey = new URLSearchParams({ ...dates, search, page: String(page), ...(phone == null ? {} : { phone }) }).toString();
  const load = useCallback(async () => {
    const key = ++generation.current; setLoading(true); setError("");
    try {
      const result = await apiJson(`${endpoint}?${viewKey}`, { cache: "no-store" });
      if (!Array.isArray(result?.lines) || !Array.isArray(result.entries)) throw new Error("ข้อมูลไม่ครบ กรุณาโหลดใหม่");
      if (alive.current && key === generation.current) setData({ ...result, viewKey });
    } catch (e) { if (alive.current && key === generation.current) setError(e.message); }
    finally { if (alive.current && key === generation.current) setLoading(false); }
  }, [viewKey]);
  const invalidate = useCallback(() => { generation.current++; }, []);
  useEffect(() => { alive.current = true; const timer = setTimeout(load, 0); return () => { alive.current = false; invalidate(); clearTimeout(timer); }; }, [load, invalidate]);
  function apply(next) { setError(""); setPage(1); setDates(next); setDraft(next); setSearch(query); }
  function selectPhone(value) { setPage(1); setPhone((previous) => previous === value ? null : value); }
  const ready = data?.viewKey === viewKey;
  const selected = phone == null ? null : data?.lines.find((l) => l.phone === phone);
  return <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-4 pb-14 pt-10 text-ll-ink sm:px-6">
    <header className="flex flex-wrap items-center justify-between gap-4 pr-12">
      <div><p className="text-xs text-ll-ink-tertiary">TOPUP INVENTORY · MMK แยกตามเบอร์</p><h1 className="mt-2 text-3xl font-semibold">WavePay</h1><p className="mt-2 text-sm text-ll-ink-subtle">ออเดอร์ completed ที่จ่ายด้วย WavePay จาก codashop_orders แยกตามเบอร์ที่บอทใช้จ่าย</p></div>
      <Link href={topupInventoryPath(lang)} className={button}><ArrowLeft size={16} aria-hidden />กลับ Topup Inventory</Link>
    </header>
    <section aria-label="กรองข้อมูล" className="space-y-4 rounded-xl border border-ll-hairline bg-ll-surface-1 p-4">
      <div className="flex flex-wrap items-center gap-2">{[["today", "วันนี้"], ["yesterday", "เมื่อวาน"], ["month", "เดือนนี้"]].map(([preset, text]) => <button key={preset} disabled={loading} onClick={() => apply(codaQuickDates(preset))} className={button}>{text}</button>)}<span className="text-xs text-ll-ink-subtle">เวลาไทย · ไม่เกิน 93 วัน · เริ่มนับตั้งแต่ {WAVEPAY_START_DATE}</span></div>
      <form onSubmit={(e) => { e.preventDefault(); apply(draft); }} className="flex flex-wrap items-end gap-3">
        <label className="text-sm">ตั้งแต่วันที่<input required type="date" min={WAVEPAY_START_DATE} value={draft.dateFrom} onChange={(e) => setDraft({ ...draft, dateFrom: e.target.value })} className={input} /></label>
        <label className="text-sm">ถึงวันที่<input required type="date" min={draft.dateFrom} value={draft.dateTo} onChange={(e) => setDraft({ ...draft, dateTo: e.target.value })} className={input} /></label>
        <label className="min-w-0 basis-full text-sm sm:flex-1 sm:basis-64">ค้นหา Order / เกม / แพ็ก / ลูกค้า<input value={query} onChange={(e) => setQuery(e.target.value)} className={input} /></label>
        <button disabled={loading} className={button}>ใช้ตัวกรอง</button>
        <button type="button" disabled={loading} onClick={load} className={button}><RefreshCw size={16} aria-hidden />โหลดใหม่</button>
      </form>
      <p className="text-xs text-ll-ink-subtle">ช่วงที่แสดง: {ready ? data.dateFrom : dates.dateFrom} ถึง {dates.dateTo} (ค.ศ.){ready && data.dateFrom !== dates.dateFrom ? ` · ก่อน ${WAVEPAY_START_DATE} ไม่นับ` : ""}{search ? ` · ค้นหา: ${search}` : ""}</p>
    </section>
    {error && <p role="alert" className="rounded-xl border border-ll-hairline p-4 text-sm">{error}</p>}
    {loading && <p role="status" className="text-sm text-ll-ink-subtle">กำลังโหลด… (ช่วงวันที่ยาวอาจใช้เวลาสักครู่)</p>}
    {data && <>
      <section aria-label="ยอดแต่ละเบอร์" aria-busy={loading} className={`grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 ${loading ? "opacity-50" : ""}`}>
        {data.lines.map((line) => <LineCard key={line.phone || "unknown"} line={line} active={phone === line.phone} onSelect={() => selectPhone(line.phone)} />)}
      </section>
      <p className="text-xs leading-6 text-ll-ink-subtle">ยอดคงเหลือ = newBalance ของออเดอร์ล่าสุดของเบอร์นั้น (ไม่ขึ้นกับช่วงวันที่) · MMK ออก = ยอดก่อน − หลังจากกระเป๋า WavePay (ถ้าไม่มีใช้ราคาแพ็ก) · MMK ออก / ยอดโอน / ต้นทุน / กำไร เป็นยอดตามช่วงวันที่ · ต้นทุน = MMK ออก ÷ {WAVEPAY_MMK_PER_THB} (THB) · นับเฉพาะออเดอร์ตั้งแต่ {WAVEPAY_START_DATE} · ยอดโอนสกุลอื่นแปลงด้วยเรทอ้างอิงวันนี้ ไม่ได้ล็อกเรทแบบ USDCodashop · ออเดอร์หลายแพ็กหารยอดโอนต่อแพ็ก</p>
      <section className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-xl font-semibold">{phone == null ? "ออเดอร์ทุกเบอร์" : `ออเดอร์เบอร์ ${wavePhoneLabel(phone)}`}</h2>
          <p className="text-xs text-ll-ink-subtle">{ready ? `${data.total.toLocaleString("en-US")} รายการ` : "กำลังโหลด…"}{phone != null && <> · <button type="button" onClick={() => selectPhone(phone)} className="underline underline-offset-4">ดูทุกเบอร์</button></>}{selected == null && phone != null && ready && " · ไม่มีออเดอร์ในช่วงนี้"}</p>
        </div>
        <div aria-busy={loading} className={loading ? "pointer-events-none opacity-50" : ""}><OrdersTable entries={ready ? data.entries : []} emptyMessage={ready ? "ไม่พบออเดอร์ตามตัวกรอง" : "กำลังโหลด…"} /></div>
        <nav aria-label="หน้าออเดอร์" className="flex items-center justify-end gap-3 text-sm"><button disabled={loading || page <= 1} onClick={() => setPage(page - 1)} className={button}>ก่อนหน้า</button><span>หน้า {page}</span><button disabled={loading || !ready || page * data.pageSize >= data.total} onClick={() => setPage(page + 1)} className={button}>ถัดไป</button></nav>
      </section>
    </>}
  </main>;
}
