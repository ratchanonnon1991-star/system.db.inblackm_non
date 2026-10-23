"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Download, Radio, RefreshCw } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { topupInventoryPath } from "@/lib/topup-inventory";
import { codaQuickDates } from "@/lib/usdcodashop-overview";
import { DONSHOP_CHECK_DEFAULTS, DONSHOP_CHECK_KINDS, DONSHOP_LATE_MINUTES, DONSHOP_REFERENCE_RATE, DONSHOP_STATUSES, dsCheckSettings, dsStatusLabel, dsSum, dsVisibleAlerts } from "@/lib/donshop-inventory";
const endpoint = "/api/projectm/donshop";
// Polls only while the tab is visible; each read hits the shared production DB.
const LIVE_MS = 30_000;
// Check settings live in this browser only; nothing about the checks is written to any database.
const SETTINGS_KEY = "donshop-check-settings";
const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-ll-hairline-strong bg-ll-surface-1 px-4 text-sm text-ll-ink hover:bg-ll-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ll-primary disabled:opacity-50";
const input = "min-h-11 w-full min-w-0 rounded-lg border border-ll-hairline-strong bg-ll-surface-1 px-3 text-sm text-ll-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ll-primary";
const money = (v) => v == null ? "—" : Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const when = (v) => v ? new Date(v).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" }) : "ไม่ระบุเวลา";
const statusText = (statuses) => Object.entries(statuses).map(([key, n]) => `${dsStatusLabel(key)}${n > 1 ? ` ×${n}` : ""}`).join(" · ");
function WalletCard({ data }) {
  return <article className="rounded-xl border border-ll-hairline bg-ll-surface-1 p-5">
    <h2 className="font-semibold">ยอด Donshop หลังออเดอร์สำเร็จล่าสุด</h2>
    <p className="mt-3 text-3xl font-semibold tabular-nums">{money(data.balance)} IDR</p>
    <p className="mt-2 text-xs text-ll-ink-subtle">{data.balance == null ? "ยังไม่มีออเดอร์สำเร็จที่บันทึกยอดก่อนตัด ไม่ใช่ยอดศูนย์" : `คำนวณเมื่อ ${when(data.balanceAt)} · ยอดก่อนตัด − ยอดตัด ของ ${data.balanceOrderId}`}</p>
    <p className="mt-2 text-xs text-ll-ink-subtle">ไม่ใช่ยอดสดตอนเปิดหน้า ไม่เปลี่ยนตามตัวกรอง และไม่นับการเติมเงินเข้าที่เกิดหลังออเดอร์นั้น</p>
  </article>;
}
function StatusCard({ summary }) {
  return <article className="rounded-xl border border-ll-hairline bg-ll-surface-1 p-5"><h2 className="font-semibold">รายการย่อยตามสถานะ (ตามตัวกรอง)</h2>
    <dl className="mt-4 grid grid-cols-3 gap-3 text-sm sm:grid-cols-5">{DONSHOP_STATUSES.map(([key, title]) => <div key={key}><dt className="text-ll-ink-subtle">{title}</dt><dd className="mt-2 font-semibold tabular-nums">{summary.statuses[key] || 0}</dd></div>)}</dl>
    <p className="mt-4 text-xs text-ll-ink-subtle">ยอดโอน ต้นทุน กำไร และ IDR ออก นับเฉพาะรายการสำเร็จ · Manual / Failed / Pending / Wait แสดงเพื่อตรวจสอบเท่านั้น</p>
  </article>;
}
// Alert wording only: IDR without decimals plus an approximate THB at the page's reference rate.
const idr = (v) => v == null ? "—" : Number(v).toLocaleString("en-US", { maximumFractionDigits: 0 });
const withBaht = (v, rate) => `${idr(v)} IDR (ประมาณ ${(Number(v) * Number(rate)).toLocaleString("en-US", { maximumFractionDigits: 0 })} บาท)`;
const kindLabel = (kind) => DONSHOP_CHECK_KINDS.find(([key]) => key === kind)?.[1] || kind;
const duration = (m) => m >= 1440 ? `${Math.floor(m / 1440)} วัน` : m >= 60 ? `${Math.floor(m / 60)} ชม. ${m % 60} นาที` : `${m} นาที`;
const span = (a) => `ช่วง ${when(a.from.at)} – ${when(a.order.at)}`;
function alertLines(a, rate) {
  const lines = a.kind === "gap" ? [`เงินหาย ${withBaht(a.amount, rate)} · ${span(a)}`, `หลังเติมคิว ${a.from.id} เงินในบัญชีควรเหลือ ${idr(a.expected)} IDR`, `แต่ตอนเริ่มเติมคิวถัดไป (${a.order.id}) ก่อนหักค่าคิวนั้น มีอยู่ ${idr(a.actual)} IDR`,
    a.between.length ? `ช่วงนี้มีคิวไม่สำเร็จ ${a.between.length} คิว แต่ราคาไม่ตรงกับเงินที่หาย → ต้องเช็คประวัติในบัญชี Donshop ว่าเงินส่วนนี้ใช้ไปกับอะไร` : "ช่วงนี้บอทไม่ได้เติมอะไร → ต้องเช็คประวัติในบัญชี Donshop ว่าเงินส่วนนี้ใช้ไปกับอะไร"]
    : a.kind === "charged" ? [`เงินหาย ${withBaht(a.amount, rate)} · ${span(a)}`, `${a.suspects.map((s) => `คิว ${s.id} ขึ้นสถานะ "${dsStatusLabel(s.status)}"`).join(", ")} (ไม่สำเร็จ) แต่เงินในบัญชีลดลงเท่าราคา${a.suspects.length > 1 ? "รวมของคิวเหล่านี้" : "คิวนี้"}พอดี`, "→ น่าจะโดนหักเงินจริง แต่รายงานไม่ได้นับเป็นยอดใช้และต้นทุน"]
    : a.kind === "refunded" ? [`โดนหัก ${withBaht(a.amount, rate)} แล้วได้คืนเท่ากัน · ช่วง ${when(a.from.at)} – ${when(a.refund.order.at)}`, `หลังเติมคิว ${a.from.id} เงินควรเหลือ ${idr(a.expected)} IDR แต่ก่อนเริ่มเติมคิว ${a.order.id} มีอยู่ ${idr(a.actual)} IDR`,
      `จากนั้นก่อนเริ่มเติมคิว ${a.refund.order.id} เงินเพิ่มกลับมา ${idr(a.refund.amount)} IDR เท่ากันพอดี${a.suspects?.length ? ` (น่าจะเป็นเงินของ${a.suspects.map((s) => `คิว ${s.id} "${dsStatusLabel(s.status)}"`).join(", ")})` : ""}`, "→ น่าจะเป็นการคืนเงิน ไม่ใช่เงินหาย"]
    : a.kind === "evidence" ? [`คิว ${a.order.id} เติมสำเร็จ (${when(a.order.at)}) แต่บอทไม่ได้จด${a.missing === "before" ? "ยอดเงินก่อนหัก" : "ยอดที่หัก"} → เช็คช่วงนี้ไม่ได้`]
    : [`เงินเพิ่ม ${withBaht(a.amount, rate)} · ${span(a)}`, "ถือว่าเป็นการเติมเงินเข้าบัญชี (ไม่มีบันทึกให้ยืนยัน)"];
  if (a.late?.length) lines.push(`⚠ มีคนแก้ข้อมูลภายหลัง: ${a.late.map((r) => `คิว ${r.id} (${dsStatusLabel(r.status)}) แก้ล่าสุด ${when(r.updatedAt)} หรือ ${duration(r.lateMinutes)} หลังสร้างคิว`).join(", ")} อาจกรอกเพิ่มหรือกรอกช้า`);
  return lines;
}
function AlertBody({ alert, rate, children }) {
  const [head, ...rest] = alertLines(alert, rate);
  return <>
    <div className="flex flex-wrap items-center gap-2">{children}<span className="inline-block rounded-full border border-ll-hairline-strong px-2 py-0.5 text-xs">{kindLabel(alert.kind)}</span><p className="font-semibold">{head}</p></div>
    {rest.map((line) => <p key={line} className="mt-1">{line}</p>)}
    <p className="mt-1 break-all text-xs text-ll-ink-subtle">Order: {[alert.from, alert.order, alert.refund?.order].filter(Boolean).map((o) => o.orderId).join(" → ")}</p>
  </>;
}
const ALERT_LIMIT = 100;
function CheckSettings({ settings, onChange }) {
  const box = "flex min-h-11 items-center gap-2 text-sm";
  return <details className="rounded-lg border border-ll-hairline p-3"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-ll-primary">ตั้งค่าการเช็ค</summary>
    <div className="mt-2 grid gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
      <label className={box}><input type="checkbox" checked={settings.enabled} onChange={(e) => onChange({ ...settings, enabled: e.target.checked })} />เปิดการเช็คยอด</label>
      {DONSHOP_CHECK_KINDS.map(([key, title]) => <label key={key} className={box}><input type="checkbox" disabled={!settings.enabled} checked={settings.kinds[key]} onChange={(e) => onChange({ ...settings, kinds: { ...settings.kinds, [key]: e.target.checked } })} />{title}</label>)}
      <label className="space-y-2 text-sm"><span>ไม่แจ้งยอดที่ต่างน้อยกว่า (IDR)</span><input type="number" min="0" step="1" disabled={!settings.enabled} value={settings.minIdr} className={input} onChange={(e) => onChange({ ...settings, minIdr: e.target.value })} /></label>
    </div>
    <p className="mt-2 text-xs text-ll-ink-subtle">บันทึกไว้ในเบราว์เซอร์นี้เท่านั้น ไม่บันทึกลงฐานข้อมูล</p>
  </details>;
}
function ChecksPanel({ alerts, fresh, resolved, rate, settings, onSettings }) {
  const visible = dsVisibleAlerts(alerts, settings), lost = visible.filter((a) => a.kind === "gap" || a.kind === "charged");
  const total = (list) => dsSum(list, (a) => a.amount), isNew = new Set(fresh), newCount = visible.filter((a) => isNew.has(a.key)).length;
  const goneKeys = new Set(dsVisibleAlerts(resolved.map((r) => r.alert), settings).map((a) => a.key)), gone = resolved.filter((r) => goneKeys.has(r.alert.key));
  return <section aria-label="เช็คยอด Donshop" className="space-y-3 rounded-xl border border-ll-hairline bg-ll-surface-1 p-4">
    <h2 className="text-lg font-semibold">เช็คยอดเงินไม่ตรง</h2>
    <CheckSettings settings={settings} onChange={onSettings} />
    {!settings.enabled ? <p className="text-sm text-ll-ink-subtle">ปิดการเช็คอยู่</p> : !visible.length ? <p role="status" className="text-sm">ไม่พบยอดเงินไม่ตรงในช่วงวันที่นี้ตามที่ตั้งค่าไว้</p> : <>
      <p role={lost.length ? "alert" : "status"} className="text-sm font-semibold">พบ {visible.length} จุดที่ยอดเงินไม่ตรง{newCount > 0 && ` · ใหม่ ${newCount} จุดตั้งแต่เปิดหน้านี้`}{lost.length > 0 && ` · เงินหายรวม ${withBaht(total(lost), rate)} · ไม่ทราบสาเหตุ ${idr(total(lost.filter((a) => a.kind === "gap")))} · คิวไม่สำเร็จแต่โดนหัก ${idr(total(lost.filter((a) => a.kind === "charged")))}`}</p>
      <ul className="max-h-128 overflow-auto rounded-lg border border-ll-hairline">{visible.slice(0, ALERT_LIMIT).map((a) => <li key={a.key} className="border-t border-ll-hairline px-3 py-3 text-sm first:border-t-0">
        <AlertBody alert={a} rate={rate}>{isNew.has(a.key) && <span className="inline-block rounded-full bg-ll-primary px-2 py-0.5 text-xs text-ll-on-primary">ใหม่</span>}</AlertBody></li>)}</ul>
      {visible.length > ALERT_LIMIT && <p className="text-xs text-ll-ink-subtle">แสดง {ALERT_LIMIT} จาก {visible.length} จุดล่าสุด · ลดช่วงวันที่เพื่อดูส่วนที่เหลือ</p>}
    </>}
    {gone.length > 0 && <details className="rounded-lg border border-ll-hairline p-3"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-ll-primary">หายไประหว่างเปิดหน้านี้ {gone.length} จุด · ข้อมูลถูกกรอกเพิ่มหรือแก้ภายหลังจนยอดต่อกันแล้ว</summary>
      <ul className="max-h-72 overflow-auto">{gone.map(({ alert, at }) => <li key={alert.key} className="border-t border-ll-hairline py-3 text-sm first:border-t-0">
        <AlertBody alert={alert} rate={rate}><span className="text-xs text-ll-ink-subtle">หายไปตอน {when(at)} · ก่อนหน้านี้:</span></AlertBody></li>)}</ul></details>}
    <p className="text-xs text-ll-ink-subtle">เทียบเงินในบัญชีของคิวที่สำเร็จต่อกันตามเวลา: เงินก่อนหักของคิวถัดไปควรเท่ากับเงินก่อนหัก − ยอดที่หัก ของคิวก่อนหน้า · ค่าเงินบาทคิดจากเรทอ้างอิง {rate} THB ต่อ IDR ที่เลือกด้านบน เป็นค่าประมาณ · เช็คทุกสถานะในช่วงวันที่ ไม่ขึ้นกับตัวกรองสถานะ/ค้นหา และเช็คใหม่ทั้งช่วงทุกครั้งที่รีเฟรช ถ้ามีคนกรอกเพิ่มหรือแก้ย้อนหลังผลจะเปลี่ยนตาม · “แก้ข้อมูลภายหลัง” = แก้หลังสร้างเกิน {DONSHOP_LATE_MINUTES} นาที ระบบไม่รู้ว่าใครแก้หรือแก้อะไร · อ่านจากข้อมูลบอทอย่างเดียว ไม่แก้หรือบันทึกอะไร</p>
  </section>;
}
function History({ entries }) {
  return <div role="region" aria-label="ประวัติ Donshop" tabIndex={0} className="max-h-[70vh] overflow-auto rounded-xl border border-ll-hairline">
    <table className="w-full min-w-[1360px] text-left text-sm"><caption className="sr-only">ประวัติ Donshop ทุกสถานะ พร้อมยอด IDR คงเหลือหลังรายการสำเร็จ</caption><thead className="sticky top-0 bg-ll-surface-2"><tr>{["วันที่ (ไทย)", "Order / เกม / แพ็ก", "สถานะ", "ยอดโอน THB", "ต้นทุน THB", "กำไร THB / %", "IDR ออก", "IDR คงเหลือ", "รายละเอียด"].map((h, i) => <th key={h} scope="col" className={`whitespace-nowrap px-3 py-3 ${i >= 3 && i <= 7 ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
      <tbody>{entries.map((e) => <tr key={`${e.source}:${e.orderId}`} className="border-t border-ll-hairline bg-ll-surface-1 align-top">
        <td className="whitespace-nowrap px-3 py-3">{when(e.occurredAt)}</td>
        <td className="max-w-64 break-words px-3 py-3"><p className="break-all font-semibold">{e.orderId}</p><p className="mt-1">{e.details.game}</p><p className="mt-1 text-xs text-ll-ink-subtle">{e.details.pack}</p><p className="mt-1 text-xs text-ll-ink-subtle">ผู้เติม: {e.details.sheetOperator || e.details.operator}</p></td>
        <td className="px-3 py-3"><span className={`inline-block rounded-full px-2 py-1 text-xs ${e.completedCount ? "bg-ll-surface-2" : "border border-ll-hairline-strong"}`}>{statusText(e.statuses)}</span></td>
        <td className="px-3 py-3 text-right tabular-nums">{money(e.figures.sale)}{e.completedCount > 1 && <p className="mt-1 text-xs text-ll-ink-subtle">รวมแล้ว ไม่คิดซ้ำ</p>}</td>
        <td className="px-3 py-3 text-right tabular-nums">{money(e.figures.cost)}<p className="mt-1 text-xs text-ll-ink-subtle">{e.completedCount ? `อ้างอิงเรท ${e.details.costRate}` : "ไม่นับ"}</p></td>
        <td className="px-3 py-3 text-right tabular-nums">{money(e.figures.profit)}<p className="mt-1 text-xs text-ll-ink-subtle">{e.figures.margin == null ? "—" : `${e.figures.margin}%`}</p></td>
        <td className="px-3 py-3 text-right font-semibold tabular-nums">{money(e.used)}</td>
        <td className="px-3 py-3 text-right tabular-nums"><p className="font-semibold">{money(e.wallet?.amount)}</p><p className="mt-1 text-xs text-ll-ink-subtle">{e.wallet ? `ก่อนตัด ${money(e.wallet.before)}` : "ไม่มียอดก่อนตัด"}</p></td>
        <td className="max-w-72 break-words px-3 py-3"><details><summary className="min-h-11 cursor-pointer py-3 text-xs focus-visible:outline-2 focus-visible:outline-ll-primary">{e.fillCount} รายการย่อย</summary><p className="text-xs">ลูกค้า: {e.details.customer || "—"} · UID: {e.details.playerId || "—"}</p><ul className="mt-2 space-y-2 text-xs">{e.fills.map((f) => <li key={f.id} className="border-t border-ll-hairline py-2">
          <p>คิว {f.id} · {dsStatusLabel(f.status)} · {f.details.pack}</p>
          <p className="mt-1">{f.status === "completed" ? `IDR ออก ${money(f.used)}` : `ราคาที่บอทเสนอ ${money(f.quoted)} IDR · ไม่นับเป็นยอดออก`}</p>
          {f.wallet && <p className="mt-1">ก่อนตัด {money(f.wallet.before)} · หลังตัด {money(f.wallet.amount)} IDR</p>}
          <p className="mt-1 text-ll-ink-subtle">{when(f.occurredAt)}</p>
          <p className="mt-1 break-all text-ll-ink-subtle">{f.details.invoice || "ไม่มีเลขธุรกรรม"}</p>
        </li>)}</ul></details></td>
      </tr>)}</tbody>
    </table>{!entries.length && <p className="p-6 text-center text-sm text-ll-ink-subtle">ไม่พบรายการตามตัวกรอง</p>}
  </div>;
}
export default function DonshopInventory({ lang }) {
  const [filters, setFilters] = useState(() => ({ ...codaQuickDates("month"), search: "", status: "", rate: DONSHOP_REFERENCE_RATE, page: "1" }));
  const [draft, setDraft] = useState(filters), [data, setData] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [live, setLive] = useState(true), [updatedAt, setUpdatedAt] = useState(null), [stale, setStale] = useState("");
  const [settings, setSettings] = useState(DONSHOP_CHECK_DEFAULTS);
  const generation = useRef(0), alive = useRef(false), busy = useRef(0), viewKey = new URLSearchParams(filters).toString();
  const invalidate = useCallback(() => { generation.current++; }, []);
  useEffect(() => {
    const timer = setTimeout(() => { try { const saved = localStorage.getItem(SETTINGS_KEY); if (saved) setSettings(dsCheckSettings(JSON.parse(saved))); } catch { /* defaults */ } }, 0);
    return () => clearTimeout(timer);
  }, []);
  function saveSettings(next) { setSettings(next); try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch { /* per-viewer convenience only */ } }
  // A silent (auto) refresh keeps the current table on screen and reports failure without hiding data.
  const load = useCallback(async (silent = false) => {
    const version = ++generation.current; busy.current++;
    if (!silent) { setLoading(true); setError(""); }
    try {
      const result = await apiJson(`${endpoint}?${viewKey}`, { cache: "no-store" });
      if (!Array.isArray(result?.entries) || !result.summary || !Number.isFinite(result.total)) throw new Error("ข้อมูลไม่ครบ กรุณาโหลดใหม่");
      // Every refresh re-checks the whole range, so rows filled in late change the result. Within this page session (same view),
      // alerts that appear are marked "new" and alerts that disappear are kept as "resolved"; nothing is stored anywhere.
      if (alive.current && generation.current === version) { setData((prev) => {
        const same = prev?.viewKey === viewKey, now = new Set((result.alerts || []).map((a) => a.key)), old = new Set(same ? (prev.alerts || []).map((a) => a.key) : []);
        const fresh = same ? [...new Set([...prev.fresh, ...[...now].filter((key) => !old.has(key))])] : [];
        const resolved = same ? [...prev.resolved.filter((r) => !now.has(r.alert.key)), ...(prev.alerts || []).filter((a) => !now.has(a.key)).map((alert) => ({ alert, at: new Date().toISOString() }))] : [];
        return { ...result, viewKey, fresh, resolved };
      }); setUpdatedAt(new Date().toISOString()); setStale(""); }
    } catch (e) {
      if (alive.current && generation.current === version) { if (silent) setStale(e.message || "อัปเดตอัตโนมัติไม่สำเร็จ"); else setError(e.message || "โหลดข้อมูลไม่สำเร็จ"); }
    } finally { busy.current--; if (alive.current && generation.current === version && !silent) setLoading(false); }
  }, [viewKey]);
  useEffect(() => { alive.current = true; const timer = setTimeout(load, 0); return () => { alive.current = false; invalidate(); clearTimeout(timer); }; }, [load, invalidate]);
  useEffect(() => {
    if (!live) return undefined;
    const tick = () => { if (document.visibilityState === "visible" && busy.current === 0) void load(true); };
    const timer = setInterval(tick, LIVE_MS);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, [live, load]);
  function apply(next) { invalidate(); setError(""); setFilters(next); setDraft(next); if (new URLSearchParams(next).toString() === viewKey) void load(); }
  const ready = data?.viewKey === viewKey && !loading && !error;
  return <main className="mx-auto flex min-h-screen min-w-0 max-w-[1600px] flex-col gap-6 px-4 pb-14 pt-10 text-ll-ink sm:px-6">
    <header className="flex flex-wrap items-center justify-between gap-4 pr-12"><div><p className="text-xs text-ll-ink-tertiary">TOPUP INVENTORY</p><h1 className="mt-2 text-3xl font-semibold">(IDR) Donshop</h1><p className="mt-2 text-sm text-ll-ink-subtle">ประวัติจากบอททุกสถานะ · อ่านอย่างเดียว ไม่สั่งเติมและไม่หักยอดซ้ำ</p></div><Link href={topupInventoryPath(lang)} className={button}><ArrowLeft size={16} aria-hidden />กลับ Topup Inventory</Link></header>
    <form className="space-y-4 rounded-xl border border-ll-hairline bg-ll-surface-1 p-4" aria-label="กรอง Donshop" onSubmit={(e) => { e.preventDefault(); apply({ ...draft, page: "1" }); }}>
      <div className="flex flex-wrap gap-2">{[["today", "วันนี้"], ["yesterday", "เมื่อวาน"], ["month", "เดือนนี้"]].map(([key, title]) => <button type="button" key={key} className={button} onClick={() => apply({ ...draft, ...codaQuickDates(key), page: "1" })}>{title}</button>)}</div>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-5"><label className="space-y-2 text-sm"><span>วันที่เริ่มต้น</span><input type="date" required value={draft.dateFrom} className={input} onChange={(e) => setDraft({ ...draft, dateFrom: e.target.value })} /></label><label className="space-y-2 text-sm"><span>วันที่สิ้นสุด</span><input type="date" required value={draft.dateTo} className={input} onChange={(e) => setDraft({ ...draft, dateTo: e.target.value })} /></label><label className="space-y-2 text-sm"><span>สถานะ</span><select value={draft.status} className={input} onChange={(e) => setDraft({ ...draft, status: e.target.value })}><option value="">ทุกสถานะ</option>{DONSHOP_STATUSES.map(([key, title]) => <option key={key} value={key}>{title}</option>)}</select></label><label className="space-y-2 text-sm"><span>ค้นหา Order / คิว / เกม / ผู้เติม</span><input type="search" maxLength={200} value={draft.search} className={input} onChange={(e) => setDraft({ ...draft, search: e.target.value })} /></label><label className="space-y-2 text-sm"><span>เรทอ้างอิง THB ต่อ IDR</span><input type="number" min="0.00000001" max="999999" step="0.00000001" required value={draft.rate} className={input} onChange={(e) => setDraft({ ...draft, rate: e.target.value })} /></label></div>
      <div className="flex flex-wrap gap-2"><button type="submit" className={button}>ค้นหา / ใช้เรทนี้</button><button type="button" className={button} disabled={loading} onClick={() => load()}><RefreshCw size={16} aria-hidden />โหลดใหม่</button><button type="button" className={button} aria-pressed={live} onClick={() => setLive(!live)}><Radio size={16} aria-hidden />{live ? "อัปเดตอัตโนมัติ: เปิด" : "อัปเดตอัตโนมัติ: ปิด"}</button>{ready && <a className={button} href={`${endpoint}?${viewKey}&format=csv`} download><Download size={16} aria-hidden />Export CSV</a>}</div>
      <p role="status" className="text-xs text-ll-ink-subtle">{updatedAt ? `อัปเดตล่าสุด ${new Date(updatedAt).toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok" })}` : "ยังไม่ได้โหลด"}{live ? ` · ดึงใหม่ทุก ${LIVE_MS / 1000} วินาทีขณะเปิดแท็บนี้` : " · ปิดอัปเดตอัตโนมัติ"}{stale && ` · อัปเดตล่าสุดไม่สำเร็จ (${stale}) แสดงข้อมูลเดิม`}</p><p className="text-xs text-ll-ink-subtle">เวลาไทย · ไม่เกิน 93 วัน · เรทตั้งต้น {DONSHOP_REFERENCE_RATE} THB ต่อ IDR · การปรับมีผลต่อหน้าจอ/CSV เท่านั้น ไม่บันทึกหรือแก้ประวัติบอท</p>
    </form>
    {error && <p role="alert" className="rounded-xl border border-ll-hairline p-4 text-sm">{error} · กดโหลดใหม่เพื่อลองอีกครั้ง</p>}{loading && <p role="status" className="text-sm text-ll-ink-subtle">กำลังโหลดข้อมูล…</p>}
    {ready && <>
      <ChecksPanel alerts={data.alerts || []} fresh={data.fresh} resolved={data.resolved} rate={data.rate} settings={settings} onSettings={saveSettings} />
      <section className="grid gap-4 sm:grid-cols-2" aria-label="ยอดคงเหลือและสถานะ"><WalletCard data={data} /><StatusCard summary={data.summary} /></section>
      <p className="rounded-xl border border-ll-hairline bg-ll-surface-1 p-4 text-sm">IDR ออกใช้ live_cost_total ที่บอทบันทึก (หรือ live_cost × จำนวน) ของรายการสำเร็จ ต้นทุน THB = IDR ออก × เรทที่เลือก เป็นค่าอ้างอิง ไม่ใช่ต้นทุนซื้อจริงย้อนหลัง · ล็อต SYSTEM/NONE ต้นทุน 0 ไม่ถูกนำมาใช้</p>
      <section className="space-y-4" aria-label="ผลการค้นหา"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">ประวัติ Donshop · {data.total} ออเดอร์</h2><p className="text-sm text-ll-ink-subtle">{data.summary.delivered} ออเดอร์สำเร็จ · {data.summary.fills} รายการย่อย</p></div><dl className="grid gap-3 rounded-xl border border-ll-hairline bg-ll-surface-1 p-4 sm:grid-cols-2 lg:grid-cols-4">{[["ยอดโอน THB", data.summary.sale], ["ต้นทุน THB (อ้างอิง)", data.summary.cost], ["กำไร THB (อ้างอิง)", data.summary.profit], ["IDR ออกตามตัวกรอง", data.summary.used]].map(([title, v]) => <div key={title}><dt className="text-xs text-ll-ink-subtle">{title}</dt><dd className="mt-2 text-xl font-semibold tabular-nums">{money(v)}</dd></div>)}</dl>
        <p className="text-xs text-ll-ink-subtle">กำไร % = (ยอดโอน − ต้นทุน) ÷ ยอดโอน × 100 · ค่าอ้างอิงจะเปลี่ยนเมื่อปรับเรท</p>
        {(data.summary.missingSales > 0 || data.summary.missingCosts > 0) && <p role="status" className="text-sm text-ll-ink-subtle">ข้อมูลไม่ครบ: ยอดโอน {data.summary.missingSales} · ยอดออก {data.summary.missingUsage} · ต้นทุน {data.summary.missingCosts} ออเดอร์ ยอดรวมที่ข้อมูลไม่ครบแสดง — ไม่แทนด้วยศูนย์</p>}
        <History entries={data.entries} /><nav aria-label="เปลี่ยนหน้าประวัติ" className="flex items-center justify-end gap-3"><button type="button" className={button} disabled={data.page <= 1} onClick={() => apply({ ...filters, page: String(data.page - 1) })}>ก่อนหน้า</button><span className="text-sm">หน้า {data.page} / {Math.max(1, Math.ceil(data.total / data.pageSize))}</span><button type="button" className={button} disabled={data.page * data.pageSize >= data.total} onClick={() => apply({ ...filters, page: String(data.page + 1) })}>ถัดไป</button></nav>
      </section>
    </>}
  </main>;
}
