"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { ITUNE_SHEET_SOURCES, ITUNE_SHEET_START_DATE } from "@/lib/itune-sheet-orders";

const endpoint = "/api/projectm/itune/sheet-orders";
const CURRENCIES = ["USD", "DE"];
const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-ll-hairline-strong bg-ll-surface-1 px-4 text-sm text-ll-ink hover:bg-ll-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ll-primary disabled:opacity-50";
const input = "mt-2 min-h-11 w-full rounded-lg border border-ll-hairline-strong bg-ll-surface-1 px-3 text-sm text-ll-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ll-primary";
const card = "min-w-0 rounded-xl border border-ll-hairline bg-ll-surface-1 p-4";
const when = (v) => v ? new Date(v).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" }) : "—";
const num = (v) => v == null ? "—" : Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
const sourceLabel = (key) => ITUNE_SHEET_SOURCES[key]?.label || key;
const REASONS = { no_email: "ยังไม่มีเมลนี้ในระบบ", duplicate_email: "เมลนี้มีในระบบมากกว่า 1 แถว", currency_mismatch: "สกุลของเมลไม่ตรงกับช่องทาง" };

function RateCard({ currency, current, busy, onSave }) {
  const [value, setValue] = useState("");
  return <form className={card} onSubmit={(e) => { e.preventDefault(); onSave(currency, value, () => setValue("")); }}>
    <p className="text-sm text-ll-ink-subtle">ตัวคูณต้นทุน {currency}</p>
    <p className="mt-1 text-2xl font-semibold tabular-nums">{current ? num(current.rate) : "ยังไม่ตั้ง"}</p>
    <p className="mt-1 text-xs text-ll-ink-subtle">{current ? `ใช้ตั้งแต่ ${when(current.effective_at)} · ${current.created_by_username || "—"}` : "ออเดอร์ที่ย้ายเข้ามาตอนนี้จะยังไม่มีต้นทุน"}</p>
    <label className="mt-3 block text-sm">ตัวคูณใหม่ (บาท ต่อ 1 {currency})<input required inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} disabled={busy} className={input} /></label>
    <button disabled={busy || !value} className={`${button} mt-3`}>บันทึก · ใช้ตั้งแต่ตอนนี้</button>
  </form>;
}

export default function ItuneSheetOrdersAdmin() {
  const [data, setData] = useState(null); const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setData(await apiJson(endpoint, { cache: "no-store" })); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { const timer = setTimeout(load, 0); return () => clearTimeout(timer); }, [load]);
  async function saveRate(currency, rate, done) {
    setBusy(true); setError(""); setNotice("");
    try {
      await apiJson(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "rate", currency, rate }) });
      setNotice(`บันทึกตัวคูณ ${currency} = ${rate} แล้ว ออเดอร์ที่ย้ายเข้ามาหลังจากนี้ใช้ค่านี้`); done(); await load();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  const rates = Object.fromEntries((data?.rates || []).map((r) => [r.currency, r]));
  const currencies = [...new Set([...CURRENCIES, ...Object.keys(rates)])];
  const summary = data?.status?.summary || {};
  const counts = summary.counts || {};
  return <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-6 px-4 py-6 text-ll-ink sm:px-6">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-semibold">ออเดอร์ iTunes จากชีท</h1>
        <p className="mt-1 text-sm text-ll-ink-subtle">ย้ายแถว “รอเติม” ที่มีอีเมล (Russia AA, Marketplace V, Page/inblackm U) และใส่เวลาแล้ว จาก {Object.values(ITUNE_SHEET_SOURCES).map((s) => s.label).join(", ")} ตั้งแต่ {ITUNE_SHEET_START_DATE} · หักยอดเมลทันที · ไม่เขียนกลับลงชีท</p></div>
      <button onClick={load} disabled={loading} className={button}><RefreshCw size={16} aria-hidden />โหลดใหม่</button>
    </header>
    {error && <p role="alert" className="rounded-xl border border-ll-hairline p-4 text-sm">{error}</p>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
    {loading && !data && <p role="status" className="text-sm text-ll-ink-subtle">กำลังโหลด…</p>}
    {data && <>
      <section aria-label="ตัวคูณต้นทุน" className="space-y-3">
        <h2 className="text-lg font-semibold">ต้นทุน</h2>
        <p className="text-xs text-ll-ink-subtle">ต้นทุน (บาท) = ยอดออก × ตัวคูณของสกุลนั้น ณ เวลาที่ออเดอร์ถูกย้ายเข้ามา · เปลี่ยนตัวคูณแล้วมีผลกับออเดอร์ที่ย้ายเข้ามาหลังจากนั้นเท่านั้น</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{currencies.map((c) => <RateCard key={c} currency={c} current={rates[c]} busy={busy} onSave={saveRate} />)}</div>
        <details className="text-sm"><summary className="cursor-pointer py-2">ประวัติตัวคูณ ({data.rateHistory.length})</summary>
          <ul className="mt-2 space-y-1 text-xs text-ll-ink-subtle">{data.rateHistory.map((r) => <li key={r.id}>{when(r.effective_at)} · {r.currency} = {num(r.rate)} · {r.created_by_username || "—"}</li>)}</ul></details>
      </section>
      <section aria-label="สถานะการดึงชีท" className={card}>
        <h2 className="text-lg font-semibold">สถานะการดึงชีท</h2>
        {!data.status ? <p className="mt-2 text-sm text-ll-ink-subtle">ยังไม่เคยดึง — ตรวจว่า worker itune-sheet-sync ทำงานอยู่</p> : <div className="mt-2 space-y-2 text-sm">
          <p>ดึงล่าสุด {when(data.status.last_run_at)} · สำเร็จล่าสุด {when(data.status.last_success_at)} · วันที่อ่าน {(summary.days || []).join(", ") || "—"}</p>
          <p>พบ {summary.found ?? 0} แถว · รอใส่เวลา {summary.withoutTime ?? 0} · ย้ายใหม่ {counts.imported ?? 0} · เคยย้ายแล้ว {counts.already ?? 0} · รอเมล {counts.no_email ?? 0} · สกุลไม่ตรง {counts.currency_mismatch ?? 0} · เมลซ้ำ {counts.duplicate_email ?? 0}</p>
          {summary.errors?.length > 0 && <ul role="alert" className="space-y-1">{summary.errors.map((e, i) => <li key={i}>อ่าน {sourceLabel(e.source)} ไม่สำเร็จ: {e.message}</li>)}</ul>}
          {summary.negative?.length > 0 && <p role="alert">ยอดเมลติดลบหลังหัก: {summary.negative.map((n) => `${n.email} (${n.orderId})`).join(", ")}</p>}
        </div>}
      </section>
      {summary.waiting?.length > 0 && <section aria-label="ออเดอร์ที่ยังย้ายไม่ได้" className="space-y-2">
        <h2 className="text-lg font-semibold">ยังย้ายไม่ได้ ({summary.waiting.length})</h2>
        <p className="text-xs text-ll-ink-subtle">ระบบลองใหม่ทุกนาทีขณะที่แถวยังเป็น “รอเติม” — เพิ่มเมลในรายการเมลแล้วออเดอร์จะย้ายเข้ามาเอง</p>
        <ul className="space-y-1 text-sm">{summary.waiting.map((w, i) => <li key={i} className="break-words rounded-lg border border-ll-hairline p-2">{w.email} · {w.currency} {w.amount} · {sourceLabel(w.source)} {w.sheetDate} · {w.orderId} — {REASONS[w.reason] || w.reason}{w.entryCurrency ? ` (เมลเป็น ${w.entryCurrency})` : ""}</li>)}</ul>
      </section>}
      {summary.issues?.length > 0 && <details className="text-sm"><summary className="cursor-pointer py-2">แถวที่มีอีเมลแต่ข้อมูลไม่ครบ ({summary.issues.length})</summary>
        <ul className="mt-2 space-y-1 text-xs">{summary.issues.map((s, i) => <li key={i}>{sourceLabel(s.source)} · {s.tab} แถว {s.row} · {s.orderId || "—"} · {s.email} — {s.reason}</li>)}</ul></details>}
      <section aria-label="ออเดอร์ที่ย้ายแล้ว" className="min-w-0 space-y-2">
        <h2 className="text-lg font-semibold">ย้ายล่าสุด ({data.imports.length})</h2>
        <div className="max-h-[60vh] overflow-auto rounded-xl border border-ll-hairline bg-ll-surface-1">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="sticky top-0 bg-ll-surface-2"><tr>{["ย้ายเมื่อ", "ชีท", "วันที่/เวลาชีท", "ออเดอร์", "เมล", "ยอดออก", "ยอดเมล ก่อน → หลัง", "ตัวคูณ", "ต้นทุน (THB)"].map((h) => <th key={h} scope="col" className="whitespace-nowrap px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
            <tbody>{data.imports.map((r) => <tr key={r.id} className="border-t border-ll-hairline">
              <td className="whitespace-nowrap px-3 py-2">{when(r.imported_at)}</td><td className="px-3 py-2">{sourceLabel(r.source)}</td>
              <td className="whitespace-nowrap px-3 py-2">{String(r.sheet_date).slice(0, 10)}{r.order_time ? ` ${r.order_time}` : ""}</td><td className="break-words px-3 py-2">{r.order_id}</td>
              <td className="break-all px-3 py-2">{r.email}</td><td className="px-3 py-2 tabular-nums">{num(r.used_amount)} {r.currency}</td>
              <td className="px-3 py-2 tabular-nums">{num(r.amount_before)} → {num(r.amount_after)}</td>
              <td className="px-3 py-2 tabular-nums">{r.cost_rate ? num(r.cost_rate) : "ยังไม่ตั้ง"}</td><td className="px-3 py-2 tabular-nums">{num(r.cost_thb)}</td>
            </tr>)}</tbody>
          </table>
          {!data.imports.length && <p className="p-6 text-center text-sm text-ll-ink-subtle">ยังไม่มีออเดอร์ที่ย้ายเข้ามา</p>}
        </div>
      </section>
    </>}
  </div>;
}
