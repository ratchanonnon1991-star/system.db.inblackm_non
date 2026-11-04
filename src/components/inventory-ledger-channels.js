"use client";

import PaginatedTable from "@/components/table-pagination";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CircleArrowUp, RefreshCw } from "lucide-react";
import TopupInventoryPage from "@/components/topup-inventory-page";
import { apiJson } from "@/lib/api-json";
import { topupInventoryPath } from "@/lib/topup-inventory";
import { tivButton as button, tivCheck, tivField, tivInput, tivPrimary, tivTable, tivTableBox } from "@/lib/topup-inventory-ui";

const endpoint = "/api/projectm/ledger";
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
  return <section aria-label={`รายการของ ${account.label}`} className="tiv-card">
    <div className="tiv-card-h"><h2>{account.label}<small>{account.currency}{account.category ? ` · ${account.category}` : ""} · {data ? `${data.entries.length} รายการ${data.truncated ? " (แสดง 500 รายการล่าสุด)" : ""}` : "กำลังโหลด…"}</small></h2></div>
    {error && <p role="alert" className="tiv-alert mb-3">{error}</p>}
    <div className={tivTableBox}><PaginatedTable items={(data?.entries ?? [])} resetKey={JSON.stringify([account.id, range.from, range.to])}>{(tablePageItems, tablePageStart, tableAllItems) => (<table className={`${tivTable} min-w-[680px]`}>
      <thead><tr>{["เวลา", "เลขออเดอร์", "ยอด", "Invoice", "ผู้บันทึก"].map(h => <th key={h} className={h === "ยอด" ? "r" : ""}>{h}</th>)}</tr></thead>
      <tbody>{tablePageItems.map((tableItem, tableIndex) => (e => <tr key={e.id} className={e.reversedBy || e.kind === "reversal" ? "cx" : ""}>
        <td className="whitespace-nowrap">{when(e.recordedAt)}</td>
        <td><span className="oid">{e.orderRef}</span>{e.kind === "reversal" && <span className="sm">รายการกลับ</span>}{e.reversedBy && <span className="sm">ยกเลิกแล้ว</span>}</td>
        <td className="r b">{Number(e.direction) < 0 ? "−" : "+"}{num(e.amount)}</td>
        <td>{e.invoice || "—"}</td>
        <td>{e.recordedBy}</td>
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
  const uses = (summary ?? []).reduce((sum, r) => sum + Number(r.uses || 0), 0);
  const totalText = Object.entries(totals).map(([c, v]) => `${num(v)} ${c}`).join(" · ");
  const preset = Object.entries(presets()).find(([, p]) => p.from === range.from && p.to === range.to)?.[0];

  return <TopupInventoryPage provider="channels" actions={<Link href={`${topupInventoryPath(lang)}/ledger`} className={button}><CircleArrowUp size={16} aria-hidden />ยกยอดเติมมือ</Link>}>
    <section aria-label="กรองข้อมูล" className="tiv-card">
      <div className="tiv-tools">
        {[["today", "วันนี้"], ["yesterday", "เมื่อวาน"], ["week", "7 วัน"], ["month", "เดือนนี้"]].map(([k, t]) => <button key={k} type="button" disabled={loading} aria-pressed={preset === k} onClick={() => apply(presets()[k])} className={`${button}${preset === k ? " on" : ""}`}>{t}</button>)}
        <span className="tiv-muted">เวลาไทย · เลือกได้ไม่เกิน 93 วัน</span>
      </div>
      <form onSubmit={e => { e.preventDefault(); apply(draft); }} className="mt-4 flex flex-wrap items-end gap-3">
        <label className={tivField}><span>ตั้งแต่</span><input type="date" required value={draft.from} onChange={e => setDraft({ ...draft, from: e.target.value })} className={`${tivInput} date`} /></label>
        <label className={tivField}><span>ถึง</span><input type="date" required min={draft.from} value={draft.to} onChange={e => setDraft({ ...draft, to: e.target.value })} className={`${tivInput} date`} /></label>
        <label className={`${tivField} basis-full sm:flex-1 sm:basis-56`}><span>ค้นหาบัญชี / กลุ่ม</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="เช่น wavepay, moniepoint" className={tivInput} /></label>
        <label className={tivCheck}><input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} />แสดงบัญชีที่ยังไม่มีรายการด้วย</label>
        <button disabled={loading} className={tivPrimary}>ใช้ตัวกรอง</button>
        <button type="button" disabled={loading} onClick={load} className={button}><RefreshCw size={16} aria-hidden />โหลดใหม่</button>
      </form>
    </section>

    <div className="tiv-kpis" aria-label={range.from === range.to ? range.from : `${range.from} ถึง ${range.to}`}>
      <div className="tiv-kpi"><small>บัญชีที่มียอด</small><b className={summary ? "" : "mut"}>{summary ? summary.length : "—"}</b></div>
      <div className="tiv-kpi"><small>รายการทั้งหมด</small><b className={summary ? "" : "mut"}>{summary ? uses : "—"}</b></div>
      <div className="tiv-kpi"><small>ยอดรวมที่ตัด</small><b className={totalText ? "" : "mut"}>{totalText || "—"}</b></div>
    </div>

    {error && <p role="alert" className="tiv-alert">{error}</p>}
    {loading && !summary && <p role="status" className="tiv-muted">กำลังโหลด…</p>}
    {summary && !rows.length && <div className="tiv-dempty"><strong>{query ? "ไม่พบบัญชีที่ค้นหา" : "ยังไม่มีการยกยอด"}</strong>{query ? "ลองใช้คำอื่น หรือเลือกช่วงวันที่ใหม่" : "บันทึกรายการที่หน้ายกยอดเติมมือ แล้วสรุปรายบัญชีจะขึ้นที่นี่"}<br />{!query && <Link href={`${topupInventoryPath(lang)}/ledger`} className={tivPrimary}>ไปยกยอดเติมมือ</Link>}</div>}

    {groups.map(([group, list]) => <section key={group} aria-label={group} className="tiv-card">
      <div className="tiv-card-h"><h2>{group}<small>{list.length} บัญชี · กดชื่อบัญชีเพื่อดูรายการ</small></h2></div>
      <div className={tivTableBox}><PaginatedTable items={list} resetKey={JSON.stringify([range.from, range.to, query, showAll])}>{(tablePageItems, tablePageStart, tableAllItems) => (<table className={`${tivTable} min-w-[640px]`}>
        <thead><tr>{["บัญชี", "ยอดใช้สุทธิ", "รายการ", "ยกเลิก", "ล่าสุด"].map(h => <th key={h} className={h === "บัญชี" ? "" : "r"}>{h}</th>)}</tr></thead>
        <tbody>{tablePageItems.map((tableItem, tableIndex) => (r => <tr key={r.accountId} className={selected?.id === r.accountId ? "sel" : ""}>
          <td><button type="button" aria-pressed={selected?.id === r.accountId} onClick={() => setSelected({ id: r.accountId, label: r.label, currency: r.currency, category: r.category })} className="text-left font-bold underline-offset-4 hover:underline">{r.label}</button>{r.status && r.status !== "active" && <span className="sm">ปิดใช้งาน</span>}</td>
          <td className="r b">{num(r.netUsed)} {r.currency}</td>
          <td className="r">{r.uses}</td>
          <td className="r">{r.reversals || "—"}</td>
          <td className="r whitespace-nowrap">{when(r.lastAt)}</td>
        </tr>)(tableItem, tablePageStart + tableIndex, tableAllItems))}</tbody>
      </table>)}</PaginatedTable></div>
    </section>)}

    {selected && <AccountEntries key={`${selected.id}:${range.from}:${range.to}`} account={selected} range={range} />}
  </TopupInventoryPage>;
}
