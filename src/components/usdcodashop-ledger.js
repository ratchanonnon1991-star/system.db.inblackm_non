"use client";

import { TablePagination } from "@/components/table-pagination";
import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, Plus, Download } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { createInventoryReadSession, inventoryPollDelay } from "@/lib/inventory-read-session";
import TopupInventoryPage from "@/components/topup-inventory-page";
import { tivButton as button, tivCheck, tivField, tivInput as input, tivPrimary } from "@/lib/topup-inventory-ui";
import { CODA_BOUNDARY, CODA_OPENING } from "@/lib/usdcodashop-ledger";
import UsdCodashopSheetTable from "@/components/usdcodashop-sheet-table";
import UsdCodashopOverviewTable from "@/components/usdcodashop-overview-table";
import { codaPeriodDates } from "@/lib/usdcodashop-report";
import { codaQuickDates } from "@/lib/usdcodashop-overview";
import { codaProfitFilter, codaProfitLabel, CODA_PROFIT_OPTIONS } from "@/lib/usdcodashop-profit-filter";

const endpoint = "/api/projectm/usdcodashop/ledger";
const money = (v) => v == null ? "—" : Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const date = (v) => v ? new Date(v).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" }) : "—";

export default function UsdCodashopLedger({ lang }) {
  const [data, setData] = useState(null); const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true);
  const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const [opening, setOpening] = useState(CODA_OPENING); const [confirmed, setConfirmed] = useState(false);
  const [query, setQuery] = useState(""); const [search, setSearch] = useState(""); const [page, setPage] = useState(1);
  const [periodMode, setPeriodMode] = useState("all"); const [periodValue, setPeriodValue] = useState(""); const [periodEnd, setPeriodEnd] = useState("");
  const [dates, setDates] = useState({ dateFrom: "", dateTo: "" }); const [exporting, setExporting] = useState(false);
  const [pageSize, setPageSize] = useState(25);
  const [kind, setKind] = useState("order");
  const [profitDraft, setProfitDraft] = useState(() => codaProfitFilter());
  const [profitFilter, setProfitFilter] = useState(() => codaProfitFilter());
  const [deposit, setDeposit] = useState(null);
  const [observedAt, setObservedAt] = useState(null);
  const lock = useRef(false); const alive = useRef(false); const generation = useRef(0);
  const [reader] = useState(() => createInventoryReadSession());
  const exportRequest = useRef(null);
  const load = useCallback(async () => {
    const key = ++generation.current; setLoading(true); setError("");
    try {
      const viewKey = new URLSearchParams({ search, page: String(page), pageSize: String(pageSize), ...dates, kind, ...profitFilter }).toString();
      const result = await reader.run(viewKey, `${endpoint}?${viewKey}`);
      if (typeof result?.configured !== "boolean" || !Array.isArray(result.entries)) throw new Error("ข้อมูลไม่ครบ กรุณาโหลดใหม่");
      if (alive.current && key === generation.current) { setData({ ...result, viewKey }); setObservedAt(Date.now()); const lastPage = Math.max(1, Math.ceil(Number(result.total || 0) / pageSize)); if (page > lastPage) setPage(lastPage); }
      return true;
    } catch (e) { if (alive.current && key === generation.current && e.name !== "AbortError") setError(e.message); return false; }
    finally { if (alive.current && key === generation.current) setLoading(false); }
  }, [search, page, pageSize, dates, kind, profitFilter, reader]);
  const invalidate = useCallback(() => { generation.current++; reader.cancel(); }, [reader]);
  useEffect(() => { alive.current = true; const timer = setTimeout(load, 0); return () => { alive.current = false; invalidate(); clearTimeout(timer); }; }, [load, invalidate]);
  useEffect(() => {
    if (!data?.configured || deposit || exporting) return;
    let stopped = false, failures = 0, timer;
    const poll = async () => {
      if (!document.hidden && !lock.current) failures = await load() ? 0 : failures + 1;
      if (!stopped) timer = setTimeout(poll, inventoryPollDelay(failures));
    };
    timer = setTimeout(poll, inventoryPollDelay(0));
    return () => { stopped = true; clearTimeout(timer); };
  }, [data?.configured, deposit, exporting, load]);
  useEffect(() => () => exportRequest.current?.abort(), []);
  async function mutate(body) {
    if (lock.current) return;
    lock.current = true; invalidate(); setLoading(false); setBusy(true); setError(""); setNotice("");
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
      const nextProfit = codaProfitFilter(profitDraft);
      invalidate(); setError(""); setPage(1); setSearch(query); setDates(nextDates);
      setProfitFilter(nextProfit);
      if (kind === "deposit" && (nextProfit.profitStatus !== "all" || nextProfit.profitMin || nextProfit.profitMax)) setKind("order");
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
    const controller = new AbortController(); exportRequest.current = controller;
    const deadline = setTimeout(() => controller.abort(), 90_000);
    try {
      const response = await fetch(`${endpoint}?${new URLSearchParams({ search, ...dates, kind, ...profitFilter, format: "csv" })}`, { cache: "no-store", signal: controller.signal });
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
    } catch (e) { if (alive.current) setError(e.name === "AbortError" ? "Export นานเกินกำหนด กรุณาลดช่วงวันที่แล้วลองใหม่" : e.message); }
    finally { clearTimeout(deadline); if (exportRequest.current === controller) exportRequest.current = null; if (alive.current) setExporting(false); }
  }
  const worker = data?.autoSync;
  const workerFresh = worker && observedAt - new Date(worker.heartbeat).getTime() < 180_000;
  const workerLabel = !worker ? "ยังไม่พบ worker" : !workerFresh ? "ไม่ได้รับสถานะเกิน 3 นาที โปรดตรวจ worker" :
    ({ ok: "ทำงานปกติ", syncing: "กำลังซิงก์", error: "ซิงก์ติดขัด", waiting: "รอยืนยันยอดยกมา", stopped: "หยุดทำงาน" }[worker.state] || "รอตรวจสอบ");
  const historyReady = data?.viewKey === new URLSearchParams({ search, page: String(page), pageSize: String(pageSize), ...dates, kind, ...profitFilter }).toString();
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
  const quick = Object.entries({ today: "วันนี้", yesterday: "เมื่อวาน", month: "เดือนนี้" }).map(([preset, text]) => ({ preset, text, on: Object.entries(codaQuickDates(preset)).every(([k, v]) => dates[k] === v) }));
  const filters = <section aria-label="กรองประวัติ" className="tiv-card">
    <div className="tiv-tools">{quick.map(({ preset, text, on }) => <button key={preset} disabled={pending || exporting} aria-pressed={on} onClick={() => quickFilter(preset)} className={`${button}${on ? " on" : ""}`}>{text}</button>)}<span className="tiv-muted">เวลาไทย</span></div>
    <form onSubmit={applyFilters} className="mt-4">
      <div className="tiv-fields">
        <label className={tivField}><span>ค้นหา Order / เกม / แพ็ก / ผู้ทำรายการ</span><input value={query} onChange={(e) => setQuery(e.target.value)} className={input} /></label>
        <label className={tivField}><span>กรองตาม</span><select aria-label="กรองตาม" value={periodMode} onChange={(e) => { setPeriodMode(e.target.value); setPeriodValue(""); setPeriodEnd(""); }} className={input}><option value="all">ทุกวันที่</option><option value="day">วันที่</option><option value="month">เดือน</option><option value="year">ปี</option><option value="range">ช่วงวันที่</option></select></label>
        {periodMode !== "all" && <label className={tivField}><span>{({ day: "วันที่", month: "เดือน / ปี", year: "ปี (ค.ศ.)", range: "ตั้งแต่วันที่" })[periodMode]}</span><input required type={periodMode === "month" ? "month" : periodMode === "year" ? "number" : "date"} min={periodMode === "year" ? "1000" : periodMode === "month" ? "1000-01" : "1000-01-01"} max={periodMode === "year" ? "9998" : periodMode === "month" ? "9998-12" : "9998-12-31"} value={periodValue} onChange={(e) => setPeriodValue(e.target.value)} className={input} /></label>}
        {periodMode === "range" && <label className={tivField}><span>ถึงวันที่</span><input required type="date" min={periodValue || "1000-01-01"} max="9998-12-31" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className={input} /></label>}
        <label className={tivField}><span>กำไร</span><select aria-label="กรองกำไร" value={profitDraft.profitStatus} onChange={(e) => setProfitDraft({ ...profitDraft, profitStatus: e.target.value, ...(e.target.value === "missing" ? { profitMin: "", profitMax: "" } : {}) })} className={input}>{CODA_PROFIT_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className={tivField}><span>หน่วยกำไร</span><select aria-label="หน่วยกำไร" value={profitDraft.profitUnit} onChange={(e) => setProfitDraft({ ...profitDraft, profitUnit: e.target.value })} className={input}><option value="thb">บาท (THB)</option><option value="percent">เปอร์เซ็นต์ (%)</option></select></label>
        <label className={tivField}><span>กำไรต่ำสุด</span><input aria-label="กำไรต่ำสุด" type="number" step="0.01" value={profitDraft.profitMin} disabled={profitDraft.profitStatus === "missing"} onChange={(e) => setProfitDraft({ ...profitDraft, profitMin: e.target.value })} placeholder="ไม่จำกัด" className={`${input} num`} /></label>
        <label className={tivField}><span>กำไรสูงสุด</span><input aria-label="กำไรสูงสุด" type="number" step="0.01" value={profitDraft.profitMax} disabled={profitDraft.profitStatus === "missing"} onChange={(e) => setProfitDraft({ ...profitDraft, profitMax: e.target.value })} placeholder="ไม่จำกัด" className={`${input} num`} /></label>
      </div>
      <div className="tiv-tools mt-4">
        <button disabled={pending || exporting} className={tivPrimary}>ใช้ตัวกรอง</button>
        <button type="button" disabled={pending || exporting} onClick={() => { invalidate(); setQuery(""); setSearch(""); setPeriodMode("all"); setPeriodValue(""); setPeriodEnd(""); setDates({ dateFrom: "", dateTo: "" }); setProfitDraft(codaProfitFilter()); setProfitFilter(codaProfitFilter()); setPage(1); setError(""); }} className={button}>ล้างตัวกรอง</button>
        <button type="button" disabled={pending || exporting || !historyReady || !data?.total || Boolean(error)} onClick={exportCsv} className={button}><Download size={16} aria-hidden />{exporting ? "กำลัง Export…" : "Export CSV"}</button>
      </div>
    </form>
    <p className="tiv-hint">ตัวกรองที่ใช้: {filteredLabel}{search ? ` · ค้นหา: ${search}` : ""} · {codaProfitLabel(profitFilter)} · กดใช้ตัวกรองก่อน Export</p>
    <p className="tiv-hint mt-1!">กำไร % = กำไร ÷ ยอดโอน × 100 · ช่วงตัวเลขรวมค่าต่ำสุดและสูงสุด · ตัวกรองกำไรใช้เฉพาะ Order และเปลี่ยนตามเรทต้นทุนล่าสุด ยอดโอนศูนย์ไม่มีเปอร์เซ็นต์กำไร</p>
  </section>;
  return <TopupInventoryPage provider="usdcodashop" description="บัญชีเดียว · ประวัติรับเข้า–จ่ายออกจาก codashop_orders">
    {error && <p role="alert" className="tiv-alert">{error}</p>}
    {notice && <p role="status" className="tiv-banner">{notice}</p>}
    {loading && <p role="status" className="tiv-muted">กำลังโหลดประวัติ…</p>}
    {!data && !loading && <div><button onClick={load} className={button}>ลองโหลดใหม่</button></div>}
    {data && !data.configured && <section className="tiv-card">
      <div className="tiv-card-h"><h2>เริ่มบัญชี USDCodashop</h2></div>
      <p className="text-sm leading-7 text-ll-ink-subtle">นับเฉพาะรายการ completed ที่ใช้ CodashopUSD และมีเลขรายการภายในหลัง {CODA_BOUNDARY} โดยไม่รวมรายการอ้างอิง ยอดคงเหลือหลักใช้ balance_after จากบอท ยอดยกมาเป็นข้อมูลบัญชีสำหรับตรวจสอบเท่านั้น ข้อมูลเดิมยังเก็บไว้โดยไม่แก้ไข</p>
      {data.canManage ? <form onSubmit={(e) => { e.preventDefault(); mutate({ action: "setup", boundary: CODA_BOUNDARY, opening, confirm: confirmed }); }} className="mt-5 flex flex-col items-start gap-4">
        <label className={`${tivField} w-full max-w-sm`}><span>ยอดยกมาหลัง {CODA_BOUNDARY} (USD)</span><input required inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} disabled={busy} className={`${input} num`} /></label>
        <label className={tivCheck}><input type="checkbox" required checked={confirmed} disabled={busy} onChange={(e) => setConfirmed(e.target.checked)} className="shrink-0" />ยืนยันยอดยกมาเป็นยอดหลังรายการนี้แล้ว และจะไม่เปลี่ยนยอดเริ่มต้นทับประวัติภายหลัง</label>
        <button disabled={busy || !confirmed} className={tivPrimary}>ยืนยันเริ่มบัญชี</button>
      </form> : <p className="mt-4 text-sm">ให้ Projectm Admin ยืนยันยอดยกมาก่อนใช้งาน</p>}
    </section>}
    {data?.configured && <>
      <p className="tiv-muted">ข้อมูลประวัติเมื่อ {date(observedAt)}{error ? " · แสดงข้อมูลที่อ่านสำเร็จล่าสุด กรุณาโหลดประวัติใหม่" : ""}</p>
      {filters}
      <div role="group" aria-label="ประเภทประวัติ" className="tiv-tools">{[["order", "รายการใช้เงิน"], ["deposit", "รายการเติมเงิน"], ["all", "ทั้งหมด"]].map(([value, text]) => <button key={value} aria-pressed={kind === value} disabled={pending || exporting} onClick={() => { invalidate(); setKind(value); setPage(1); if (value === "deposit") { setProfitDraft(codaProfitFilter()); setProfitFilter(codaProfitFilter()); } }} className={`${button}${kind === value ? " on" : ""}`}>{text}</button>)}</div>
      <section aria-label="สรุปยอด" aria-busy={loading} className="tiv-kpis">
        {summaryCards.map(([heading, value, help]) => <div key={heading} className="tiv-kpi"><small>{heading}</small><b className={!loading && value == null ? "mut" : ""}>{loading ? "…" : money(value)}</b><p>{help}</p></div>)}
      </section>
      <p className="tiv-muted">ยอดบอท ณ {date(data.balanceAsOf)}{data.balanceOrderId ? ` · Order ${data.balanceOrderId}` : ""} · ยอดโอน/ต้นทุน/กำไรเป็นยอดตามแท็บและตัวกรอง ไม่ใช่ยอดคงเหลือ</p>
      {kind !== "deposit" && historyReady && !loading && <p role={data.costQuote ? undefined : "status"} className="tiv-banner leading-6">{data.costQuote ? <>ต้นทุน = USD ออก × {data.costQuote.rate} THB/USD · {data.costQuote.source} · วันที่เรท {date(data.costQuote.rateAt)} · ดึงเมื่อ {date(data.costQuote.fetchedAt)} · เรทอ้างอิงล่าสุดที่ผู้ให้บริการมี อัปเดตแคชทุก 15 นาที ไม่ใช่ GOOGLEFINANCE โดยตรง ตัวเลขอาจต่างจากชีท และกำไรย้อนหลังเปลี่ยนตามเรทนี้</> : <>ยังดึงเรทต้นทุน USD→THB ไม่สำเร็จ ต้นทุนและกำไรจะแสดง — โดยไม่ใช้ cost_thb เดิมแทน ยอด USD ออกและยอดบอทยังแสดงตามต้นทาง</>}</p>}
      {!loading && summary && (summary.missingSales > 0 || summary.missingCosts > 0 || summary.duplicateOrders > 0 || summary.duplicateTransactions > 0) && <p role="status" className="tiv-banner"><span className="tiv-warn">ต้องตรวจสอบตามตัวกรอง: ยอดโอนไม่ครบ {summary.missingSales} รายการ · ต้นทุนไม่ครบ {summary.missingCosts} รายการ · คิวซ้ำ {summary.duplicateOrders} รายการ · ธุรกรรมซ้ำ {summary.duplicateTransactions} รายการ{(summary.missingSales > 0 || summary.missingCosts > 0) && " · ยอดสรุปที่ข้อมูลไม่ครบแสดง — ไม่รวมเป็นศูนย์"}</span></p>}
      {data.remaining == null && <p role="status" className="tiv-banner">ยังไม่มี balance_after ที่ถูกต้องของ Order ล่าสุด ยอดคงเหลือหลักแสดง — ไม่ใช้ยอดคำนวณหรือยอดบอทของ Order เก่าแทน</p>}
      {data.remaining != null && Number(data.remaining) < 0 && <p role="alert" className="tiv-alert">ยอด balance_after จากบอทติดลบ กรุณาตรวจสอบต้นทาง</p>}
      <div className="tiv-tools">
        <button disabled={busy || loading} onClick={load} className={button}><RefreshCw size={16} aria-hidden />โหลดประวัติ</button>
        {data.canManage && <><button disabled={busy || loading || Boolean(deposit)} onClick={() => mutate({ action: "sync" })} className={tivPrimary}><RefreshCw size={16} aria-hidden />ซิงก์ Orders</button><button disabled={busy || Boolean(deposit)} onClick={() => { setDeposit({ amount: "", note: "", requestId: crypto.randomUUID() }); setError(""); }} className={button}><Plus size={16} aria-hidden />บันทึก USD เข้า</button></>}
        <p className="tiv-muted">ซิงก์ล่าสุด: {date(data.lastSync)}</p>
      </div>
      <section aria-label="สถานะซิงก์อัตโนมัติ" className="tiv-muted">
        <p className="font-medium">ซิงก์อัตโนมัติทุก 60 วินาที · {workerLabel}</p>
        {worker?.error_message && <p role="alert" className="tiv-alert mt-2">{worker.error_message}</p>}
      </section>
      {deposit && <form className="tiv-card" onSubmit={(e) => { e.preventDefault(); mutate({ action: "deposit", ...deposit }); }}>
        <div className="tiv-card-h"><h2>บันทึก USD ที่เข้าบัญชีจริงแล้ว</h2></div>
        <p className="tiv-muted -mt-2 mb-4">เป็นการบันทึกบัญชีเท่านั้น ไม่ใช่การโอนเงิน ลงวันที่ปัจจุบัน และไม่บวกทับ balance_after จากบอท ยอดบอทจะเปลี่ยนตามข้อมูลต้นทางเมื่อซิงก์</p>
        <fieldset disabled={busy} className="tiv-fields"><label className={tivField}><span>จำนวน USD</span><input autoFocus required inputMode="decimal" value={deposit.amount} onChange={(e) => setDeposit({ ...deposit, amount: e.target.value })} className={`${input} num`} /></label><label className={tivField}><span>หมายเหตุ/เลขอ้างอิง</span><input required maxLength={300} value={deposit.note} onChange={(e) => setDeposit({ ...deposit, note: e.target.value })} className={input} /></label></fieldset>
        <div className="tiv-tools mt-4"><button disabled={busy} className={tivPrimary}>ยืนยันบันทึก USD เข้า</button><button type="button" disabled={busy} onClick={() => setDeposit(null)} className={button}>ยกเลิก</button></div>
      </form>}
      <section className="flex min-w-0 flex-col gap-4">
        {kind !== "deposit" && <div className="tiv-foots"><span className="leading-6">Order เดียวกันและแหล่งเดียวกันรวมเป็น 1 แถว · วันที่อ้างอิงรายการเติมสุดท้าย รวมรายการย่อยทั้งหมดก่อนกรอง/แบ่งหน้า · ธุรกรรมซ้ำจริงยังแจ้งเตือนและเก็บยอดหักไว้ตรวจสอบ</span></div>}
        <div className="tiv-sect-h"><h2>{kind === "deposit" ? "รายการเติมเงิน" : kind === "order" ? "รายการใช้เงิน" : "ประวัติทั้งหมด"}</h2><span>{loading ? "กำลังโหลด…" : historyReady ? `${data.total} รายการ` : "ยังโหลดตัวกรองนี้ไม่สำเร็จ"} · กด Order เพื่อดูรายละเอียด</span></div>
        <div aria-busy={loading} className={loading ? "pointer-events-none opacity-50" : ""}>
          <UsdCodashopOverviewTable entries={historyReady ? data.entries : []} emptyMessage={!historyReady ? loading ? "กำลังโหลดประวัติ…" : "โหลดประวัติไม่สำเร็จ กรุณาลองใหม่" : search || dates.dateFrom || profitFilter.profitStatus !== "all" || profitFilter.profitMin || profitFilter.profitMax ? "ไม่พบรายการตามตัวกรอง" : kind === "deposit" ? "ยังไม่มีประวัติเติมเงินที่บันทึกในระบบนี้" : "ยังไม่มีประวัติ กดซิงก์ Orders เพื่อดึงรายการ"} />
        </div>
        <TablePagination page={data.page || page} pageSize={data.pageSize || pageSize} total={Number(data.total || 0)} totalPages={Math.max(1, Math.ceil(Number(data.total || 0) / (data.pageSize || pageSize)))} loading={busy || loading} onPage={setPage} onPageSize={(size) => { invalidate(); setPageSize(size); setPage(1); }} label="แบ่งหน้าประวัติ USD" />
      </section>
      <details className="tiv-card"><summary className="cursor-pointer font-semibold">รายละเอียดบัญชีและวิธีคำนวณ</summary><div className="tiv-foots mt-4 leading-6">
        <p>นับหลัง {data.boundary} · ยอดยกมา {money(data.opening)} USD · USD เข้า {money(data.deposits)} · USD ออก {money(data.used)} (ยอดบัญชีทั้งหมด ไม่ขึ้นกับตัวกรอง)</p>
        <p>คงเหลือตามบัญชี (ตรวจสอบ): {money(data.calculatedRemaining)} USD · USD คงเหลือหลักใช้ balance_after จากบอทหลัง Order ล่าสุด ไม่ใช่ยอดสดจาก Codashop และไม่บวกเงินเข้าทับยอดบอท</p>
        <p>ยอดโอนลูกค้าต่างสกุลแปลงด้วยเรทอ้างอิง ณ ซิงก์ครั้งแรก ไม่ใช่เรทรับเงินจริงย้อนหลัง · ต้นทุนที่แสดง = USD ออก × เรท USD→THB ล่าสุด (ปัดต้นทุนแต่ละ Order เป็น 2 ตำแหน่ง) · กำไร = ยอดโอน − ต้นทุน · ถ้าข้อมูลไม่ครบจะแสดง — ไม่แทนด้วยศูนย์</p>
        <p>ต้นทุนใช้ Frankfurter/ECB ไม่ใช่ GOOGLEFINANCE จึงอาจไม่เท่าชีททุกจุดทศนิยม เมื่อเรทเปลี่ยนต้นทุนและกำไรที่แสดงจะเปลี่ยนด้วย ส่วน cost_thb เดิมไม่ถูกเขียนทับ เปิดดูได้ในรายละเอียด Order</p>
        <p>USD เข้าแสดงเฉพาะยอดที่บันทึกยืนยันในระบบนี้ ยังไม่เชื่อม prepayment ledger อัตโนมัติ</p>
        <p>สำเร็จล่าสุด: {date(worker?.last_success)} · worker ทำงานได้แม้ปิดเว็บ หน้านี้โหลดใหม่ทุก 30 วินาที หยุดโหลดระหว่างกรอกเงินเข้า</p>
        <p>Export CSV รวมทุกหน้าตามแท็บ คำค้นหา และช่วงวันที่ สูงสุด 50,000 รายการ เปิดด้วย Excel / Google Sheets ได้</p>
      </div></details>
      <details className="min-w-0 text-sm"><summary className="cursor-pointer py-2 font-semibold">ดูตารางแบบชีท (ทุกคอลัมน์)</summary><div className="mt-3"><UsdCodashopSheetTable entries={historyReady ? data.entries : []} emptyMessage="ไม่พบรายการตามตัวกรอง" /></div></details>
    </>}
  </TopupInventoryPage>;
}
