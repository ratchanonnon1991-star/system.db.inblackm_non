"use client";

import { createInventoryPageSession } from "@/lib/inventory-page-session";
import { TablePagination } from "@/components/table-pagination";
import PaginatedTable from "@/components/table-pagination";
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Plus, RefreshCw } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import TopupInventoryPage from "@/components/topup-inventory-page";
import { tivButton as button, tivField, tivInput as input, tivPrimary, tivTable, tivTableBox } from "@/lib/topup-inventory-ui";
import { codaQuickDates } from "@/lib/usdcodashop-overview";
import { codaDateBounds } from "@/lib/usdcodashop-report";
import { orderLink } from "@/lib/usdcodashop-sheet";

const endpoint = "/api/projectm/multigamecard";
const money = v => v == null ? "—" : Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const when = v => v ? new Date(v).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" }) : "—";

function CardTable({ cards, serial, select, resetKey }) {
  return <div className={`${tivTableBox} relative max-w-full`}>
    <PaginatedTable items={cards} resetKey={resetKey}>{(tablePageItems, tablePageStart, tableAllItems) => (<table className={tivTable}><caption className="sr-only">ยอดบัตร Multigamecard แยก Serial หน่วยแต้ม</caption>
      <thead><tr>{["Serial", "สถานะ", "ผู้ใช้งาน", "แต้มเข้า (ทั้งหมด)", "ใช้ไป (ทั้งหมด)", "คงเหลือล่าสุด", "จัดการ"].map((h, i) => <th key={h} className={i >= 3 && i <= 5 ? "r" : ""}>{h}</th>)}</tr></thead>
      <tbody>{tablePageItems.map((tableItem, tableIndex) => (c => <tr key={c.id} className={serial === c.serial ? "sel" : ""}>
        <td className="whitespace-nowrap font-medium">{c.serial || "ไม่ทราบ Serial"}{c.duplicate && <span className="tiv-warn block text-xs">พบ Serial ซ้ำ ต้องตรวจสอบ</span>}</td>
        <td className="whitespace-nowrap">{c.status}{!c.enabled && <span className="sm">ไม่เปิดใช้งานในพูล</span>}</td>
        <td>{c.owner}</td><td className="r">{money(c.inTotal)}</td><td className="r">{money(c.outTotal)}</td>
        <td className="r b whitespace-nowrap">{money(c.balance)}<span className="sm font-normal">{when(c.balanceAt)}</span></td>
        <td>{c.serial && <button type="button" onClick={() => select(c.serial)} aria-label={`${serial === c.serial ? "ยกเลิกเลือก" : "ดูประวัติ"} ${c.serial}`} aria-pressed={serial === c.serial} className={`${button}${serial === c.serial ? " on" : ""}`}>{serial === c.serial ? "ยกเลิกเลือก" : "ดูประวัติ"}</button>}</td>
      </tr>)(tableItem, tablePageStart + tableIndex, tableAllItems))}</tbody>
    </table>)}</PaginatedTable>{!cards.length && <div className="tiv-dempty m-4"><strong>ยังไม่มีบัตรในระบบนี้</strong></div>}
  </div>;
}
function Entries({ entries }) {
  return <div className={`${tivTableBox} relative max-w-full`}>
    <table className={tivTable}><caption className="sr-only">รายการ Multigamecard ตามตัวกรอง</caption>
      <thead><tr>{["วันที่", "Order / รายการ", "Serial", "เกม / แพ็ก", "ยอดโอน (THB)", "ต้นทุน (THB)", "กำไร (THB)", "แต้มเข้า", "แต้มออก", "แต้มหลังรายการ"].map((h, i) => <th key={h} className={i >= 4 ? "r" : ""}>{h}</th>)}</tr></thead>
      <tbody>{entries.map(e => <tr key={e.id}>
        <td className="whitespace-nowrap">{when(e.occurredAt)}</td>
        <td className="min-w-52"><details><summary>{e.orderId}</summary><dl className="tiv-subbox space-y-2 break-words">
          {[["ผู้เติม", e.details.sheetOperator || e.details.operator], ["ลูกค้า", e.details.customer], ["UID", e.details.playerId], ["ธุรกรรม", e.details.invoice], ["หมายเหตุ", e.details.note], ["ผู้บันทึก", e.recordedBy]].map(([label, v]) => <div key={label}><dt className="text-ll-ink-subtle">{label}</dt><dd>{v || "—"}</dd></div>)}
          {e.details.salePacks > 1 && <p>ยอดโอนแบ่งจาก {e.details.salePacks} แพ็ก</p>}
          {e.details.saleConversion && <p>ยอดโอนใช้เรท: {e.details.saleConversion.rate} · {e.details.saleConversion.source} · อ่านเมื่อ {when(e.details.saleConversion.fetchedAt)}</p>}
          {orderLink(e.details.link) && <a href={orderLink(e.details.link)} target="_blank" rel="noopener noreferrer" className="tiv-lnk block">เปิดรายการต้นทาง</a>}
        </dl></details></td>
        <td className="whitespace-nowrap">{e.serial || "—"}</td><td className="min-w-44">{e.details.game || "—"}<span className="sm">{e.details.pack}</span></td>
        <td className="r">{money(e.figures.sale)}</td><td className="r">{money(e.figures.cost)}</td>
        <td className="r">{money(e.figures.profit)}<span className="sm">{e.figures.margin == null ? "—" : `${e.figures.margin}%`}</span></td>
        <td className="r">{e.kind !== "use" ? money(e.amount) : "—"}</td><td className="r">{e.kind === "use" ? money(e.amount) : "—"}</td><td className="r">{money(e.balance)}</td>
      </tr>)}</tbody>
    </table>{!entries.length && <div className="tiv-dempty m-4"><strong>ไม่พบรายการตามตัวกรอง</strong></div>}
  </div>;
}

function CostRateForm({ rate, disabled, save, editing }) {
  const [divisor, setDivisor] = useState(rate.divisor);
  return <form onSubmit={e => { e.preventDefault(); save(divisor, rate.version); }} className="tiv-card">
    <div className="flex flex-wrap items-end gap-3"><label className={`${tivField} w-full sm:w-64`}><span>เรท / ตัวหารต้นทุน Bot</span>
      <input required type="number" min="0.00000001" max="99999999.99999999" step="0.00000001" value={divisor} disabled={disabled}
        onChange={e => { setDivisor(e.target.value); editing(true); }} className={`${input} num`} /></label>
      <button disabled={disabled || divisor === rate.divisor} className={tivPrimary}>บันทึกเรท</button>
      <button type="button" disabled={disabled} className={button} onClick={() => { setDivisor(rate.divisor); editing(false); }}>คืนค่าที่บันทึก</button></div>
    <p className="tiv-hint">ต้นทุน = ยอดแต้มออก ÷ ตัวหาร · บันทึกแล้วใช้ร่วมกันทุกคน และคำนวณต้นทุน/กำไรย้อนหลังใหม่ทั้งหมด · ไม่เปลี่ยนยอดบัตรหรือรายการ Manual</p>
    {rate.updatedAt && <p className="tiv-hint mt-1!">บันทึกโดย {rate.updatedBy} · {when(rate.updatedAt)}</p>}
  </form>;
}

export default function MultigamecardInventory({ lang }) {
  const [mode, setMode] = useState("bot"), [dates, setDates] = useState(() => codaQuickDates("month"));
  const [draftDates, setDraftDates] = useState(dates), [serial, setSerial] = useState("");
  const [query, setQuery] = useState(""), [search, setSearch] = useState(""), [page, setPage] = useState(1);
  const [data, setData] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [notice, setNotice] = useState(""), [form, setForm] = useState(null), [busy, setBusy] = useState(false), [exporting, setExporting] = useState(false);
  const [rateEditing, setRateEditing] = useState(false);
  const generation = useRef(0), alive = useRef(false), lock = useRef(false);
  const [pageSize, setPageSize] = useState(25);
  const viewKey = new URLSearchParams({ mode, ...dates, serial, search, page: String(page), pageSize: String(pageSize) }).toString();
  const [pageReader] = useState(() => createInventoryPageSession());
  const load = useCallback(async () => {
    const token = ++generation.current; setLoading(true); setError("");
    try {
      const result = await pageReader.run(endpoint, viewKey);
      if (!Array.isArray(result?.cards) || !Array.isArray(result.entries) || result.mode !== mode || !result.summary) throw new Error("ข้อมูลไม่ครบ กรุณาโหลดใหม่");
      if (alive.current && token === generation.current) setData({ ...result, viewKey });
    } catch (e) { if (alive.current && token === generation.current) setError(e.message); }
    finally { if (alive.current && token === generation.current) setLoading(false); }
  }, [viewKey, mode, pageReader]);
  const invalidate = useCallback(() => { generation.current++; pageReader.cancel(); }, [pageReader]);
  useEffect(() => { alive.current = true; const timer = setTimeout(load, 0); return () => { alive.current = false; invalidate(); clearTimeout(timer); }; }, [load, invalidate]);
  useEffect(() => {
    if (form || rateEditing) return;
    const timer = setInterval(() => { if (!document.hidden && !lock.current) load(); }, 30_000);
    return () => clearInterval(timer);
  }, [load, form, rateEditing]);
  const ready = data?.viewKey === viewKey;
  const disabled = loading || busy || exporting;
  const cards = ready ? data.cards : [], summary = ready ? data.summary : null;
  function apply(next) {
    try {
      codaDateBounds(next);
      if (!next.dateFrom || !next.dateTo) throw new Error("กรุณาเลือกวันที่ให้ครบ");
      generation.current++; setPage(1); setDates(next); setDraftDates(next); setSearch(query); setError("");
    } catch (e) { setError(e.message); }
  }
  function startForm(action) {
    setError(""); setNotice("");
    setForm({ action, requestId: crypto.randomUUID(), serial: "", owner: "", amount: "", note: "",
      cardId: cards.find(c => c.serial === serial)?.id || cards[0]?.id || "", orderId: "", saleThb: "", costThb: "", game: "", pack: "", customer: "", playerId: "", invoice: "", operator: "" });
  }
  async function save(event) {
    event.preventDefault(); if (lock.current) return;
    lock.current = true; generation.current++; setBusy(true); setError("");
    try {
      const result = await apiJson(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!result?.id) throw new Error("เซิร์ฟเวอร์ยืนยันไม่ครบ กรุณาตรวจประวัติก่อนบันทึกซ้ำ");
      if (!alive.current) return;
      setNotice(result.replayed ? "รายการนี้บันทึกแล้ว ไม่บันทึกซ้ำ" : "บันทึก Manual แล้ว (ไม่ได้สั่งจ่ายเงินจริงหรือส่งบอท)");
      setForm(null); await load();
    } catch (e) { if (alive.current) setError(`${e.message} · หากไม่แน่ใจให้โหลดประวัติก่อนสร้างรายการใหม่`); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  async function exportCsv() {
    setExporting(true); setError("");
    try {
      const response = await fetch(`${endpoint}?${viewKey}&format=csv`, { cache: "no-store" });
      if (!response.ok || !response.headers.get("content-type")?.startsWith("text/csv")) {
        const body = await response.json().catch(() => null); throw new Error(body?.error || body?.message || "Export ไม่สำเร็จ");
      }
      const url = URL.createObjectURL(await response.blob()), a = document.createElement("a");
      a.href = url; a.download = `multigamecard-${mode}-${dates.dateFrom}-${dates.dateTo}.csv`;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { if (alive.current) setError(e.message); }
    finally { if (alive.current) setExporting(false); }
  }
  async function saveRate(divisor, version) {
    if (lock.current || !window.confirm("เปลี่ยนตัวหารต้นทุน Bot สำหรับทุกคน รวมรายการย้อนหลังทั้งหมดใช่ไหม?")) return;
    lock.current = true; generation.current++; setBusy(true); setError(""); setNotice("");
    try {
      const result = await apiJson(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cost-rate", divisor, version }) });
      if (!result?.version || !result.divisor) throw new Error("ยังยืนยันเรทไม่ได้ กรุณาโหลดใหม่ก่อนบันทึกซ้ำ");
      if (!alive.current) return;
      setRateEditing(false); setNotice("บันทึกตัวหารต้นทุน Bot แล้ว"); await load();
    } catch (e) { if (alive.current) setError(e.message); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  function field(label, key, required = false, type = "text") {
    return <label key={key} className={tivField}><span>{label}</span><input type={type} step={type === "number" ? "0.01" : undefined} min={type === "number" ? "0" : undefined} required={required} maxLength={300} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} className={type === "number" ? `${input} num` : input} /></label>;
  }
  const quick = Object.entries({ today: "วันนี้", yesterday: "เมื่อวาน", month: "เดือนนี้" }).map(([value, text]) => ({ value, text, on: Object.entries(codaQuickDates(value)).every(([k, v]) => dates[k] === v) }));
  return <TopupInventoryPage provider="multigamecard" description="ยอดบัตรและรายการใช้เงิน แยก Bot / Manual · ไม่แสดงหรือเก็บ PIN บัตร">
    <div role="group" aria-label="ประเภท Multigamecard" className="tiv-tools">{[["bot", "Bot"], ["manual", "Manual"]].map(([value, text]) => <button key={value} aria-pressed={mode === value} disabled={disabled || Boolean(form) || rateEditing} onClick={() => { generation.current++; setMode(value); setSerial(""); setPage(1); setNotice(""); }} className={`${button}${mode === value ? " on" : ""}`}>{text}</button>)}</div>
    <section aria-label="กรอง Multigamecard" className="tiv-card">
      <div className="tiv-tools">{quick.map(({ value, text, on }) => <button key={value} aria-pressed={on} disabled={disabled || Boolean(form)} onClick={() => apply(codaQuickDates(value))} className={`${button}${on ? " on" : ""}`}>{text}</button>)}</div>
      <form onSubmit={e => { e.preventDefault(); apply(draftDates); }} className="mt-4">
        <div className="tiv-fields">
          <label className={tivField}><span>ตั้งแต่วันที่</span><input required type="date" value={draftDates.dateFrom} onChange={e => setDraftDates({ ...draftDates, dateFrom: e.target.value })} className={input} /></label>
          <label className={tivField}><span>ถึงวันที่</span><input required type="date" min={draftDates.dateFrom} value={draftDates.dateTo} onChange={e => setDraftDates({ ...draftDates, dateTo: e.target.value })} className={input} /></label>
          <label className={tivField}><span>ค้นหา Order / Serial / เกม / ลูกค้า</span><input value={query} onChange={e => setQuery(e.target.value)} className={input} /></label>
        </div>
        <div className="tiv-tools mt-4">
          <button disabled={disabled || Boolean(form)} className={tivPrimary}>ใช้ตัวกรอง</button><button type="button" onClick={load} disabled={disabled || Boolean(form)} className={button}><RefreshCw size={16} aria-hidden />โหลดใหม่</button>
          <button type="button" onClick={exportCsv} disabled={disabled || Boolean(form) || !ready || Boolean(error) || !data?.total} className={button}><Download size={16} aria-hidden />Export CSV</button>
        </div>
      </form><p className="tiv-hint">ตัวกรองที่ใช้: {dates.dateFrom} ถึง {dates.dateTo} (ค.ศ.) · เวลาไทย ไม่เกิน 93 วัน{serial ? ` · Serial ${serial}` : ""}{search ? ` · ${search}` : ""} · Export รวมทุกหน้าตามตัวกรอง</p>
    </section>
    {error && <p role="alert" className="tiv-alert">{error}</p>}{notice && <p role="status" className="tiv-banner">{notice}</p>}{loading && <p role="status" className="tiv-muted">กำลังโหลด Multigamecard…</p>}
    {!loading && !data && <div><button onClick={load} className={button}>ลองโหลดใหม่</button></div>}
    {mode === "bot" && <p className="tiv-banner">ยอดโอน Russia = ยอด USD จากคิว × เรท GoogleFinance จากชีท · แคชเรท 5 นาที · ยอดโอนและกำไรย้อนหลังเปลี่ยนตามเรทที่อ่านได้ · ไม่กระทบตัวหารต้นทุน</p>}
    <section aria-label="สรุป Multigamecard" className="tiv-kpis">{[["ออเดอร์ตามตัวกรอง", summary?.orders], ["ยอดโอน (THB)", summary?.sale], ["ต้นทุน (THB)", summary?.cost], ["กำไร (THB)", summary?.profit]].map(([label, v]) => <div key={label} className="tiv-kpi"><small>{label}</small><b className={!loading && v == null ? "mut" : ""}>{loading ? "…" : label === "ออเดอร์ตามตัวกรอง" && v != null ? Number(v).toLocaleString("en-US") : money(v)}</b></div>)}</section>
    {summary && (summary.missingSales > 0 || summary.missingCosts > 0) && <p role="status" className="tiv-banner"><span className="tiv-warn">ข้อมูลไม่ครบ: ยอดโอน {summary.missingSales} รายการ · ต้นทุน {summary.missingCosts} รายการ · ยอดรวมที่พึ่งข้อมูลนี้แสดง — ไม่แทนด้วยศูนย์</span></p>}
    {mode === "bot" && ready && data.costRate && <>
      <p className="tiv-muted">ต้นทุน (THB) = ยอดแต้มออก ÷ {data.costRate.divisor} · ปัดทศนิยม 2 ตำแหน่งต่อออเดอร์ · ไม่ใช่เรท GoogleFinance</p>
      {data.canManage && <CostRateForm key={data.costRate.version} rate={data.costRate} disabled={disabled} save={saveRate} editing={setRateEditing} />}
    </>}
    <section className="flex min-w-0 flex-col gap-3"><div className="tiv-sect-h"><h2>ยอดบัตร {mode === "bot" ? "Bot" : "Manual"}</h2><span>เลื่อนตารางซ้าย–ขวาเพื่อดูยอดทั้งหมด · กดดูประวัติเพื่อเลือก Serial</span></div><CardTable cards={cards} serial={serial} resetKey={mode} select={value => { if (form || disabled) return; generation.current++; setSerial(serial === value ? "" : value); setPage(1); }} />
      <div className="tiv-foots"><span className="leading-6">หน่วยบัตรเป็นแต้ม ไม่ใช่ USD · หมดแล้ว = 0 · เศษ = มากกว่า 0 แต่น้อยกว่า 50,000 · ปกติ = ตั้งแต่ 50,000 · ยอดบัตรรวมทั้งหมดไม่ขึ้นกับช่วงวันที่หรือคำค้นหา</span>
        {mode === "bot" ? <span className="leading-6">Bot อ่านยอดล่าสุดจากพูลบัตรเดิม และแต้มที่ใช้จากหลักฐาน molGameCard ในออเดอร์ completed · ยอดเข้าแสดง — เพราะไม่มีประวัตินำเข้าที่ตรวจสอบได้ ไม่คำนวณย้อนเดา · คงเหลือหลังแต่ละ Order เป็นภาพยอดที่บอทอ่าน ณ ตอนนั้น ไม่รับประกันว่าจะต่อกันเมื่อหลายบอทใช้บัตรพร้อมกัน · ต้นทุน THB = ยอดแต้มออก ÷ ตัวหารที่บันทึก ถ้าไม่มีข้อมูลยอดออกจะแสดง — · ไม่เปลี่ยนข้อมูลหรือสั่งจ่ายที่ฐาน Bot</span> : <span className="leading-6">Manual บันทึกบัญชีเท่านั้น ไม่เติมเกมหรือโอนเงินจริง · ตอนเพิ่มบัตรกรอกยอดคงเหลือที่ยืนยันแล้วเป็นยอดยกมา จากนั้นบันทึกแต้มเข้า/ใช้แต้มตามจริง · ต้นทุนกรอกเป็น THB ไม่เดาอัตราแต้มต่อบาท · วันที่บันทึกเป็นเวลาปัจจุบัน และไม่แก้ทับประวัติเดิม</span>}</div>
    </section>
    {mode === "manual" && ready && data.canManage && <div className="tiv-tools">{[["card", "เพิ่มบัตร Manual"], ["deposit", "บันทึกแต้มเข้า"], ["use", "บันทึกใช้บัตร"]].map(([action, label]) => <button key={action} onClick={() => startForm(action)} disabled={disabled || Boolean(form) || (action !== "card" && !cards.length)} className={button}><Plus size={16} aria-hidden />{label}</button>)}</div>}
    {form && <form onSubmit={save} className="tiv-card"><div className="tiv-card-h"><h2>{({ card: "เพิ่มบัตร Manual", deposit: "บันทึกแต้มเข้า", use: "บันทึกใช้บัตร" })[form.action]}</h2></div><p className="tiv-muted -mt-2 mb-4">กรอกเฉพาะรายการที่เกิดขึ้นจริง ไม่รับ PIN หรือรหัสผ่าน ยอดนี้ไม่ส่งไปแก้พูล Bot</p>
      <fieldset disabled={busy} className="tiv-fields">
        {form.action === "card" ? <>{field("Serial", "serial", true)}{field("ผู้ใช้งานบัตร", "owner", true)}</> : <label className={tivField}><span>บัตร Manual</span><select required value={form.cardId} onChange={e => setForm({ ...form, cardId: e.target.value })} className={input}>{cards.map(c => <option key={c.id} value={c.id}>{c.serial} · {money(c.balance)} แต้ม</option>)}</select></label>}
        {field(form.action === "card" ? "ยอดยกมา (แต้ม)" : "จำนวนแต้ม", "amount", true, "number")}
        {form.action === "use" && <>{field("Order ID", "orderId", true)}{field("ยอดโอน (THB)", "saleThb", false, "number")}{field("ต้นทุน (THB)", "costThb", false, "number")}{field("เกม", "game")}{field("แพ็ก", "pack")}{field("ลูกค้า", "customer")}{field("UID", "playerId")}{field("เลขธุรกรรม / หลักฐาน", "invoice")}{field("ผู้เติม", "operator")}</>}
        {field("หมายเหตุ / อ้างอิง", "note", true)}
      </fieldset><div className="tiv-tools mt-4"><button disabled={busy} className={tivPrimary}>ยืนยันบันทึก</button><button type="button" disabled={busy} onClick={() => setForm(null)} className={button}>ยกเลิก</button></div></form>}
    {mode === "manual" && ready && !data.canManage && <p className="tiv-muted">ดูประวัติได้ แต่ต้องมีสิทธิ์ Projectm Admin เพื่อเพิ่มรายการ Manual</p>}
    <section className="flex min-w-0 flex-col gap-3"><div className="tiv-sect-h"><h2>ประวัติ {serial || (mode === "bot" ? "Bot" : "Manual")}</h2><span>{ready ? `${data.total} รายการ` : "ยังโหลดตัวกรองนี้ไม่สำเร็จ"}{serial && <button disabled={disabled || Boolean(form)} onClick={() => { generation.current++; setSerial(""); setPage(1); }} className="tiv-lnk ml-3">ดูทุก Serial</button>}</span></div><Entries entries={ready ? data.entries : []} />
      <TablePagination page={data?.page || page} pageSize={data?.pageSize || pageSize} total={Number(data?.total || 0)} totalPages={Math.max(1, Math.ceil(Number(data?.total || 0) / (data?.pageSize || pageSize)))} observedAt={data?.pagination?.observedAt} loading={disabled || Boolean(form) || !ready} onPage={(nextPage) => { invalidate(); setPage(nextPage); }} onPageSize={(size) => { invalidate(); setPageSize(size); setPage(1); }} label="แบ่งหน้าประวัติ" />
    </section><div className="tiv-foots"><span>กำไร = ยอดโอน − ต้นทุน · กำไร % = กำไร ÷ ยอดโอน × 100 · ยอดโอนศูนย์ไม่มีเปอร์เซ็นต์ · โหลดใหม่ทุก 30 วินาที หยุดระหว่างกรอก Manual</span></div>
  </TopupInventoryPage>;
}
