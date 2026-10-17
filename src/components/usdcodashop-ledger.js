"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, RefreshCw, Plus, Download } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { topupInventoryPath } from "@/lib/topup-inventory";
import { CODA_BOUNDARY, CODA_OPENING } from "@/lib/usdcodashop-ledger";
import UsdCodashopSheetTable from "@/components/usdcodashop-sheet-table";
import UsdCodashopOverviewTable from "@/components/usdcodashop-overview-table";
import { codaPeriodDates } from "@/lib/usdcodashop-report";
import { codaQuickDates } from "@/lib/usdcodashop-overview";

const endpoint = "/api/projectm/usdcodashop/ledger";
const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-ll-hairline-strong bg-ll-surface-1 px-4 text-sm text-ll-ink hover:bg-ll-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ll-primary disabled:opacity-50";
const input = "mt-2 min-h-11 w-full rounded-lg border border-ll-hairline-strong bg-ll-surface-1 px-3 text-sm text-ll-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ll-primary";
const money = (v) => v == null ? "—" : Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const date = (v) => v ? new Date(v).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" }) : "—";

export default function UsdCodashopLedger({ lang }) {
  const [data, setData] = useState(null); const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true);
  const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const [opening, setOpening] = useState(CODA_OPENING); const [confirmed, setConfirmed] = useState(false);
  const [query, setQuery] = useState(""); const [search, setSearch] = useState(""); const [page, setPage] = useState(1);
  const [periodMode, setPeriodMode] = useState("all"); const [periodValue, setPeriodValue] = useState(""); const [periodEnd, setPeriodEnd] = useState("");
  const [dates, setDates] = useState({ dateFrom: "", dateTo: "" }); const [exporting, setExporting] = useState(false);
  const [kind, setKind] = useState("order");
  const [deposit, setDeposit] = useState(null);
  const [observedAt, setObservedAt] = useState(null);
  const lock = useRef(false); const alive = useRef(false); const generation = useRef(0);
  const load = useCallback(async () => {
    const key = ++generation.current; setLoading(true); setError("");
    try {
      const viewKey = new URLSearchParams({ search, page: String(page), ...dates, kind }).toString();
      const result = await apiJson(`${endpoint}?${viewKey}`, { cache: "no-store" });
      if (typeof result?.configured !== "boolean" || !Array.isArray(result.entries)) throw new Error("ข้อมูลไม่ครบ กรุณาโหลดใหม่");
      if (alive.current && key === generation.current) { setData({ ...result, viewKey }); setObservedAt(Date.now()); }
    } catch (e) { if (alive.current && key === generation.current) setError(e.message); }
    finally { if (alive.current && key === generation.current) setLoading(false); }
  }, [search, page, dates, kind]);
  const invalidate = useCallback(() => { generation.current++; }, []);
  useEffect(() => { alive.current = true; const timer = setTimeout(load, 0); return () => { alive.current = false; invalidate(); clearTimeout(timer); }; }, [load, invalidate]);
  useEffect(() => {
    if (!data?.configured || deposit) return;
    const timer = setInterval(() => { if (!document.hidden && !lock.current) load(); }, 30_000);
    return () => clearInterval(timer);
  }, [data?.configured, deposit, load]);
  async function mutate(body) {
    if (lock.current) return;
    lock.current = true; generation.current++; setBusy(true); setError(""); setNotice("");
    try {
      const result = await apiJson(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if ((body.action === "sync" && (!Number.isInteger(result?.added) || !Number.isInteger(result?.checked))) ||
          (body.action === "setup" && result?.configured !== true) || (body.action === "deposit" && !result?.id)) throw new Error("เซิร์ฟเวอร์ยืนยันไม่ครบ กรุณาโหลดประวัติก่อนทำรายการซ้ำ");
      if (!alive.current) return;
      setNotice(body.action === "sync" ? `ซิงก์แล้ว: เพิ่ม ${result.added} รายการ ตรวจ ${result.checked} รายการ (ไม่นับซ้ำ)` : "บันทึกแล้ว");
      setDeposit(null); await load();
    } catch (e) { if (alive.current) setError(e.message); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  function applyFilters(event) {
    event.preventDefault();
    try {
      const nextDates = codaPeriodDates(periodMode, periodValue, periodEnd);
      invalidate(); setError(""); setPage(1); setSearch(query); setDates(nextDates);
    } catch (e) { setError(e.message); }
  }
  function quickFilter(preset) {
    const nextDates = codaQuickDates(preset);
    invalidate(); setError(""); setPage(1); setSearch(query); setDates(nextDates);
    setPeriodMode("range"); setPeriodValue(nextDates.dateFrom); setPeriodEnd(nextDates.dateTo);
  }
  async function exportCsv() {
    if (exporting) return;
    setExporting(true); setError("");
    try {
      const response = await fetch(`${endpoint}?${new URLSearchParams({ search, ...dates, kind, format: "csv" })}`, { cache: "no-store" });
      if (!response.ok || !response.headers.get("content-type")?.startsWith("text/csv")) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || body?.message || "Export ไม่สำเร็จ กรุณาลองใหม่");
      }
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a"); anchor.href = url;
      anchor.download = `usdcodashop-${dates.dateFrom || "all"}-${dates.dateTo || "all"}.csv`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      if (alive.current) setNotice("ส่งออก CSV แล้ว รวมทุกรายการตามตัวกรองที่ใช้ ไม่ใช่เฉพาะหน้าปัจจุบัน");
    } catch (e) { if (alive.current) setError(e.message); }
    finally { if (alive.current) setExporting(false); }
  }
  const worker = data?.autoSync;
  const workerFresh = worker && observedAt - new Date(worker.heartbeat).getTime() < 180_000;
  const workerLabel = !worker ? "ยังไม่พบ worker" : !workerFresh ? "ไม่ได้รับสถานะเกิน 3 นาที โปรดตรวจ worker" :
    ({ ok: "ทำงานปกติ", syncing: "กำลังซิงก์", error: "ซิงก์ติดขัด", waiting: "รอยืนยันยอดยกมา", stopped: "หยุดทำงาน" }[worker.state] || "รอตรวจสอบ");
  const historyReady = data?.viewKey === new URLSearchParams({ search, page: String(page), ...dates, kind }).toString();
  const summary = historyReady ? data?.summary : null;
  const filteredLabel = dates.dateFrom ? `${dates.dateFrom} ถึง ${dates.dateTo} (ค.ศ.)` : "ทุกวันที่";
  const pending = loading || busy;
  const summaryCards = kind === "deposit" ? [
    ["USD คงเหลือล่าสุด", data?.remaining, "USD · จากบอทล่าสุด ไม่ขึ้นกับตัวกรอง"],
    ["USD เข้าตามตัวกรอง", summary?.depositUsd, "USD · เฉพาะยอดบันทึกยืนยันในระบบนี้"],
  ] : [
    ["USD คงเหลือล่าสุด", data?.remaining, "USD · จากบอทล่าสุด ไม่ขึ้นกับตัวกรอง"],
    ["ยอดโอนลูกค้า", summary?.sale, "THB · ตามตัวกรอง รวมทุกหน้า"],
    ["ต้นทุน", summary?.cost, "THB · ตามตัวกรอง รวมทุกหน้า"],
    ["กำไร", summary?.profit, "THB · ยอดโอน − ต้นทุน ตามตัวกรอง"],
  ];
  const filters = <section aria-label="กรองประวัติ" className="space-y-4 rounded-xl border border-ll-hairline bg-ll-surface-1 p-4">
    <div className="flex flex-wrap items-center gap-2">{[["today", "วันนี้"], ["yesterday", "เมื่อวาน"], ["month", "เดือนนี้"]].map(([preset, text]) => <button key={preset} disabled={pending || exporting} onClick={() => quickFilter(preset)} className={button}>{text}</button>)}<span className="text-xs text-ll-ink-subtle">เวลาไทย</span></div>
    <form onSubmit={applyFilters} className="flex flex-wrap items-end gap-3">
      <label className="min-w-0 basis-full text-sm sm:flex-1 sm:basis-64">ค้นหา Order / เกม / แพ็ก / ผู้ทำรายการ<input value={query} onChange={(e) => setQuery(e.target.value)} className={input} /></label>
      <label className="text-sm">กรองตาม<select aria-label="กรองตาม" value={periodMode} onChange={(e) => { setPeriodMode(e.target.value); setPeriodValue(""); setPeriodEnd(""); }} className={input}><option value="all">ทุกวันที่</option><option value="day">วันที่</option><option value="month">เดือน</option><option value="year">ปี</option><option value="range">ช่วงวันที่</option></select></label>
      {periodMode !== "all" && <label className="text-sm">{({ day: "วันที่", month: "เดือน / ปี", year: "ปี (ค.ศ.)", range: "ตั้งแต่วันที่" })[periodMode]}<input required type={periodMode === "month" ? "month" : periodMode === "year" ? "number" : "date"} min={periodMode === "year" ? "1000" : periodMode === "month" ? "1000-01" : "1000-01-01"} max={periodMode === "year" ? "9998" : periodMode === "month" ? "9998-12" : "9998-12-31"} value={periodValue} onChange={(e) => setPeriodValue(e.target.value)} className={input} /></label>}
      {periodMode === "range" && <label className="text-sm">ถึงวันที่<input required type="date" min={periodValue || "1000-01-01"} max="9998-12-31" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className={input} /></label>}
      <button disabled={pending || exporting} className={button}>ใช้ตัวกรอง</button>
      <button type="button" disabled={pending || exporting} onClick={() => { invalidate(); setQuery(""); setSearch(""); setPeriodMode("all"); setPeriodValue(""); setPeriodEnd(""); setDates({ dateFrom: "", dateTo: "" }); setPage(1); setError(""); }} className={button}>ล้างตัวกรอง</button>
      <button type="button" disabled={pending || exporting || !historyReady || !data?.total || Boolean(error)} onClick={exportCsv} className={button}><Download size={16} aria-hidden />{exporting ? "กำลัง Export…" : "Export CSV"}</button>
    </form>
    <p className="text-xs text-ll-ink-subtle">ตัวกรองที่ใช้: {filteredLabel}{search ? ` · ค้นหา: ${search}` : ""} · กดใช้ตัวกรองก่อน Export</p>
  </section>;
  return <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-4 pb-14 pt-10 text-ll-ink sm:px-6">
    <header className="flex flex-wrap items-center justify-between gap-4 pr-12">
      <div><p className="text-xs text-ll-ink-tertiary">TOPUP INVENTORY · SINGLE USD WALLET</p><h1 className="mt-2 text-3xl font-semibold">USDCodashop</h1><p className="mt-2 text-sm text-ll-ink-subtle">บัญชีเดียว · ประวัติรับเข้า–จ่ายออกจาก codashop_orders</p></div>
      <Link href={topupInventoryPath(lang)} className={button}><ArrowLeft size={16} aria-hidden />กลับ Topup Inventory</Link>
    </header>
    {error && <p role="alert" className="rounded-xl border border-ll-hairline p-4 text-sm">{error}</p>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
    {loading && <p role="status" className="text-sm text-ll-ink-subtle">กำลังโหลดประวัติ…</p>}
    {!data && !loading && <button onClick={load} className={button}>ลองโหลดใหม่</button>}
    {data && !data.configured && <section className="rounded-xl border border-ll-hairline bg-ll-surface-1 p-5">
      <h2 className="text-xl font-semibold">เริ่มบัญชี USDCodashop</h2>
      <p className="mt-3 text-sm leading-7 text-ll-ink-subtle">นับเฉพาะรายการ completed ที่ใช้ CodashopUSD และมีเลขรายการภายในหลัง {CODA_BOUNDARY} โดยไม่รวมรายการอ้างอิง ยอดคงเหลือหลักใช้ balance_after จากบอท ยอดยกมาเป็นข้อมูลบัญชีสำหรับตรวจสอบเท่านั้น ข้อมูลเดิมยังเก็บไว้โดยไม่แก้ไข</p>
      {data.canManage ? <form onSubmit={(e) => { e.preventDefault(); mutate({ action: "setup", boundary: CODA_BOUNDARY, opening, confirm: confirmed }); }} className="mt-5 space-y-4">
        <label className="block max-w-sm text-sm">ยอดยกมาหลัง {CODA_BOUNDARY} (USD)<input required inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} disabled={busy} className={input} /></label>
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" required checked={confirmed} disabled={busy} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1 h-5 w-5 shrink-0" />ยืนยันยอดยกมาเป็นยอดหลังรายการนี้แล้ว และจะไม่เปลี่ยนยอดเริ่มต้นทับประวัติภายหลัง</label>
        <button disabled={busy || !confirmed} className={button}>ยืนยันเริ่มบัญชี</button>
      </form> : <p className="mt-4 text-sm">ให้ Projectm Admin ยืนยันยอดยกมาก่อนใช้งาน</p>}
    </section>}
    {data?.configured && <>
      {filters}
      <div role="group" aria-label="ประเภทประวัติ" className="flex flex-wrap gap-2">{[["order", "รายการใช้เงิน"], ["deposit", "รายการเติมเงิน"], ["all", "ทั้งหมด"]].map(([value, text]) => <button key={value} aria-pressed={kind === value} disabled={pending || exporting} onClick={() => { invalidate(); setKind(value); setPage(1); }} className={`${button} ${kind === value ? "border-ll-primary ring-1 ring-ll-primary" : ""}`}>{text}</button>)}</div>
      <section aria-label="สรุปยอด" aria-busy={loading} className={`grid grid-cols-2 gap-3 ${kind === "deposit" ? "" : "lg:grid-cols-4"}`}>
        {summaryCards.map(([heading, value, help]) => <div key={heading} className="min-w-0 rounded-xl border border-ll-hairline bg-ll-surface-1 p-4"><p className="text-sm text-ll-ink-subtle">{heading}</p><p className="mt-2 break-words text-2xl font-semibold tabular-nums">{loading ? "…" : money(value)}</p><p className="mt-2 text-xs leading-5 text-ll-ink-subtle">{help}</p></div>)}
      </section>
      <p className="text-xs text-ll-ink-subtle">ยอดบอท ณ {date(data.balanceAsOf)}{data.balanceOrderId ? ` · Order ${data.balanceOrderId}` : ""} · ยอดโอน/ต้นทุน/กำไรเป็นยอดตามแท็บและตัวกรอง ไม่ใช่ยอดคงเหลือ</p>
      {kind !== "deposit" && historyReady && !loading && <p role={data.costQuote ? undefined : "status"} className="rounded-xl border border-ll-hairline bg-ll-surface-1 p-3 text-xs leading-6 text-ll-ink-subtle">{data.costQuote ? <>ต้นทุน = USD ออก × {data.costQuote.rate} THB/USD · {data.costQuote.source} · วันที่เรท {date(data.costQuote.rateAt)} · ดึงเมื่อ {date(data.costQuote.fetchedAt)} · เรทอ้างอิงล่าสุดที่ผู้ให้บริการมี อัปเดตแคชทุก 15 นาที ไม่ใช่ GOOGLEFINANCE โดยตรง ตัวเลขอาจต่างจากชีท และกำไรย้อนหลังเปลี่ยนตามเรทนี้</> : <>ยังดึงเรทต้นทุน USD→THB ไม่สำเร็จ ต้นทุนและกำไรจะแสดง — โดยไม่ใช้ cost_thb เดิมแทน ยอด USD ออกและยอดบอทยังแสดงตามต้นทาง</>}</p>}
      {!loading && summary && (summary.missingSales > 0 || summary.missingCosts > 0 || summary.duplicateOrders > 0 || summary.duplicateTransactions > 0) && <p role="status" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-ll-ink">ต้องตรวจสอบตามตัวกรอง: ยอดโอนไม่ครบ {summary.missingSales} รายการ · ต้นทุนไม่ครบ {summary.missingCosts} รายการ · คิวซ้ำ {summary.duplicateOrders} รายการ · ธุรกรรมซ้ำ {summary.duplicateTransactions} รายการ{(summary.missingSales > 0 || summary.missingCosts > 0) && " · ยอดสรุปที่ข้อมูลไม่ครบแสดง — ไม่รวมเป็นศูนย์"}</p>}
      {data.remaining == null && <p role="status" className="rounded-xl border border-ll-hairline p-4 text-sm">ยังไม่มี balance_after ที่ถูกต้องของ Order ล่าสุด ยอดคงเหลือหลักแสดง — ไม่ใช้ยอดคำนวณหรือยอดบอทของ Order เก่าแทน</p>}
      {data.remaining != null && Number(data.remaining) < 0 && <p role="alert" className="rounded-xl border border-ll-hairline p-4 text-sm">ยอด balance_after จากบอทติดลบ กรุณาตรวจสอบต้นทาง</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={busy || loading} onClick={load} className={button}><RefreshCw size={16} aria-hidden />โหลดประวัติ</button>
        {data.canManage && <><button disabled={busy || loading || Boolean(deposit)} onClick={() => mutate({ action: "sync" })} className={button}><RefreshCw size={16} aria-hidden />ซิงก์ Orders</button><button disabled={busy || Boolean(deposit)} onClick={() => { setDeposit({ amount: "", note: "", requestId: crypto.randomUUID() }); setError(""); }} className={button}><Plus size={16} aria-hidden />บันทึก USD เข้า</button></>}
        <p className="text-xs text-ll-ink-subtle">ซิงก์ล่าสุด: {date(data.lastSync)}</p>
      </div>
      <section aria-label="สถานะซิงก์อัตโนมัติ" className="text-xs text-ll-ink-subtle">
        <p className="font-medium">ซิงก์อัตโนมัติทุก 60 วินาที · {workerLabel}</p>
        {worker?.error_message && <p role="alert" className="mt-2">{worker.error_message}</p>}
      </section>
      {deposit && <form className="space-y-4 rounded-xl border border-ll-hairline bg-ll-surface-1 p-5" onSubmit={(e) => { e.preventDefault(); mutate({ action: "deposit", ...deposit }); }}>
        <h2 className="text-lg font-semibold">บันทึก USD ที่เข้าบัญชีจริงแล้ว</h2>
        <p className="text-sm text-ll-ink-subtle">เป็นการบันทึกบัญชีเท่านั้น ไม่ใช่การโอนเงิน ลงวันที่ปัจจุบัน และไม่บวกทับ balance_after จากบอท ยอดบอทจะเปลี่ยนตามข้อมูลต้นทางเมื่อซิงก์</p>
        <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2"><label className="text-sm">จำนวน USD<input autoFocus required inputMode="decimal" value={deposit.amount} onChange={(e) => setDeposit({ ...deposit, amount: e.target.value })} className={input} /></label><label className="text-sm">หมายเหตุ/เลขอ้างอิง<input required maxLength={300} value={deposit.note} onChange={(e) => setDeposit({ ...deposit, note: e.target.value })} className={input} /></label></fieldset>
        <div className="flex gap-3"><button disabled={busy} className={button}>ยืนยันบันทึก USD เข้า</button><button type="button" disabled={busy} onClick={() => setDeposit(null)} className={button}>ยกเลิก</button></div>
      </form>}
      <section className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2"><h2 className="text-xl font-semibold">{kind === "deposit" ? "รายการเติมเงิน" : kind === "order" ? "รายการใช้เงิน" : "ประวัติทั้งหมด"}</h2><p className="text-xs text-ll-ink-subtle">{loading ? "กำลังโหลด…" : historyReady ? `${data.total} รายการ` : "ยังโหลดตัวกรองนี้ไม่สำเร็จ"} · กด Order เพื่อดูรายละเอียด</p></div>
        <div aria-busy={loading} className={loading ? "pointer-events-none opacity-50" : ""}>
          <UsdCodashopOverviewTable entries={historyReady ? data.entries : []} emptyMessage={!historyReady ? loading ? "กำลังโหลดประวัติ…" : "โหลดประวัติไม่สำเร็จ กรุณาลองใหม่" : search || dates.dateFrom ? "ไม่พบรายการตามตัวกรอง" : kind === "deposit" ? "ยังไม่มีประวัติเติมเงินที่บันทึกในระบบนี้" : "ยังไม่มีประวัติ กดซิงก์ Orders เพื่อดึงรายการ"} />
        </div>
        <nav aria-label="หน้าประวัติ" className="flex items-center justify-end gap-3 text-sm"><button disabled={busy || loading || page <= 1} onClick={() => setPage(page - 1)} className={button}>ก่อนหน้า</button><span>หน้า {page}</span><button disabled={busy || loading || page * 100 >= data.total} onClick={() => setPage(page + 1)} className={button}>ถัดไป</button></nav>
      </section>
      <details className="rounded-xl border border-ll-hairline bg-ll-surface-1 p-4 text-sm"><summary className="cursor-pointer">รายละเอียดบัญชีและวิธีคำนวณ</summary><div className="mt-4 space-y-3 text-xs leading-6 text-ll-ink-subtle">
        <p>นับหลัง {data.boundary} · ยอดยกมา {money(data.opening)} USD · USD เข้า {money(data.deposits)} · USD ออก {money(data.used)} (ยอดบัญชีทั้งหมด ไม่ขึ้นกับตัวกรอง)</p>
        <p>คงเหลือตามบัญชี (ตรวจสอบ): {money(data.calculatedRemaining)} USD · USD คงเหลือหลักใช้ balance_after จากบอทหลัง Order ล่าสุด ไม่ใช่ยอดสดจาก Codashop และไม่บวกเงินเข้าทับยอดบอท</p>
        <p>ยอดโอนลูกค้าต่างสกุลแปลงด้วยเรทอ้างอิง ณ ซิงก์ครั้งแรก ไม่ใช่เรทรับเงินจริงย้อนหลัง · ต้นทุนที่แสดง = USD ออก × เรท USD→THB ล่าสุด (ปัดต้นทุนแต่ละ Order เป็น 2 ตำแหน่ง) · กำไร = ยอดโอน − ต้นทุน · ถ้าข้อมูลไม่ครบจะแสดง — ไม่แทนด้วยศูนย์</p>
        <p>ต้นทุนใช้ Frankfurter/ECB ไม่ใช่ GOOGLEFINANCE จึงอาจไม่เท่าชีททุกจุดทศนิยม เมื่อเรทเปลี่ยนต้นทุนและกำไรที่แสดงจะเปลี่ยนด้วย ส่วน cost_thb เดิมไม่ถูกเขียนทับ เปิดดูได้ในรายละเอียด Order</p>
        <p>USD เข้าแสดงเฉพาะยอดที่บันทึกยืนยันในระบบนี้ ยังไม่เชื่อม prepayment ledger อัตโนมัติ</p>
        <p>สำเร็จล่าสุด: {date(worker?.last_success)} · worker ทำงานได้แม้ปิดเว็บ หน้านี้โหลดใหม่ทุก 30 วินาที หยุดโหลดระหว่างกรอกเงินเข้า</p>
        <p>Export CSV รวมทุกหน้าตามแท็บ คำค้นหา และช่วงวันที่ สูงสุด 50,000 รายการ เปิดด้วย Excel / Google Sheets ได้</p>
      </div></details>
      <details className="min-w-0 text-sm"><summary className="cursor-pointer py-2">ดูตารางแบบชีท (ทุกคอลัมน์)</summary><div className="mt-3"><UsdCodashopSheetTable entries={historyReady ? data.entries : []} emptyMessage="ไม่พบรายการตามตัวกรอง" /></div></details>
    </>}
  </main>;
}
