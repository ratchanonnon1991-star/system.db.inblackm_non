"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowLeft, CalendarDays, Clock3, RefreshCw, Users, Sun, Moon, AlertTriangle } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { useLLTheme } from "@/lib/ll-theme";
import { bangkokWorkday, calculateStaffing, defaultStaffPlan, normalizeStaffPlan, SHIFT_TYPES } from "@/lib/workforce-planning";

const STORAGE_KEY = "inblackm.workforce.plan.v1";
const fmt = value => value == null ? "—" : new Intl.NumberFormat("th-TH", { maximumFractionDigits: 1 }).format(value);
const dateLabel = value => new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" }).format(new Date(`${value}T12:00:00+07:00`));
const timeLabel = value => new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok", hourCycle: "h23" }).format(new Date(value));
const panel = "rounded-2xl border border-ll-hairline bg-ll-surface-1";
const input = "w-full rounded-lg border border-ll-hairline-strong bg-ll-surface-1 px-3 py-2 text-sm text-ll-ink outline-none focus-visible:ring-2 focus-visible:ring-ll-primary disabled:opacity-50";

function Stat({ icon: Icon, label, value, detail }) {
  return <div className={`${panel} p-5`}><div className="flex items-center gap-2 text-xs text-ll-ink-subtle"><Icon size={15} />{label}</div><p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">{fmt(value)}</p><p className="mt-2 text-xs text-ll-ink-tertiary">{detail}</p></div>;
}

function HourChart({ hours }) {
  const max = Math.max(1, ...hours.flatMap(h => [h.demand || 0, h.capacity || 0]));
  return <div className="overflow-x-auto"><div className="min-w-[650px]">
    <div className="flex h-52 items-end gap-1 border-b border-ll-hairline" role="img" aria-label="คาดการณ์ชิ้นงานและกำลังคนรายชั่วโมง มีค่าตัวเลขในตารางด้านล่าง">
      {hours.map(h => <div className="flex h-full flex-1 items-end justify-center gap-0.5" key={h.hour} title={`${timeLabel(h.hour)} · งาน Human ที่คาด ${fmt(h.demand)} · รับงานได้ ${fmt(h.capacity)}`}>
        <div className="w-1/2 rounded-t bg-ll-primary" style={{ height: `${Math.max(h.demand ? 1 : 0, (h.demand || 0) / max * 100)}%` }} />
        <div className="w-1/2 rounded-t bg-emerald-500/70" style={{ height: `${(h.capacity || 0) / max * 100}%` }} />
      </div>)}
    </div>
    <div className="mt-2 flex gap-1">{hours.map((h, i) => <span key={h.hour} className="flex-1 text-center text-[10px] tabular-nums text-ll-ink-tertiary">{i % 3 === 0 ? timeLabel(h.hour) : ""}</span>)}</div>
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
  const deficit = staffing.hours.filter(h => h.gap > 0).length;
  const updatePlan = next => {
    const normalized = normalizeStaffPlan(next);
    setPlan(normalized);
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized)); setStorageNotice("บันทึกแผนในเครื่องนี้แล้ว"); }
    catch { setStorageNotice("บันทึกในเครื่องไม่ได้ แผนนี้จะอยู่จนกว่าจะปิดหน้า"); }
  };
  const reload = () => { setReport(null); setError(""); setRefresh(n => n + 1); };

  return <div data-theme={theme} className="min-h-screen bg-ll-canvas text-ll-ink">
    <header className="border-b border-ll-hairline bg-ll-surface-1"><div className="mx-auto flex max-w-[1500px] items-center justify-between px-4 py-4 sm:px-6">
      <Link href="/" className="inline-flex items-center gap-2 text-sm text-ll-ink-subtle hover:text-ll-ink"><ArrowLeft size={16} /> INBLACKM Tools</Link>
      <button type="button" onClick={toggleTheme} className="rounded-lg border border-ll-hairline p-2" aria-label="สลับธีมสว่าง/มืด">{theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}</button>
    </div></header>
    <main className="mx-auto max-w-[1500px] space-y-6 px-4 py-7 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4"><div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ll-primary">Operations / Workforce planning</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">คิวงานวันนี้ คนที่ต้องใช้พรุ่งนี้</h1>
        <p className="mt-2 text-sm text-ll-ink-subtle">รวมช่องทาง · แยกออเดอร์และชิ้นงาน · วางกะด้วยข้อมูล ไม่ใช่การเดา</p>
      </div><button onClick={reload} type="button" className={`${input} inline-flex w-auto items-center gap-2`}><RefreshCw size={15} /> อัปเดตข้อมูล</button></div>

      <div className={`${panel} flex flex-wrap items-end gap-4 p-4`}>
        <label className="space-y-1.5 text-xs text-ll-ink-subtle"><span className="block">วันทำงาน (09:00 ถึง 09:00 วันถัดไป)</span><input type="date" value={date} max={bangkokWorkday()} className={input} onChange={e => { if (e.target.value) { setDate(e.target.value); setReport(null); setError(""); } }} /></label>
        <label className="min-w-40 space-y-1.5 text-xs text-ll-ink-subtle"><span className="block">ช่องทางที่ใช้วางแผน</span><select value={channel} className={input} onChange={e => { setChannel(e.target.value); setReport(null); setError(""); }}>
          <option value="all">ทุกช่องทาง</option><option value="web">เว็บ InblackM</option><option value="russia">Russia</option><option value="inblackm_reseller">InblackM Reseller</option><option value="page">PAGE</option><option value="kaleoz">Kaleoz</option><option value="itemku">Itemku</option><option value="playerok">PlayerOK</option><option value="g2g">G2G</option><option value="telegram_other">Telegram / อื่น ๆ</option>
        </select></label>
        <p className="ml-auto text-xs text-ll-ink-tertiary">เวลาไทย Asia/Bangkok · อ่านอย่างเดียว ไม่สั่งเติม</p>
      </div>
      {error && <div role="alert" className="rounded-xl border border-ll-primary/30 bg-ll-primary/10 p-4 text-sm">{error} <button type="button" onClick={reload} className="ml-2 underline">ลองใหม่</button></div>}
      {!report && !error && <div role="status" className={`${panel} p-12 text-center text-ll-ink-subtle`}>กำลังรวมข้อมูลจากฐานเว็บและฐานบอท…</div>}
      {report && <>
        {report.warnings.length > 0 && <div role="alert" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm"><p className="mb-2 flex items-center gap-2 font-semibold"><AlertTriangle size={16} /> ข้อจำกัดข้อมูล — อย่าตีความแหล่งที่หายไปเป็นศูนย์</p><ul className="list-inside list-disc space-y-1">{report.warnings.map(w => <li key={w}>{w}</li>)}</ul></div>}
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat icon={Activity} label="ชิ้นงานเข้าวันที่เลือก" value={report.summary.units} detail={`${fmt(report.summary.orders)} ออเดอร์ไม่ซ้ำ · ไม่รวมรายการยกเลิกที่ทราบ`} />
          <Stat icon={Clock3} label="ชิ้นงานเข้าเฉลี่ย / ชั่วโมง" value={report.summary.averagePerHour} detail={`สูงสุด ${fmt(report.summary.peakPerHour)} ชิ้นงานในหนึ่งชั่วโมง`} />
          <Stat icon={CalendarDays} label={`คาดการณ์ ${dateLabel(report.forecastDate)}`} value={report.summary.expectedUnits} detail="ชิ้นงานใหม่ · ไม่รวมคงค้างยกมา · ไม่ใช่ยอดรับประกัน" />
          <Stat icon={Users} label="ชั่วโมงที่แผนคนยังรับไม่พอ" value={deficit} detail="เทียบความต้องการงาน Human กับแผนคนที่กรอก" />
        </section>

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-5">
            <section className={`${panel} p-5`}><div className="mb-5 flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold">ภาระงานวันถัดไป · รายชั่วโมง</h2><p className="mt-1 text-xs text-ll-ink-subtle">{dateLabel(report.forecastDate)} 09:00 → วันถัดไป 09:00</p></div><p className="flex gap-4 text-xs text-ll-ink-subtle"><span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-ll-primary" /> งาน Human ที่คาด</span><span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" /> กำลังรับงาน Human</span></p></div>
              <p className="mb-3 text-xs text-ll-ink-subtle">แท่งคิวแสดงเฉพาะสัดส่วนงาน Human {fmt(plan.humanShare)}% ที่ตั้งไว้ เทียบกับกำลังคน</p><HourChart hours={staffing.hours} />
              <p className="mt-4 text-xs leading-relaxed text-ll-ink-tertiary">อิงวันในสัปดาห์และชั่วโมงเดียวกันย้อนหลังสูงสุด 8 สัปดาห์ หากไม่พอใช้ชั่วโมงเดียวกันช่วง 14 วันล่าสุด (ขั้นต่ำ 3 วัน) · แถบช่วงต่ำ–สูงในตารางเป็นช่วงความแปรปรวนจากอดีต ไม่ใช่ช่วงความเชื่อมั่นที่รับรอง</p>
            </section>

            <section className={`${panel} overflow-hidden`}><div className="p-5"><h2 className="font-semibold">แผนคนตามกะ</h2><p className="mt-1 text-xs text-ll-ink-subtle">จำนวนคนแนะนำ = รองรับชั่วโมงพีคของกะนั้นเพียงกลุ่มเดียว กะทับกันต้องดูตารางรายชั่วโมง ไม่บวกจำนวนแนะนำทุกแถว</p></div>
              <div className="overflow-x-auto"><table className="w-full min-w-[750px] text-left text-sm"><caption className="sr-only">คาดการณ์ชิ้นงานและกำลังคนแยก Full time Intern Part time</caption><thead className="bg-ll-surface-2 text-xs text-ll-ink-subtle"><tr>{["ทีม / เวลา", "คาดการณ์", "คิว/ชม.", "คนแนะนำ*", "คนในแผน", "รับได้/กะ"].map(h => <th className="px-4 py-3 font-medium" key={h}>{h}</th>)}</tr></thead><tbody>
                {staffing.shifts.map(s => <tr key={s.id} className="border-t border-ll-hairline"><td className="px-4 py-3"><span className="text-xs text-ll-ink-subtle">{SHIFT_TYPES.find(t => t.id === s.type).label}</span><p className="mt-1 whitespace-nowrap font-medium">{s.label}</p></td><td className="px-4 py-3 tabular-nums">{fmt(s.units)}</td><td className="px-4 py-3 tabular-nums">{fmt(s.averagePerHour)}</td><td className="px-4 py-3 tabular-nums">{fmt(s.standalonePeople)}</td><td className="w-28 px-4 py-3"><input className={input} aria-label={`จำนวนคน ${s.type} ${s.label}`} type="number" min="0" max="1000" step="1" value={plan.counts[s.id]} onChange={e => updatePlan({ ...plan, counts: { ...plan.counts, [s.id]: e.target.value } })} /></td><td className="px-4 py-3 tabular-nums">{fmt(s.capacity)}</td></tr>)}
              </tbody></table></div>
            </section>
          </div>

          <aside className={`${panel} space-y-5 p-5`}><div><h2 className="font-semibold">ตั้งค่ากำลังทำงาน</h2><p className="mt-1 text-xs leading-relaxed text-ll-ink-subtle">กรอกคิวต่อคนต่อชั่วโมงจากการทำงานจริง ไม่กรอก = ยังไม่แนะนำจำนวนคน</p></div>
            {SHIFT_TYPES.map(t => <label className="block space-y-2 text-sm" key={t.id}><span>{t.label} <span className="text-xs text-ll-ink-subtle">ชิ้นงาน / คน / ชม.</span></span><input type="number" min="0" max="1000" step="0.5" className={input} value={plan.rates[t.id]} onChange={e => updatePlan({ ...plan, rates: { ...plan.rates, [t.id]: e.target.value } })} /></label>)}
            <label className="block space-y-2 text-sm"><span>เวลาที่ใช้รับคิวได้จริง (%)</span><input type="number" min="1" max="100" className={input} value={plan.utilization} onChange={e => updatePlan({ ...plan, utilization: e.target.value })} /><span className="block text-xs text-ll-ink-tertiary">เผื่อพัก ประสานงาน และงานอื่น เช่น 80%</span></label>
            <label className="block space-y-2 text-sm"><span>สัดส่วนชิ้นงานที่ต้องใช้คน (%)</span><input type="number" min="0" max="100" className={input} value={plan.humanShare} onChange={e => updatePlan({ ...plan, humanShare: e.target.value })} /><span className="block text-xs text-ll-ink-tertiary">คิวทุกช่องทางมีทั้งบอทและคน ระบบยังไม่เดาสัดส่วนให้ ค่าเริ่มต้น 100% เป็นแผนเผื่อสูงสุด</span></label>
            <p role="status" className="text-xs leading-relaxed text-ll-ink-subtle">{storageNotice || "การตั้งค่าบันทึกเฉพาะเบราว์เซอร์นี้ ไม่ใช่แผนกลางของทีม"}</p>
            <div className="border-t border-ll-hairline pt-4 text-xs leading-relaxed text-ll-ink-subtle"><p className="font-medium text-ll-ink">คงค้างจากช่วงที่อ่าน: {fmt(report.summary.openUnits)} ชิ้นงาน</p><p className="mt-1">ย้อนหลังตั้งแต่ {report.historyStart} ไม่ใช่ยอดค้างตลอดอายุระบบ และยังไม่บวกเข้า forecast อัตโนมัติ</p></div>
          </aside>
        </div>

        <section className={`${panel} overflow-hidden`}><div className="p-5"><h2 className="font-semibold">รายละเอียดต่อชั่วโมง</h2><p className="mt-1 text-xs text-ll-ink-subtle">คิวใหม่เป็นชิ้นงานทุกช่องทาง · ขาด = ความต้องการ Human หลังคูณสัดส่วน − กำลังคนรวมทุกกะที่ทับกัน</p></div><div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-ll-surface-2 text-xs text-ll-ink-subtle"><tr>{["เวลาเริ่มชั่วโมง", "จริงวันที่เลือก", "คาดการณ์วันถัดไป", "ช่วงต่ำ–สูง", "รับได้/ชม.", "ขาด/ชม.", "วันตัวอย่าง"].map(h => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead><tbody>{staffing.hours.map((h, i) => <tr key={h.hour} className="border-t border-ll-hairline tabular-nums"><td className="px-4 py-2.5">{timeLabel(h.hour)}{i >= 15 && <span className="ml-1 text-xs text-ll-ink-tertiary">+1 วัน</span>}</td><td className="px-4 py-2.5">{fmt(report.actual[i]?.units)}</td><td className="px-4 py-2.5">{fmt(h.expected)}</td><td className="px-4 py-2.5 text-ll-ink-subtle">{fmt(h.low)}–{fmt(h.high)}</td><td className="px-4 py-2.5">{fmt(h.capacity)}</td><td className={`px-4 py-2.5 ${h.gap > 0 ? "font-semibold text-ll-primary" : "text-ll-ink-subtle"}`}>{fmt(h.gap)}</td><td className="px-4 py-2.5 text-ll-ink-subtle">{h.samples}</td></tr>)}</tbody></table></div></section>

        <section className={`${panel} overflow-hidden`}><div className="p-5"><h2 className="font-semibold">สรุปแยกช่องทาง</h2><p className="mt-1 text-xs text-ll-ink-subtle">ต้นทางมาก่อนสำเนา Telegram/คิวบอท · หนึ่งชิ้นงาน = จำนวนที่สั่ง ไม่ใช่จำนวนรอบชำระเงินหรือ retry</p></div><div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead className="bg-ll-surface-2 text-xs text-ll-ink-subtle"><tr>{["ช่องทาง", "ออเดอร์ไม่ซ้ำ", "ชิ้นงาน", "คงค้างในช่วง", "คาดการณ์วันถัดไป", "เริ่มมีข้อมูล"].map(h => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead><tbody>{report.channels.map(c => <tr className="border-t border-ll-hairline" key={c.id}><td className="px-4 py-3 font-medium">{c.label}</td><td className="px-4 py-3">{fmt(c.orders)}</td><td className="px-4 py-3">{fmt(c.units)}</td><td className="px-4 py-3">{fmt(c.openUnits)}</td><td className="px-4 py-3">{fmt(c.predicted)}</td><td className="px-4 py-3 text-xs text-ll-ink-subtle">{c.coverageStart ? new Date(c.coverageStart).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok" }) : "ไม่มีข้อมูลในช่วง"}</td></tr>)}</tbody></table></div></section>
        <details className={`${panel} p-4 text-xs text-ll-ink-subtle`}><summary className="cursor-pointer font-medium">สถานะแหล่งข้อมูลและวิธีนับ</summary><p className="mt-3 leading-relaxed">เว็บนับเฉพาะออเดอร์ยืนยันชำระเงินแล้ว รวมงานย่อยใต้เลขออเดอร์หลัก · Marketplace ใช้รหัสออเดอร์และจำนวนที่สั่ง · Russia ใช้ task ไม่ซ้ำในออเดอร์ · ถ้าต้นทางไม่มีจำนวนจะนับ 1 ชิ้นงานต่อแถว ซึ่งอาจไม่เท่าจำนวนแพ็กย่อยจริง · กะ Full time/Intern รวมรายกลุ่มเท่านั้น ไม่บวก forecast เป็นยอดรวมหลายรอบ · ข้อมูลย้อนหลังไม่ใช่ประวัติ snapshot คงค้าง</p><ul className="mt-3 grid gap-1 sm:grid-cols-2">{report.sources.map(s => <li key={`${s.database}/${s.table}`}>{s.available ? "✓" : "!"} {s.database}: {s.table}</li>)}</ul><p className="mt-3">อ่านล่าสุด {new Date(report.fetchedAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })} · cache สูงสุด 60 วินาที</p></details>
      </>}
    </main>
  </div>;
}
