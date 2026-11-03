"use client";

import PaginatedTable from "@/components/table-pagination";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ClipboardList, RefreshCw } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { topupInventoryPath } from "@/lib/topup-inventory";

const endpoint = "/api/projectm/ledger";
const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-ll-hairline-strong bg-ll-surface-1 px-4 text-sm text-ll-ink hover:bg-ll-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ll-primary disabled:opacity-50";
const input = "mt-1 min-h-11 w-full rounded-lg border border-ll-hairline-strong bg-ll-surface-1 px-3 text-sm text-ll-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ll-primary";
const cell = "border-b border-ll-hairline px-3 py-2 align-top";
const num = v => (v == null ? "—" : Number(v).toLocaleString("en-US", { maximumFractionDigits: 4 }));
const when = v => (v ? new Date(v).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" }) : "—");
const bangkokDay = (offsetDays = 0) => new Date(Date.now() + 7 * 3600000 + offsetDays * 86400000).toISOString().slice(0, 10);
const presets = () => ({
  today: { from: bangkokDay(), to: bangkokDay() },
  yesterday: { from: bangkokDay(-1), to: bangkokDay(-1) },
  week: { from: bangkokDay(-6), to: bangkokDay() },
  month: { from: `${bangkokDay().slice(0, 8)}01`, to: bangkokDay() },
});

function AccountEntries({ account, range }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setError("");
    try {
      const p = new URLSearchParams({ view: "entries", accountId: account.id, from: range.from, to: range.to });
      setData(await apiJson(`${endpoint}?${p}`, { cache: "no-store" }));
    } catch (e) { setError(e.message); }
  }, [account.id, range.from, range.to]);
  useEffect(() => { const timer = setTimeout(load, 0); return () => clearTimeout(timer); }, [load]);
  return <section aria-label={`รายการของ ${account.label}`} className="space-y-3 rounded-xl border border-ll-hairline bg-ll-surface-1 p-4">
    <h2 className="text-lg font-semibold">{account.label} <span className="text-sm font-normal text-ll-ink-subtle">· {account.currency}{account.category ? ` · ${account.category}` : ""}</span></h2>
    {error && <p role="alert" className="text-sm text-ll-warning">{error}</p>}
    <p className="text-xs text-ll-ink-subtle">{data ? `${data.entries.length} รายการ${data.truncated ? " (แสดง 500 รายการล่าสุด)" : ""}` : "กำลังโหลด…"}</p>
    <div className="overflow-x-auto"><PaginatedTable items={(data?.entries ?? [])} resetKey={JSON.stringify([account.id, range.from, range.to])}>{(tablePageItems, tablePageStart, tableAllItems) => (<table className="w-full min-w-[680px] text-left text-sm">
      <thead><tr className="text-xs text-ll-ink-subtle">{["เวลา", "เลขออเดอร์", "ยอด", "Invoice", "ผู้บันทึก"].map(h => <th key={h} className={`${cell} font-medium`}>{h}</th>)}</tr></thead>
      <tbody>{tablePageItems.map((tableItem, tableIndex) => (e => <tr key={e.id} className={e.reversedBy || e.kind === "reversal" ? "text-ll-ink-subtle" : ""}>
        <td className={`${cell} whitespace-nowrap`}>{when(e.recordedAt)}</td>
        <td className={`${cell} font-medium`}>{e.orderRef}{e.kind === "reversal" && <span className="ml-1 text-xs">(รายการกลับ)</span>}{e.reversedBy && <span className="ml-1 text-xs">(ยกเลิกแล้ว)</span>}</td>
        <td className={`${cell} tabular-nums`}>{Number(e.direction) < 0 ? "−" : "+"}{num(e.amount)}</td>
        <td className={cell}>{e.invoice || "—"}</td>
        <td className={cell}>{e.recordedBy}</td>
      </tr>)(tableItem, tablePageStart + tableIndex, tableAllItems))}</tbody>
    </table>)}</PaginatedTable></div>
  </section>;
}

export default function InventoryLedgerChannels({ lang }) {
  const [range, setRange] = useState(() => presets().today);
  const [draft, setDraft] = useState(range);
  const [summary, setSummary] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const p = new URLSearchParams({ view: "summary", from: range.from, to: range.to });
      const [s, a] = await Promise.all([apiJson(`${endpoint}?${p}`, { cache: "no-store" }), apiJson(`${endpoint}?view=accounts`, { cache: "no-store" })]);
      setSummary(s.accounts ?? []); setAccounts(a.accounts ?? []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [range.from, range.to]);
  useEffect(() => { const timer = setTimeout(load, 0); return () => clearTimeout(timer); }, [load]);

  const rows = useMemo(() => {
    const used = new Map((summary ?? []).map(s => [s.accountId, s]));
    const list = showAll
      ? accounts.map(a => ({ accountId: a.id, label: a.label, currency: a.currency, category: a.category, status: a.status, uses: 0, reversals: 0, netUsed: "0", lastAt: null, ...used.get(a.id) }))
      : (summary ?? []);
    const q = query.trim().toLowerCase();
    return list.filter(r => !q || `${r.label} ${r.category ?? ""} ${r.currency}`.toLowerCase().includes(q));
  }, [summary, accounts, showAll, query]);
  const groups = useMemo(() => {
    const map = new Map();
    for (const r of rows) { const g = r.category || "อื่นๆ"; if (!map.has(g)) map.set(g, []); map.get(g).push(r); }
    return [...map];
  }, [rows]);
  const totals = useMemo(() => {
    const t = {};
    for (const r of summary ?? []) t[r.currency] = (t[r.currency] ?? 0) + Number(r.netUsed);
    return t;
  }, [summary]);
  function apply(next) { setSelected(null); setRange(next); setDraft(next); }

  return <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-4 pb-14 pt-10 text-ll-ink sm:px-6">
    <header className="flex flex-wrap items-center justify-between gap-4 pr-12">
      <div><p className="text-xs text-ll-ink-tertiary">TOPUP INVENTORY · จากหน้ายกยอด</p><h1 className="mt-2 text-3xl font-semibold">ยอดเติมมือรายบัญชี</h1>
        <p className="mt-2 text-sm text-ll-ink-subtle">ยอดที่ทีมยกจากหน้ายกยอด รวมต่อบัญชี (หักรายการที่ยกเลิกแล้ว) ยังไม่รวมยอดที่บอทใช้</p></div>
      <div className="flex flex-wrap gap-2">
        <Link href={`${topupInventoryPath(lang)}/ledger`} className={button}><ClipboardList size={16} aria-hidden />ไปหน้ายกยอด</Link>
        <Link href={topupInventoryPath(lang)} className={button}><ArrowLeft size={16} aria-hidden />กลับ Topup Inventory</Link>
      </div>
    </header>

    <section aria-label="กรองข้อมูล" className="space-y-3 rounded-xl border border-ll-hairline bg-ll-surface-1 p-4">
      <div className="flex flex-wrap items-center gap-2">
        {[["today", "วันนี้"], ["yesterday", "เมื่อวาน"], ["week", "7 วัน"], ["month", "เดือนนี้"]].map(([k, t]) => <button key={k} type="button" disabled={loading} onClick={() => apply(presets()[k])} className={button}>{t}</button>)}
        <span className="text-xs text-ll-ink-subtle">เวลาไทย · เลือกได้ไม่เกิน 93 วัน</span>
      </div>
      <form onSubmit={e => { e.preventDefault(); apply(draft); }} className="flex flex-wrap items-end gap-3">
        <label className="text-sm">ตั้งแต่<input type="date" required value={draft.from} onChange={e => setDraft({ ...draft, from: e.target.value })} className={input} /></label>
        <label className="text-sm">ถึง<input type="date" required min={draft.from} value={draft.to} onChange={e => setDraft({ ...draft, to: e.target.value })} className={input} /></label>
        <label className="min-w-0 basis-full text-sm sm:flex-1 sm:basis-56">ค้นหาบัญชี / กลุ่ม<input value={query} onChange={e => setQuery(e.target.value)} className={input} /></label>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} />แสดงบัญชีที่ยังไม่มีรายการด้วย</label>
        <button disabled={loading} className={button}>ใช้ตัวกรอง</button>
        <button type="button" disabled={loading} onClick={load} className={button}><RefreshCw size={16} aria-hidden />โหลดใหม่</button>
      </form>
      <p className="text-xs text-ll-ink-subtle">{range.from === range.to ? range.from : `${range.from} ถึง ${range.to}`}
        {summary ? ` · ${summary.length} บัญชีที่มีการยกยอด` : ""}{Object.keys(totals).length ? ` · รวม ${Object.entries(totals).map(([c, v]) => `${num(v)} ${c}`).join(" · ")}` : ""}</p>
    </section>

    {error && <p role="alert" className="rounded-xl border border-ll-hairline p-4 text-sm">{error}</p>}
    {loading && !summary && <p role="status" className="text-sm text-ll-ink-subtle">กำลังโหลด…</p>}
    {summary && !rows.length && <p className="rounded-xl border border-dashed border-ll-hairline-strong p-4 text-sm text-ll-ink-subtle">ยังไม่มีการยกยอดในช่วงนี้{query ? " ที่ตรงกับคำค้น" : ""}</p>}

    {groups.map(([group, list]) => <section key={group} aria-label={group} className="space-y-2">
      <h2 className="text-sm font-semibold text-ll-ink-subtle">{group}</h2>
      <div className="overflow-x-auto rounded-xl border border-ll-hairline bg-ll-surface-1"><PaginatedTable items={list} resetKey={JSON.stringify([range.from, range.to, query, showAll])}>{(tablePageItems, tablePageStart, tableAllItems) => (<table className="w-full min-w-[640px] text-left text-sm">
        <thead><tr className="text-xs text-ll-ink-subtle">{["บัญชี", "ยอดใช้สุทธิ", "รายการ", "ยกเลิก", "ล่าสุด"].map(h => <th key={h} className={`${cell} font-medium`}>{h}</th>)}</tr></thead>
        <tbody>{tablePageItems.map((tableItem, tableIndex) => (r => <tr key={r.accountId} className={selected?.id === r.accountId ? "bg-ll-surface-2" : "hover:bg-ll-surface-2"}>
          <td className={cell}><button type="button" onClick={() => setSelected({ id: r.accountId, label: r.label, currency: r.currency, category: r.category })} className="min-h-11 text-left font-medium underline-offset-4 hover:underline">{r.label}</button>{r.status && r.status !== "active" && <span className="ml-2 text-xs text-ll-ink-subtle">ปิดใช้งาน</span>}</td>
          <td className={`${cell} tabular-nums`}>{num(r.netUsed)} {r.currency}</td>
          <td className={`${cell} tabular-nums`}>{r.uses}</td>
          <td className={`${cell} tabular-nums`}>{r.reversals || "—"}</td>
          <td className={`${cell} whitespace-nowrap`}>{when(r.lastAt)}</td>
        </tr>)(tableItem, tablePageStart + tableIndex, tableAllItems))}</tbody>
      </table>)}</PaginatedTable></div>
    </section>)}

    {selected && <AccountEntries key={`${selected.id}:${range.from}:${range.to}`} account={selected} range={range} />}
  </main>;
}
