"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Download, Plus, RefreshCw } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { topupInventoryPath } from "@/lib/topup-inventory";
import { codaQuickDates } from "@/lib/usdcodashop-overview";
import { codaDateBounds } from "@/lib/usdcodashop-report";
import { orderLink } from "@/lib/usdcodashop-sheet";

const endpoint = "/api/projectm/multigamecard";
const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-ll-hairline-strong bg-ll-surface-1 px-4 text-sm hover:bg-ll-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ll-primary disabled:opacity-50";
const input = "mt-2 min-h-11 w-full rounded-lg border border-ll-hairline-strong bg-ll-surface-1 px-3 text-sm text-ll-ink focus-visible:outline-2 focus-visible:outline-ll-primary";
const cell = "px-4 py-3 align-top";
const money = v => v == null ? "—" : Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const when = v => v ? new Date(v).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" }) : "—";

function CardTable({ cards, serial, select }) {
  return <div className="relative max-w-full overflow-x-auto rounded-xl border border-ll-hairline bg-ll-surface-1">
    <table className="w-full text-left text-sm"><caption className="sr-only">ยอดบัตร Multigamecard แยก Serial หน่วยแต้ม</caption>
      <thead className="bg-ll-surface-2"><tr>{["Serial", "สถานะ", "ผู้ใช้งาน", "แต้มเข้า (ทั้งหมด)", "ใช้ไป (ทั้งหมด)", "คงเหลือล่าสุด", "จัดการ"].map(h => <th key={h} className={`${cell} whitespace-nowrap font-medium`}>{h}</th>)}</tr></thead>
      <tbody>{cards.map(c => <tr key={c.id} className={`border-t border-ll-hairline ${serial === c.serial ? "bg-ll-surface-2" : ""}`}>
        <td className={`${cell} whitespace-nowrap font-medium`}>{c.serial || "ไม่ทราบ Serial"}{c.duplicate && <p className="text-xs text-amber-600">พบ Serial ซ้ำ ต้องตรวจสอบ</p>}</td>
        <td className={`${cell} whitespace-nowrap`}>{c.status}{!c.enabled && <p className="text-xs text-ll-ink-subtle">ไม่เปิดใช้งานในพูล</p>}</td>
        <td className={cell}>{c.owner}</td><td className={`${cell} tabular-nums`}>{money(c.inTotal)}</td><td className={`${cell} tabular-nums`}>{money(c.outTotal)}</td>
        <td className={`${cell} whitespace-nowrap font-semibold tabular-nums`}>{money(c.balance)}<p className="mt-1 text-xs font-normal text-ll-ink-subtle">{when(c.balanceAt)}</p></td>
        <td className={cell}>{c.serial && <button type="button" onClick={() => select(c.serial)} aria-label={`${serial === c.serial ? "ยกเลิกเลือก" : "ดูประวัติ"} ${c.serial}`} aria-pressed={serial === c.serial} className={button}>{serial === c.serial ? "ยกเลิกเลือก" : "ดูประวัติ"}</button>}</td>
      </tr>)}</tbody>
    </table>{!cards.length && <p className="p-6 text-center text-sm text-ll-ink-subtle">ยังไม่มีบัตรในระบบนี้</p>}
  </div>;
}
function Entries({ entries }) {
  return <div className="relative max-w-full overflow-x-auto rounded-xl border border-ll-hairline bg-ll-surface-1">
    <table className="w-full text-left text-sm"><caption className="sr-only">รายการ Multigamecard ตามตัวกรอง</caption>
      <thead className="bg-ll-surface-2"><tr>{["วันที่", "Order / รายการ", "Serial", "เกม / แพ็ก", "ยอดโอน (THB)", "ต้นทุน (THB)", "กำไร (THB)", "แต้มเข้า", "แต้มออก", "แต้มหลังรายการ"].map(h => <th key={h} className={`${cell} whitespace-nowrap font-medium`}>{h}</th>)}</tr></thead>
      <tbody>{entries.map(e => <tr key={e.id} className="border-t border-ll-hairline">
        <td className={`${cell} whitespace-nowrap`}>{when(e.occurredAt)}</td>
        <td className={`${cell} min-w-52`}><details><summary className="cursor-pointer font-medium">{e.orderId}</summary><dl className="mt-3 space-y-2 break-words text-xs">
          {[["ผู้เติม", e.details.sheetOperator || e.details.operator], ["ลูกค้า", e.details.customer], ["UID", e.details.playerId], ["ธุรกรรม", e.details.invoice], ["หมายเหตุ", e.details.note], ["ผู้บันทึก", e.recordedBy]].map(([label, v]) => <div key={label}><dt className="text-ll-ink-subtle">{label}</dt><dd>{v || "—"}</dd></div>)}
          {e.details.salePacks > 1 && <p>ยอดโอนแบ่งจาก {e.details.salePacks} แพ็ก</p>}
          {e.details.saleConversion && <p>ยอดโอนใช้เรทอ้างอิงวันนี้: {e.details.saleConversion.rate}</p>}
          {orderLink(e.details.link) && <a href={orderLink(e.details.link)} target="_blank" rel="noopener noreferrer" className="block underline">เปิดรายการต้นทาง</a>}
        </dl></details></td>
        <td className={`${cell} whitespace-nowrap`}>{e.serial || "—"}</td><td className={`${cell} min-w-44`}>{e.details.game || "—"}<p className="mt-1 text-xs text-ll-ink-subtle">{e.details.pack}</p></td>
        <td className={`${cell} tabular-nums`}>{money(e.figures.sale)}</td><td className={`${cell} tabular-nums`}>{money(e.figures.cost)}</td>
        <td className={`${cell} tabular-nums`}>{money(e.figures.profit)}<p className="mt-1 text-xs text-ll-ink-subtle">{e.figures.margin == null ? "—" : `${e.figures.margin}%`}</p></td>
        <td className={`${cell} tabular-nums`}>{e.kind !== "use" ? money(e.amount) : "—"}</td><td className={`${cell} tabular-nums`}>{e.kind === "use" ? money(e.amount) : "—"}</td><td className={`${cell} tabular-nums`}>{money(e.balance)}</td>
      </tr>)}</tbody>
    </table>{!entries.length && <p className="p-6 text-center text-sm text-ll-ink-subtle">ไม่พบรายการตามตัวกรอง</p>}
  </div>;
}

function CostRateForm({ rate, disabled, save, editing }) {
  const [divisor, setDivisor] = useState(rate.divisor);
  return <form onSubmit={e => { e.preventDefault(); save(divisor, rate.version); }} className="space-y-3 rounded-xl border border-ll-hairline bg-ll-surface-1 p-4">
    <div className="flex flex-wrap items-end gap-3"><label className="min-w-0 text-sm">เรท / ตัวหารต้นทุน Bot
      <input required type="number" min="0.00000001" max="99999999.99999999" step="0.00000001" value={divisor} disabled={disabled}
        onChange={e => { setDivisor(e.target.value); editing(true); }} className={input} /></label>
      <button disabled={disabled || divisor === rate.divisor} className={button}>บันทึกเรท</button>
      <button type="button" disabled={disabled} className={button} onClick={() => { setDivisor(rate.divisor); editing(false); }}>คืนค่าที่บันทึก</button></div>
    <p className="text-xs text-ll-ink-subtle">ต้นทุน = ยอดแต้มออก ÷ ตัวหาร · บันทึกแล้วใช้ร่วมกันทุกคน และคำนวณต้นทุน/กำไรย้อนหลังใหม่ทั้งหมด · ไม่เปลี่ยนยอดบัตรหรือรายการ Manual</p>
    {rate.updatedAt && <p className="text-xs text-ll-ink-subtle">บันทึกโดย {rate.updatedBy} · {when(rate.updatedAt)}</p>}
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
  const viewKey = new URLSearchParams({ mode, ...dates, serial, search, page: String(page) }).toString();
  const load = useCallback(async () => {
    const token = ++generation.current; setLoading(true); setError("");
    try {
      const result = await apiJson(`${endpoint}?${viewKey}`, { cache: "no-store" });
      if (!Array.isArray(result?.cards) || !Array.isArray(result.entries) || result.mode !== mode || !result.summary) throw new Error("ข้อมูลไม่ครบ กรุณาโหลดใหม่");
      if (alive.current && token === generation.current) setData({ ...result, viewKey });
    } catch (e) { if (alive.current && token === generation.current) setError(e.message); }
    finally { if (alive.current && token === generation.current) setLoading(false); }
  }, [viewKey, mode]);
  const invalidate = useCallback(() => { generation.current++; }, []);
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
    return <label key={key} className="min-w-0 text-sm">{label}<input type={type} step={type === "number" ? "0.01" : undefined} min={type === "number" ? "0" : undefined} required={required} maxLength={300} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} className={input} /></label>;
  }
  return <main className="mx-auto flex min-h-screen min-w-0 max-w-7xl flex-col gap-6 px-4 pb-14 pt-10 text-ll-ink sm:px-6">
    <header className="flex flex-wrap items-start justify-between gap-4 pr-12"><div><p className="text-xs text-ll-ink-tertiary">TOPUP INVENTORY · แยกตาม SERIAL</p><h1 className="mt-2 text-3xl font-semibold">Multigamecard</h1><p className="mt-2 text-sm text-ll-ink-subtle">ยอดบัตรและรายการใช้เงิน แยก Bot / Manual · ไม่แสดงหรือเก็บ PIN บัตร</p></div><Link href={topupInventoryPath(lang)} className={button}><ArrowLeft size={16} aria-hidden />กลับ Topup Inventory</Link></header>
    <div role="group" aria-label="ประเภท Multigamecard" className="flex gap-2">{[["bot", "Bot"], ["manual", "Manual"]].map(([value, text]) => <button key={value} aria-pressed={mode === value} disabled={disabled || Boolean(form) || rateEditing} onClick={() => { generation.current++; setMode(value); setSerial(""); setPage(1); setNotice(""); }} className={`${button} ${mode === value ? "border-ll-primary ring-1 ring-ll-primary" : ""}`}>{text}</button>)}</div>
    <section aria-label="กรอง Multigamecard" className="space-y-4 rounded-xl border border-ll-hairline bg-ll-surface-1 p-4">
      <div className="flex flex-wrap gap-2">{[["today", "วันนี้"], ["yesterday", "เมื่อวาน"], ["month", "เดือนนี้"]].map(([value, text]) => <button key={value} disabled={disabled || Boolean(form)} onClick={() => apply(codaQuickDates(value))} className={button}>{text}</button>)}</div>
      <form onSubmit={e => { e.preventDefault(); apply(draftDates); }} className="flex flex-wrap items-end gap-3">
        <label className="text-sm">ตั้งแต่วันที่<input required type="date" value={draftDates.dateFrom} onChange={e => setDraftDates({ ...draftDates, dateFrom: e.target.value })} className={input} /></label>
        <label className="text-sm">ถึงวันที่<input required type="date" min={draftDates.dateFrom} value={draftDates.dateTo} onChange={e => setDraftDates({ ...draftDates, dateTo: e.target.value })} className={input} /></label>
        <label className="min-w-0 basis-full text-sm sm:flex-1 sm:basis-64">ค้นหา Order / Serial / เกม / ลูกค้า<input value={query} onChange={e => setQuery(e.target.value)} className={input} /></label>
        <button disabled={disabled || Boolean(form)} className={button}>ใช้ตัวกรอง</button><button type="button" onClick={load} disabled={disabled || Boolean(form)} className={button}><RefreshCw size={16} aria-hidden />โหลดใหม่</button>
        <button type="button" onClick={exportCsv} disabled={disabled || Boolean(form) || !ready || Boolean(error) || !data?.total} className={button}><Download size={16} aria-hidden />Export CSV</button>
      </form><p className="text-xs text-ll-ink-subtle">ตัวกรองที่ใช้: {dates.dateFrom} ถึง {dates.dateTo} (ค.ศ.) · เวลาไทย ไม่เกิน 93 วัน{serial ? ` · Serial ${serial}` : ""}{search ? ` · ${search}` : ""} · Export รวมทุกหน้าตามตัวกรอง</p>
    </section>
    {error && <p role="alert" className="rounded-xl border border-ll-hairline p-4 text-sm">{error}</p>}{notice && <p role="status" className="text-sm">{notice}</p>}{loading && <p role="status" className="text-sm text-ll-ink-subtle">กำลังโหลด Multigamecard…</p>}
    {!loading && !data && <button onClick={load} className={button}>ลองโหลดใหม่</button>}
    <section aria-label="สรุป Multigamecard" className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[["ออเดอร์ตามตัวกรอง", summary?.orders], ["ยอดโอน (THB)", summary?.sale], ["ต้นทุน (THB)", summary?.cost], ["กำไร (THB)", summary?.profit]].map(([label, v]) => <div key={label} className="min-w-0 rounded-xl border border-ll-hairline bg-ll-surface-1 p-4"><p className="text-sm text-ll-ink-subtle">{label}</p><p className="mt-2 break-words text-2xl font-semibold tabular-nums">{loading ? "…" : label === "ออเดอร์ตามตัวกรอง" && v != null ? Number(v).toLocaleString("en-US") : money(v)}</p></div>)}</section>
    {summary && (summary.missingSales > 0 || summary.missingCosts > 0) && <p role="status" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">ข้อมูลไม่ครบ: ยอดโอน {summary.missingSales} รายการ · ต้นทุน {summary.missingCosts} รายการ · ยอดรวมที่พึ่งข้อมูลนี้แสดง — ไม่แทนด้วยศูนย์</p>}
    {mode === "bot" && ready && data.costRate && <>
      <p className="text-sm text-ll-ink-subtle">ต้นทุน (THB) = ยอดแต้มออก ÷ {data.costRate.divisor} · ปัดทศนิยม 2 ตำแหน่งต่อออเดอร์ · ไม่ใช่เรท GoogleFinance</p>
      {data.canManage && <CostRateForm key={data.costRate.version} rate={data.costRate} disabled={disabled} save={saveRate} editing={setRateEditing} />}
    </>}
    <section className="min-w-0 space-y-3"><h2 className="text-xl font-semibold">ยอดบัตร {mode === "bot" ? "Bot" : "Manual"}</h2><p className="text-xs text-ll-ink-subtle">เลื่อนตารางซ้าย–ขวาเพื่อดูยอดทั้งหมด · กดดูประวัติเพื่อเลือก Serial</p><CardTable cards={cards} serial={serial} select={value => { if (form || disabled) return; generation.current++; setSerial(serial === value ? "" : value); setPage(1); }} />
      <p className="text-xs leading-6 text-ll-ink-subtle">หน่วยบัตรเป็นแต้ม ไม่ใช่ USD · หมดแล้ว = 0 · เศษ = มากกว่า 0 แต่น้อยกว่า 50,000 · ปกติ = ตั้งแต่ 50,000 · ยอดบัตรรวมทั้งหมดไม่ขึ้นกับช่วงวันที่หรือคำค้นหา</p>
      {mode === "bot" ? <p className="text-xs leading-6 text-ll-ink-subtle">Bot อ่านยอดล่าสุดจากพูลบัตรเดิม และแต้มที่ใช้จากหลักฐาน molGameCard ในออเดอร์ completed · ยอดเข้าแสดง — เพราะไม่มีประวัตินำเข้าที่ตรวจสอบได้ ไม่คำนวณย้อนเดา · คงเหลือหลังแต่ละ Order เป็นภาพยอดที่บอทอ่าน ณ ตอนนั้น ไม่รับประกันว่าจะต่อกันเมื่อหลายบอทใช้บัตรพร้อมกัน · ต้นทุน THB = ยอดแต้มออก ÷ ตัวหารที่บันทึก ถ้าไม่มีข้อมูลยอดออกจะแสดง — · ไม่เปลี่ยนข้อมูลหรือสั่งจ่ายที่ฐาน Bot</p> : <p className="text-xs leading-6 text-ll-ink-subtle">Manual บันทึกบัญชีเท่านั้น ไม่เติมเกมหรือโอนเงินจริง · ตอนเพิ่มบัตรกรอกยอดคงเหลือที่ยืนยันแล้วเป็นยอดยกมา จากนั้นบันทึกแต้มเข้า/ใช้แต้มตามจริง · ต้นทุนกรอกเป็น THB ไม่เดาอัตราแต้มต่อบาท · วันที่บันทึกเป็นเวลาปัจจุบัน และไม่แก้ทับประวัติเดิม</p>}
    </section>
    {mode === "manual" && ready && data.canManage && <div className="flex flex-wrap gap-2">{[["card", "เพิ่มบัตร Manual"], ["deposit", "บันทึกแต้มเข้า"], ["use", "บันทึกใช้บัตร"]].map(([action, label]) => <button key={action} onClick={() => startForm(action)} disabled={disabled || Boolean(form) || (action !== "card" && !cards.length)} className={button}><Plus size={16} aria-hidden />{label}</button>)}</div>}
    {form && <form onSubmit={save} className="space-y-4 rounded-xl border border-ll-hairline bg-ll-surface-1 p-5"><h2 className="text-lg font-semibold">{({ card: "เพิ่มบัตร Manual", deposit: "บันทึกแต้มเข้า", use: "บันทึกใช้บัตร" })[form.action]}</h2><p className="text-sm text-ll-ink-subtle">กรอกเฉพาะรายการที่เกิดขึ้นจริง ไม่รับ PIN หรือรหัสผ่าน ยอดนี้ไม่ส่งไปแก้พูล Bot</p>
      <fieldset disabled={busy} className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {form.action === "card" ? <>{field("Serial", "serial", true)}{field("ผู้ใช้งานบัตร", "owner", true)}</> : <label className="min-w-0 text-sm">บัตร Manual<select required value={form.cardId} onChange={e => setForm({ ...form, cardId: e.target.value })} className={input}>{cards.map(c => <option key={c.id} value={c.id}>{c.serial} · {money(c.balance)} แต้ม</option>)}</select></label>}
        {field(form.action === "card" ? "ยอดยกมา (แต้ม)" : "จำนวนแต้ม", "amount", true, "number")}
        {form.action === "use" && <>{field("Order ID", "orderId", true)}{field("ยอดโอน (THB)", "saleThb", false, "number")}{field("ต้นทุน (THB)", "costThb", false, "number")}{field("เกม", "game")}{field("แพ็ก", "pack")}{field("ลูกค้า", "customer")}{field("UID", "playerId")}{field("เลขธุรกรรม / หลักฐาน", "invoice")}{field("ผู้เติม", "operator")}</>}
        {field("หมายเหตุ / อ้างอิง", "note", true)}
      </fieldset><div className="flex gap-2"><button disabled={busy} className={button}>ยืนยันบันทึก</button><button type="button" disabled={busy} onClick={() => setForm(null)} className={button}>ยกเลิก</button></div></form>}
    {mode === "manual" && ready && !data.canManage && <p className="text-sm text-ll-ink-subtle">ดูประวัติได้ แต่ต้องมีสิทธิ์ Projectm Admin เพื่อเพิ่มรายการ Manual</p>}
    <section className="min-w-0 space-y-3"><div className="flex flex-wrap items-end justify-between gap-2"><h2 className="text-xl font-semibold">ประวัติ {serial || (mode === "bot" ? "Bot" : "Manual")}</h2><p className="text-xs text-ll-ink-subtle">{ready ? `${data.total} รายการ` : "ยังโหลดตัวกรองนี้ไม่สำเร็จ"}{serial && <button disabled={disabled || Boolean(form)} onClick={() => { generation.current++; setSerial(""); setPage(1); }} className="ml-3 underline">ดูทุก Serial</button>}</p></div><Entries entries={ready ? data.entries : []} />
      <nav aria-label="หน้าประวัติ Multigamecard" className="flex items-center justify-end gap-3 text-sm"><button disabled={disabled || Boolean(form) || page <= 1} onClick={() => setPage(page - 1)} className={button}>ก่อนหน้า</button><span>หน้า {page}</span><button disabled={disabled || Boolean(form) || !ready || page * data.pageSize >= data.total} onClick={() => setPage(page + 1)} className={button}>ถัดไป</button></nav>
    </section><p className="text-xs text-ll-ink-subtle">กำไร = ยอดโอน − ต้นทุน · กำไร % = กำไร ÷ ยอดโอน × 100 · ยอดโอนศูนย์ไม่มีเปอร์เซ็นต์ · โหลดใหม่ทุก 30 วินาที หยุดระหว่างกรอก Manual</p>
  </main>;
}
