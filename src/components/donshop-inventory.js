"use client";
import { createInventoryPageSession } from "@/lib/inventory-page-session";
import { TablePagination } from "@/components/table-pagination";
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Radio, RefreshCw } from "lucide-react";
import TopupInventoryPage from "@/components/topup-inventory-page";
import { tivButton as button, tivCard, tivCheck, tivField, tivInput as input, tivPrimary, tivTable, tivTableBox } from "@/lib/topup-inventory-ui";
import { codaQuickDates } from "@/lib/usdcodashop-overview";
import { DONSHOP_CHECK_DEFAULTS, DONSHOP_CHECK_KINDS, DONSHOP_LATE_MINUTES, DONSHOP_REFERENCE_RATE, DONSHOP_STATUSES, dsCheckSettings, dsStatusLabel, dsSum, dsVisibleAlerts } from "@/lib/donshop-inventory";
const endpoint = "/api/projectm/donshop";
// Polls only while the tab is visible; each read hits the shared production DB.
const LIVE_MS = 30_000;
// Check settings live in this browser only; nothing about the checks is written to any database.
const SETTINGS_KEY = "donshop-check-settings";
const money = (v) => v == null ? "—" : Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const when = (v) => v ? new Date(v).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" }) : "ไม่ระบุเวลา";
const statusText = (statuses) => Object.entries(statuses).map(([key, n]) => `${dsStatusLabel(key)}${n > 1 ? ` ×${n}` : ""}`).join(" · ");
function WalletCard({ data }) {
  return <article className="tiv-kpi">
    <small>ยอด Donshop หลังออเดอร์สำเร็จล่าสุด</small>
    <b className={data.balance == null ? "mut" : ""}>{money(data.balance)} IDR</b>
    <p className="break-all">{data.balance == null ? "ยังไม่มีออเดอร์สำเร็จที่บันทึกยอดก่อนตัด ไม่ใช่ยอดศูนย์" : `คำนวณเมื่อ ${when(data.balanceAt)} · ยอดก่อนตัด − ยอดตัด ของ ${data.balanceOrderId}`}</p>
    <p>ไม่ใช่ยอดสดตอนเปิดหน้า ไม่เปลี่ยนตามตัวกรอง และไม่นับการเติมเงินเข้าที่เกิดหลังออเดอร์นั้น</p>
  </article>;
}
function StatusCard({ summary }) {
  return <article className="tiv-kpi"><small>รายการย่อยตามสถานะ (ตามตัวกรอง)</small>
    <dl className="mt-1 grid grid-cols-2 gap-3 sm:grid-cols-4">{DONSHOP_STATUSES.map(([key, title]) => <div key={key} className="min-w-0"><dt className="text-xs text-ll-ink-subtle">{title}</dt><dd className="mt-1 text-lg font-bold tabular-nums">{summary.statuses[key] || 0}</dd></div>)}</dl>
    <p>ยอดโอน ต้นทุน กำไร และ IDR ออก นับเฉพาะรายการสำเร็จ · สถานะอื่นแสดงเพื่อตรวจสอบเท่านั้น</p>
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
  return <details className="rounded-[18px] border border-ll-hairline px-4 py-1"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">ตั้งค่าการเช็ค</summary>
    <div className="mt-2 grid items-end gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
      <label className={tivCheck}><input type="checkbox" checked={settings.enabled} onChange={(e) => onChange({ ...settings, enabled: e.target.checked })} />เปิดการเช็คยอด</label>
      {DONSHOP_CHECK_KINDS.map(([key, title]) => <label key={key} className={tivCheck}><input type="checkbox" disabled={!settings.enabled} checked={settings.kinds[key]} onChange={(e) => onChange({ ...settings, kinds: { ...settings.kinds, [key]: e.target.checked } })} />{title}</label>)}
      <label className={tivField}><span>ไม่แจ้งยอดที่ต่างน้อยกว่า (IDR)</span><input type="number" min="0" step="1" disabled={!settings.enabled} value={settings.minIdr} className={`${input} num`} onChange={(e) => onChange({ ...settings, minIdr: e.target.value })} /></label>
    </div>
    <p className="tiv-hint mb-3">บันทึกไว้ในเบราว์เซอร์นี้เท่านั้น ไม่บันทึกลงฐานข้อมูล</p>
  </details>;
}
function ChecksPanel({ alerts, fresh, resolved, rate, settings, onSettings }) {
  const visible = dsVisibleAlerts(alerts, settings), lost = visible.filter((a) => a.kind === "gap" || a.kind === "charged");
  const total = (list) => dsSum(list, (a) => a.amount), isNew = new Set(fresh), newCount = visible.filter((a) => isNew.has(a.key)).length;
  const goneKeys = new Set(dsVisibleAlerts(resolved.map((r) => r.alert), settings).map((a) => a.key)), gone = resolved.filter((r) => goneKeys.has(r.alert.key));
  return <section aria-label="เช็คยอด Donshop" className={`${tivCard} flex flex-col gap-3`}>
    <div className="tiv-card-h mb-0"><h2>เช็คยอดเงินไม่ตรง</h2></div>
    <CheckSettings settings={settings} onChange={onSettings} />
    {!settings.enabled ? <p className="tiv-muted">ปิดการเช็คอยู่</p> : !visible.length ? <p role="status" className="text-sm tiv-good">ไม่พบยอดเงินไม่ตรงในช่วงวันที่นี้ตามที่ตั้งค่าไว้</p> : <>
      <p role={lost.length ? "alert" : "status"} className={`text-sm font-semibold${lost.length ? " tiv-bad" : ""}`}>พบ {visible.length} จุดที่ยอดเงินไม่ตรง{newCount > 0 && ` · ใหม่ ${newCount} จุดตั้งแต่เปิดหน้านี้`}{lost.length > 0 && ` · เงินหายรวม ${withBaht(total(lost), rate)} · ไม่ทราบสาเหตุ ${idr(total(lost.filter((a) => a.kind === "gap")))} · คิวไม่สำเร็จแต่โดนหัก ${idr(total(lost.filter((a) => a.kind === "charged")))}`}</p>
      <ul className={`${tivTableBox} max-h-128 overflow-auto`}>{visible.slice(0, ALERT_LIMIT).map((a) => <li key={a.key} className="border-t border-ll-hairline px-4 py-3 text-sm first:border-t-0">
        <AlertBody alert={a} rate={rate}>{isNew.has(a.key) && <span className="inline-block rounded-full bg-ll-primary px-2 py-0.5 text-xs text-ll-on-primary">ใหม่</span>}</AlertBody></li>)}</ul>
      {visible.length > ALERT_LIMIT && <p className="tiv-muted">แสดง {ALERT_LIMIT} จาก {visible.length} จุดล่าสุด · ลดช่วงวันที่เพื่อดูส่วนที่เหลือ</p>}
    </>}
    {gone.length > 0 && <details className="rounded-[18px] border border-ll-hairline px-4 py-1"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">หายไประหว่างเปิดหน้านี้ {gone.length} จุด · ข้อมูลถูกกรอกเพิ่มหรือแก้ภายหลังจนยอดต่อกันแล้ว</summary>
      <ul className="max-h-72 overflow-auto">{gone.map(({ alert, at }) => <li key={alert.key} className="border-t border-ll-hairline py-3 text-sm first:border-t-0">
        <AlertBody alert={alert} rate={rate}><span className="text-xs text-ll-ink-subtle">หายไปตอน {when(at)} · ก่อนหน้านี้:</span></AlertBody></li>)}</ul></details>}
    <p className="tiv-hint mt-0">เทียบเงินในบัญชีของคิวที่สำเร็จต่อกันตามเวลา: เงินก่อนหักของคิวถัดไปควรเท่ากับเงินก่อนหัก − ยอดที่หัก ของคิวก่อนหน้า · ค่าเงินบาทคิดจากเรทอ้างอิง {rate} THB ต่อ IDR ที่เลือกด้านบน เป็นค่าประมาณ · เช็คทุกสถานะในช่วงวันที่ ไม่ขึ้นกับตัวกรองสถานะ/ค้นหา และเช็คใหม่ทั้งช่วงทุกครั้งที่รีเฟรช ถ้ามีคนกรอกเพิ่มหรือแก้ย้อนหลังผลจะเปลี่ยนตาม · “แก้ข้อมูลภายหลัง” = แก้หลังสร้างเกิน {DONSHOP_LATE_MINUTES} นาที ระบบไม่รู้ว่าใครแก้หรือแก้อะไร · อ่านจากข้อมูลบอทอย่างเดียว ไม่แก้หรือบันทึกอะไร</p>
  </section>;
}
function History({ entries }) {
  return <div role="region" aria-label="ประวัติ Donshop" tabIndex={0} className={`${tivTableBox} max-h-[70vh] overflow-auto`}>
    <table className={`${tivTable} min-w-[1360px]`}><caption className="sr-only">ประวัติ Donshop ทุกสถานะ พร้อมยอด IDR คงเหลือหลังรายการสำเร็จ</caption><thead className="sticky top-0 z-10 backdrop-blur"><tr>{["วันที่ (ไทย)", "Order / เกม / แพ็ก", "สถานะ", "ยอดโอน THB", "ต้นทุน THB", "กำไร THB / %", "IDR ออก", "IDR คงเหลือ", "รายละเอียด"].map((h, i) => <th key={h} scope="col" className={i >= 3 && i <= 7 ? "r" : ""}>{h}</th>)}</tr></thead>
      <tbody>{entries.map((e) => <tr key={`${e.source}:${e.orderId}`}>
        <td className="whitespace-nowrap">{when(e.occurredAt)}</td>
        <td className="max-w-64 break-words"><span className="oid">{e.orderId}</span>{e.details.game}<span className="sm">{e.details.pack}</span><span className="sm">ผู้เติม: {e.details.sheetOperator || e.details.operator}</span></td>
        <td><span className={`inline-block rounded-full px-2 py-1 text-xs ${e.completedCount ? "bg-ll-surface-2" : "border border-ll-hairline-strong"}`}>{statusText(e.statuses)}</span></td>
        <td className="r">{money(e.figures.sale)}{e.completedCount > 1 && <span className="sm">รวมแล้ว ไม่คิดซ้ำ</span>}</td>
        <td className="r">{money(e.figures.cost)}<span className="sm">{e.completedCount ? `อ้างอิงเรท ${e.details.costRate}` : "ไม่นับ"}</span></td>
        <td className="r"><span className={Number(e.figures.profit) > 0 ? "tiv-pos" : Number(e.figures.profit) < 0 ? "tiv-neg" : ""}>{money(e.figures.profit)}</span><span className="sm">{e.figures.margin == null ? "—" : `${e.figures.margin}%`}</span></td>
        <td className="r b">{money(e.used)}</td>
        <td className="r b">{money(e.wallet?.amount)}<span className="sm font-normal">{e.wallet ? `ก่อนตัด ${money(e.wallet.before)}` : "ไม่มียอดก่อนตัด"}</span></td>
        <td className="max-w-72 break-words"><details><summary>{e.fillCount} รายการย่อย</summary><div className="tiv-subbox"><p>ลูกค้า: {e.details.customer || "—"} · UID: {e.details.playerId || "—"}</p><ul className="mt-2 space-y-2">{e.fills.map((f) => <li key={f.id} className="border-t border-ll-hairline pt-2">
          <p>คิว {f.id} · {dsStatusLabel(f.status)} · {f.details.pack}</p>
          <p>{f.status === "completed" ? `IDR ออก ${money(f.used)}` : `ราคาที่บอทเสนอ ${money(f.quoted)} IDR · ไม่นับเป็นยอดออก`}</p>
          {f.wallet && <p>ก่อนตัด {money(f.wallet.before)} · หลังตัด {money(f.wallet.amount)} IDR</p>}
          <p>{when(f.occurredAt)}</p>
          <p className="break-all">{f.details.invoice || "ไม่มีเลขธุรกรรม"}</p>
        </li>)}</ul></div></details></td>
      </tr>)}</tbody>
    </table>{!entries.length && <div className="tiv-dempty m-4"><strong>ยังไม่มีรายการ</strong>ไม่พบรายการตามตัวกรอง</div>}
  </div>;
}
export default function DonshopInventory({ lang }) {
  const [filters, setFilters] = useState(() => ({ ...codaQuickDates("month"), search: "", status: "", rate: DONSHOP_REFERENCE_RATE, page: "1" }));
  const [draft, setDraft] = useState(filters), [data, setData] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [live, setLive] = useState(true), [updatedAt, setUpdatedAt] = useState(null), [stale, setStale] = useState("");
  const [settings, setSettings] = useState(DONSHOP_CHECK_DEFAULTS);
  const generation = useRef(0), alive = useRef(false), busy = useRef(0), viewKey = new URLSearchParams(filters).toString();
  const [pageReader] = useState(() => createInventoryPageSession());
  const invalidate = useCallback(() => { generation.current++; pageReader.cancel(); }, [pageReader]);
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
      const result = await pageReader.run(endpoint, viewKey);
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
  }, [viewKey, pageReader]);
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
  const quick = Object.entries({ today: "วันนี้", yesterday: "เมื่อวาน", month: "เดือนนี้" }).map(([key, title]) => ({ key, title, on: Object.entries(codaQuickDates(key)).every(([k, v]) => filters[k] === v) }));
  return <TopupInventoryPage provider="donshop" description="เฉพาะคิวที่บอทเป็นคนทำ ทุกสถานะ · ไม่รวมคิวที่คนเติมหรือแก้เองโดยไม่มีข้อมูลบอท · อ่านอย่างเดียว ไม่สั่งเติมและไม่หักยอดซ้ำ">
    <form className={tivCard} aria-label="กรอง Donshop" onSubmit={(e) => { e.preventDefault(); apply({ ...draft, page: "1" }); }}>
      <div className="tiv-tools">{quick.map(({ key, title, on }) => <button type="button" key={key} aria-pressed={on} className={`${button}${on ? " on" : ""}`} onClick={() => apply({ ...draft, ...codaQuickDates(key), page: "1" })}>{title}</button>)}</div>
      <div className="tiv-fields mt-4"><label className={tivField}><span>วันที่เริ่มต้น</span><input type="date" required value={draft.dateFrom} className={input} onChange={(e) => setDraft({ ...draft, dateFrom: e.target.value })} /></label><label className={tivField}><span>วันที่สิ้นสุด</span><input type="date" required value={draft.dateTo} className={input} onChange={(e) => setDraft({ ...draft, dateTo: e.target.value })} /></label><label className={tivField}><span>สถานะ</span><select value={draft.status} className={input} onChange={(e) => setDraft({ ...draft, status: e.target.value })}><option value="">ทุกสถานะ</option>{DONSHOP_STATUSES.map(([key, title]) => <option key={key} value={key}>{title}</option>)}</select></label><label className={tivField}><span>ค้นหา Order / คิว / เกม / ผู้เติม</span><input type="search" maxLength={200} value={draft.search} className={input} onChange={(e) => setDraft({ ...draft, search: e.target.value })} /></label><label className={tivField}><span>เรทอ้างอิง THB ต่อ IDR</span><input type="number" min="0.00000001" max="999999" step="0.00000001" required value={draft.rate} className={`${input} num`} onChange={(e) => setDraft({ ...draft, rate: e.target.value })} /></label></div>
      <div className="tiv-tools mt-4"><button type="submit" className={tivPrimary}>ค้นหา / ใช้เรทนี้</button><button type="button" className={button} disabled={loading} onClick={() => load()}><RefreshCw size={16} aria-hidden />โหลดใหม่</button><button type="button" className={`${button}${live ? " on" : ""}`} aria-pressed={live} onClick={() => setLive(!live)}><Radio size={16} aria-hidden />{live ? "อัปเดตอัตโนมัติ: เปิด" : "อัปเดตอัตโนมัติ: ปิด"}</button>{ready && <a className={button} href={`${endpoint}?${viewKey}&format=csv`} download><Download size={16} aria-hidden />Export CSV</a>}</div>
      <div className="tiv-foots mt-4"><span role="status">{updatedAt ? `อัปเดตล่าสุด ${new Date(updatedAt).toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok" })}` : "ยังไม่ได้โหลด"}{live ? ` · ดึงใหม่ทุก ${LIVE_MS / 1000} วินาทีขณะเปิดแท็บนี้` : " · ปิดอัปเดตอัตโนมัติ"}{stale && ` · อัปเดตล่าสุดไม่สำเร็จ (${stale}) แสดงข้อมูลเดิม`}</span><span>เวลาไทย · ไม่เกิน 93 วัน · เรทตั้งต้น {DONSHOP_REFERENCE_RATE} THB ต่อ IDR · การปรับมีผลต่อหน้าจอ/CSV เท่านั้น ไม่บันทึกหรือแก้ประวัติบอท</span></div>
    </form>
    {error && <p role="alert" className="tiv-alert">{error} · กดโหลดใหม่เพื่อลองอีกครั้ง</p>}{loading && <p role="status" className="tiv-muted">กำลังโหลดข้อมูล…</p>}
    {ready && <>
      <ChecksPanel alerts={data.alerts || []} fresh={data.fresh} resolved={data.resolved} rate={data.rate} settings={settings} onSettings={saveSettings} />
      <section className="tiv-two" aria-label="ยอดคงเหลือและสถานะ"><WalletCard data={data} /><StatusCard summary={data.summary} /></section>
      <p className="tiv-banner">IDR ออกใช้ live_cost_total ที่บอทบันทึก (หรือ live_cost × จำนวน) ของรายการสำเร็จ ต้นทุน THB = IDR ออก × เรทที่เลือก เป็นค่าอ้างอิง ไม่ใช่ต้นทุนซื้อจริงย้อนหลัง · ล็อต SYSTEM/NONE ต้นทุน 0 ไม่ถูกนำมาใช้</p>
      <section className="flex flex-col gap-4" aria-label="ผลการค้นหา"><div className="tiv-sect-h"><h2>ประวัติ Donshop · {data.total} ออเดอร์</h2><span>{data.summary.delivered} ออเดอร์สำเร็จ · {data.summary.fills} รายการย่อย</span></div><dl className="tiv-kpis">{[["ยอดโอน THB", data.summary.sale], ["ต้นทุน THB (อ้างอิง)", data.summary.cost], ["กำไร THB (อ้างอิง)", data.summary.profit], ["IDR ออกตามตัวกรอง", data.summary.used]].map(([title, v]) => <div key={title} className="tiv-kpi"><dt>{title}</dt><dd className={v == null ? "mut" : ""}>{money(v)}</dd></div>)}</dl>
        <div className="tiv-foots"><span>กำไร % = (ยอดโอน − ต้นทุน) ÷ ยอดโอน × 100 · ค่าอ้างอิงจะเปลี่ยนเมื่อปรับเรท</span>
          {(data.summary.missingSales > 0 || data.summary.missingCosts > 0) && <span role="status">ข้อมูลไม่ครบ: ยอดโอน {data.summary.missingSales} · ยอดออก {data.summary.missingUsage} · ต้นทุน {data.summary.missingCosts} ออเดอร์ ยอดรวมที่ข้อมูลไม่ครบแสดง — ไม่แทนด้วยศูนย์</span>}</div>
        <History entries={data.entries} /><TablePagination page={data.page} pageSize={data.pageSize} total={data.total} totalPages={Math.max(1, Math.ceil(data.total / data.pageSize))} observedAt={data.pagination?.observedAt} loading={loading} onPage={(page) => apply({ ...filters, page: String(page) })} onPageSize={(size) => apply({ ...filters, page: "1", pageSize: String(size) })} label="แบ่งหน้าประวัติ" />
      </section>
    </>}
  </TopupInventoryPage>;
}
