"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, Moon, RefreshCw, Sun } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { useLLTheme } from "@/lib/ll-theme";
import { bangkokWorkday, calculateStaffing, defaultStaffPlan, normalizeStaffPlan } from "@/lib/workforce-planning";

const STORAGE_KEY = "inblackm.workforce.plan.v2";
const fmt = value => value == null ? "—" : new Intl.NumberFormat("th-TH", { maximumFractionDigits: 1 }).format(value);
const dateLabel = value => new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", timeZone: "Asia/Bangkok" }).format(new Date(`${value}T12:00:00+07:00`));
const timeLabel = value => new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok", hourCycle: "h23" }).format(new Date(value));
const panel = "rounded-xl border border-ll-hairline bg-ll-surface-1";
const input = "w-full rounded-lg border border-ll-hairline-strong bg-ll-surface-1 px-2.5 py-1.5 text-sm text-ll-ink outline-none focus-visible:ring-2 focus-visible:ring-ll-primary disabled:opacity-50";
const CHANNEL_OPTIONS = [["all", "ทุกช่องทาง"], ["web", "เว็บ InblackM"], ["russia", "Russia"], ["inblackm_reseller", "InblackM Reseller"], ["page", "PAGE"], ["kaleoz", "Kaleoz"], ["itemku", "Itemku"], ["playerok", "PlayerOK"], ["g2g", "G2G"], ["telegram_other", "Telegram / อื่น ๆ"]];

function Stat({ label, value, detail, accent }) {
  return <div className={`${panel} px-4 py-3`}>
    <p className="text-xs text-ll-ink-subtle">{label}</p>
    <p className={`mt-1 text-2xl font-semibold tabular-nums tracking-tight ${accent ? "text-ll-primary" : ""}`}>{fmt(value)}</p>
    <p className="mt-0.5 truncate text-[11px] text-ll-ink-tertiary">{detail}</p>
  </div>;
}

function OrdersChart({ actual }) {
  const max = Math.max(1, ...actual.map(h => h.orders || 0));
  return <div className="overflow-x-auto"><div className="min-w-[560px]">
    <div className="flex h-32 items-end gap-1 border-b border-ll-hairline" role="img" aria-label="ออเดอร์จริงต่อชั่วโมง มีตัวเลขในตารางด้านล่าง">
      {actual.map(h => <div key={h.hour} className="flex h-full flex-1 items-end" title={`${timeLabel(h.hour)} · ${fmt(h.orders)} ออเดอร์ · ${fmt(h.units)} ชิ้นงาน`}>
        <div className="w-full rounded-t bg-ll-primary" style={{ height: `${h.orders ? Math.max(2, h.orders / max * 100) : 0}%` }} />
      </div>)}
    </div>
    <div className="mt-1 flex gap-1">{actual.map((h, i) => <span key={h.hour} className="flex-1 text-center text-[10px] tabular-nums text-ll-ink-tertiary">{i % 3 === 0 ? timeLabel(h.hour) : ""}</span>)}</div>
  </div></div>;
}

export default function WorkforceDashboard() {
  const [theme, toggleTheme] = useLLTheme();
  const [date, setDate] = useState(() => bangkokWorkday());
  const [channel, setChannel] = useState("all");
  const [refresh, setRefresh] = useState(0);
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const [plan, setPlan] = useState(defaultStaffPlan);
  const [storageNotice, setStorageNotice] = useState("");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      // Reading a browser-only saved preference once after hydration is
      // intentional; never store staff plans in the order databases.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (stored) setPlan(normalizeStaffPlan(JSON.parse(stored)));
    } catch { /* unavailable storage does not block the dashboard */ }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    apiJson(`/api/workforce?date=${date}&channel=${encodeURIComponent(channel)}`, { signal: controller.signal, cache: "no-store" })
      .then(data => { if (!controller.signal.aborted) { setReport(data.report); setError(""); } })
      .catch(err => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [date, channel, refresh]);

  const staffing = useMemo(() => calculateStaffing(report?.forecast || [], plan), [report, plan]);
  const updatePlan = next => {
    const normalized = normalizeStaffPlan(next);
    setPlan(normalized);
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized)); setStorageNotice("บันทึกในเครื่องนี้แล้ว"); }
    catch { setStorageNotice("บันทึกในเครื่องไม่ได้ ค่าจะอยู่จนกว่าจะปิดหน้า"); }
  };
  const reload = () => { setReport(null); setError(""); setRefresh(n => n + 1); };
  const s = report?.summary;

  return <div data-theme={theme} className="min-h-screen bg-ll-canvas text-ll-ink">
    <header className="border-b border-ll-hairline bg-ll-surface-1"><div className="mx-auto flex max-w-[1280px] flex-wrap items-end gap-3 px-4 py-3 sm:px-6">
      <div className="mr-auto">
        <Link href="/" className="inline-flex items-center gap-1 text-xs text-ll-ink-subtle hover:text-ll-ink"><ArrowLeft size={13} /> INBLACKM Tools</Link>
        <h1 className="text-xl font-semibold tracking-tight">Workforce · อัตราออเดอร์ต่อชั่วโมง</h1>
      </div>
      <label className="text-xs text-ll-ink-subtle"><span className="mb-1 block">วันทำงาน (09:00–09:00)</span><input type="date" value={date} max={bangkokWorkday()} className={input} onChange={e => { if (e.target.value) { setDate(e.target.value); setReport(null); setError(""); } }} /></label>
      <label className="text-xs text-ll-ink-subtle"><span className="mb-1 block">ช่องทาง</span><select aria-label="ช่องทาง" value={channel} className={input} onChange={e => { setChannel(e.target.value); setReport(null); setError(""); }}>
        {CHANNEL_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <div className="flex gap-2">
        <button onClick={reload} type="button" className="inline-flex items-center gap-1.5 rounded-lg border border-ll-hairline-strong bg-ll-surface-1 px-2.5 py-1.5 text-sm text-ll-ink outline-none focus-visible:ring-2 focus-visible:ring-ll-primary"><RefreshCw size={14} /> อัปเดตข้อมูล</button>
        <button type="button" onClick={toggleTheme} className="rounded-lg border border-ll-hairline p-2" aria-label="สลับธีมสว่าง/มืด">{theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}</button>
      </div>
    </div></header>

    <main className="mx-auto max-w-[1280px] space-y-4 px-4 py-4 sm:px-6">
      {error && <div role="alert" className="rounded-xl border border-ll-primary/30 bg-ll-primary/10 p-3 text-sm">{error} <button type="button" onClick={reload} className="ml-2 underline">ลองใหม่</button></div>}
      {!report && !error && <div role="status" className={`${panel} p-8 text-center text-sm text-ll-ink-subtle`}>กำลังรวมข้อมูลจากฐานเว็บและฐานบอท…</div>}
      {report && <>
        {report.warnings.length > 0 && <details role="alert" className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
          <summary className="flex cursor-pointer items-center gap-2 font-semibold"><AlertTriangle size={14} /> ข้อจำกัดข้อมูล {report.warnings.length} รายการ — อย่าตีความแหล่งที่หายไปเป็นศูนย์</summary>
          <ul className="mt-2 list-inside list-disc space-y-0.5">{report.warnings.map(w => <li key={w}>{w}</li>)}</ul>
        </details>}

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat accent label="ออเดอร์ / ชั่วโมง" value={s.ordersPerHour} detail={`สูงสุด ${fmt(s.peakOrdersPerHour)} · รวม ${fmt(s.orders)} ออเดอร์`} />
          <Stat label="ชิ้นงาน / ชั่วโมง" value={s.averagePerHour} detail={`สูงสุด ${fmt(s.peakPerHour)} · รวม ${fmt(s.units)} ชิ้นงาน`} />
          <Stat label={`คาดการณ์ ${dateLabel(report.forecastDate)}`} value={s.expectedUnits} detail="ชิ้นงานใหม่ ไม่รวมคงค้าง" />
          <Stat label="คนที่ต้องใช้ (ชม.พีค)" value={staffing.peakPeople} detail={plan.rate > 0 ? `คงค้าง ${fmt(s.openUnits)} ชิ้นงาน` : "ใส่อัตราต่อคนด้านล่างก่อน"} />
        </section>

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <section className={`${panel} min-w-0 p-4`}>
            <div className="mb-3 flex items-baseline justify-between gap-2"><h2 className="text-sm font-semibold">ออเดอร์จริงต่อชั่วโมง</h2><p className="text-xs text-ll-ink-subtle">{dateLabel(report.date)} 09:00 → วันถัดไป 09:00</p></div>
            <OrdersChart actual={report.actual} />
          </section>
          <section className={`${panel} space-y-3 p-4`}>
            <h2 className="text-sm font-semibold">ตั้งค่ากำลังคน</h2>
            <label className="block text-xs text-ll-ink-subtle"><span className="mb-1 block">ชิ้นงาน / คน / ชม.</span><input type="number" min="0" max="1000" step="0.5" className={input} value={plan.rate} onChange={e => updatePlan({ ...plan, rate: e.target.value })} /></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs text-ll-ink-subtle"><span className="mb-1 block">เวลาทำงานจริง %</span><input type="number" min="1" max="100" className={input} value={plan.utilization} onChange={e => updatePlan({ ...plan, utilization: e.target.value })} /></label>
              <label className="block text-xs text-ll-ink-subtle"><span className="mb-1 block">งานที่ใช้คน %</span><input type="number" min="0" max="100" className={input} value={plan.humanShare} onChange={e => updatePlan({ ...plan, humanShare: e.target.value })} /></label>
            </div>
            <p role="status" className="text-[11px] leading-relaxed text-ll-ink-tertiary">{storageNotice || "บันทึกเฉพาะเบราว์เซอร์นี้ · ไม่ใส่อัตรา = ยังไม่แนะนำจำนวนคน"}</p>
          </section>
        </div>

        <section className={`${panel} overflow-hidden`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3"><h2 className="text-sm font-semibold">รายชั่วโมง</h2><p className="text-xs text-ll-ink-subtle">คาดการณ์ = {dateLabel(report.forecastDate)} · คนที่ต้องใช้คิดจากคาดการณ์</p></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm tabular-nums">
            <thead className="bg-ll-surface-2 text-xs text-ll-ink-subtle"><tr>{["เวลา", "ออเดอร์", "ชิ้นงาน", "คาดการณ์", "ช่วงต่ำ–สูง", "คนที่ต้องใช้"].map(h => <th key={h} className="px-4 py-2 font-medium">{h}</th>)}</tr></thead>
            <tbody>{staffing.hours.map((h, i) => <tr key={h.hour} className="border-t border-ll-hairline">
              <td className="px-4 py-1.5">{timeLabel(h.hour)}{i >= 15 && <span className="ml-1 text-[11px] text-ll-ink-tertiary">+1</span>}</td>
              <td className="px-4 py-1.5 font-medium">{fmt(report.actual[i]?.orders)}</td>
              <td className="px-4 py-1.5">{fmt(report.actual[i]?.units)}</td>
              <td className="px-4 py-1.5">{fmt(h.expected)}</td>
              <td className="px-4 py-1.5 text-ll-ink-subtle">{h.expected == null ? "—" : `${fmt(h.low)}–${fmt(h.high)}`}</td>
              <td className="px-4 py-1.5">{fmt(h.people)}</td>
            </tr>)}</tbody>
          </table></div>
        </section>

        <details className={`${panel} overflow-hidden`}>
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">สรุปแยกช่องทาง</summary>
          <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm tabular-nums">
            <thead className="bg-ll-surface-2 text-xs text-ll-ink-subtle"><tr>{["ช่องทาง", "ออเดอร์", "ชิ้นงาน", "คงค้าง", "คาดการณ์", "เริ่มมีข้อมูล"].map(h => <th key={h} className="px-4 py-2 font-medium">{h}</th>)}</tr></thead>
            <tbody>{report.channels.map(c => <tr className="border-t border-ll-hairline" key={c.id}>
              <td className="px-4 py-1.5 font-medium">{c.label}</td><td className="px-4 py-1.5">{fmt(c.orders)}</td><td className="px-4 py-1.5">{fmt(c.units)}</td><td className="px-4 py-1.5">{fmt(c.openUnits)}</td><td className="px-4 py-1.5">{fmt(c.predicted)}</td>
              <td className="px-4 py-1.5 text-xs text-ll-ink-subtle">{c.coverageStart ? new Date(c.coverageStart).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok" }) : "ไม่มีข้อมูลในช่วง"}</td>
            </tr>)}</tbody>
          </table></div>
        </details>

        <details className={`${panel} px-4 py-3 text-xs text-ll-ink-subtle`}><summary className="cursor-pointer font-medium">แหล่งข้อมูลและวิธีนับ</summary>
          <p className="mt-2 leading-relaxed">เว็บนับเฉพาะออเดอร์ยืนยันชำระเงินแล้ว รวมงานย่อยใต้เลขออเดอร์หลัก · Marketplace ใช้รหัสออเดอร์และจำนวนที่สั่ง · Russia ใช้ task ไม่ซ้ำในออเดอร์ · ถ้าต้นทางไม่มีจำนวนจะนับ 1 ชิ้นงานต่อแถว · คาดการณ์อิงวันในสัปดาห์และชั่วโมงเดียวกันย้อนหลังสูงสุด 8 สัปดาห์ ช่วงต่ำ–สูงเป็นความแปรปรวนจากอดีต ไม่ใช่ค่ารับประกัน · คงค้างนับย้อนหลังตั้งแต่ {report.historyStart}</p>
          <ul className="mt-2 grid gap-0.5 sm:grid-cols-2">{report.sources.map(src => <li key={`${src.database}/${src.table}`}>{src.available ? "✓" : "!"} {src.database}: {src.table}</li>)}</ul>
          <p className="mt-2">อ่านล่าสุด {new Date(report.fetchedAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })} · cache สูงสุด 60 วินาที · อ่านอย่างเดียว ไม่สั่งเติม</p>
        </details>
      </>}
    </main>
  </div>;
}
