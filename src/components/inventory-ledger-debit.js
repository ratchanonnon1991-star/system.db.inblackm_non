"use client";

import PaginatedTable, { TablePagination, useTablePagination } from "@/components/table-pagination";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ClipboardPaste, ListChecks, Plus, RefreshCw, Save, Trash2, Undo2 } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { topupInventoryPath } from "@/lib/topup-inventory";
import { parseDebitPaste } from "@/lib/inventory-ledger";

const endpoint = "/api/projectm/ledger";
const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-ll-hairline-strong bg-ll-surface-1 px-4 text-sm text-ll-ink hover:bg-ll-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ll-primary disabled:opacity-50";
const primary = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-ll-primary px-5 text-sm font-semibold text-ll-on-primary hover:bg-ll-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ll-primary disabled:opacity-50";
const input = "min-h-11 w-full rounded-lg border border-ll-hairline-strong bg-ll-surface-1 px-3 text-sm text-ll-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ll-primary";
const cell = "border-b border-ll-hairline px-2 py-2 align-top";
const LAST_ACCOUNT = "inventory-ledger:last-account";
const uuid = () => crypto.randomUUID();
const bangkokToday = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
const amountOk = v => /^\d{1,16}(\.\d{1,4})?$/.test(String(v ?? "").trim());
const num = v => (v == null ? "—" : Number(v).toLocaleString("en-US", { maximumFractionDigits: 4 }));
const when = v => (v ? new Date(v).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" }) : "—");
const blankRow = () => ({ key: uuid(), requestId: uuid(), orderRef: "", amount: "", invoice: "", state: "draft", error: "" });
const storage = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };

function LookupBadge({ info, duplicate }) {
  if (duplicate) return <span className="text-xs text-ll-warning">เลขนี้ซ้ำในรายการด้านบน</span>;
  if (!info) return null;
  const notes = [];
  if (info.alreadyDebited) notes.push(<span key="d" className="text-ll-warning">⚠ เคยยกยอดออเดอร์นี้แล้ว</span>);
  if (info.botCompleted) notes.push(<span key="b" className="text-ll-warning">⚠ บอทเติมออเดอร์นี้สำเร็จแล้ว ระวังนับซ้ำ</span>);
  if (!info.found) notes.push(<span key="n" className="text-ll-ink-subtle">ไม่พบในระบบ (ยังบันทึกได้)</span>);
  else notes.push(<span key="f" className="text-ll-ink-subtle">✓ {[info.game, info.pack].filter(Boolean).join(" · ") || "พบออเดอร์"}{info.queue?.[0]?.status ? ` · คิว ${info.queue[0].status}` : ""}</span>);
  return <span className="flex flex-col gap-0.5 text-xs">{notes}</span>;
}

function AccountPicker({ accounts, value, onChange }) {
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return accounts.filter(a => !q || `${a.label} ${a.category ?? ""} ${a.currency}`.toLowerCase().includes(q));
  }, [accounts, query]);
  const groups = useMemo(() => {
    const map = new Map();
    for (const a of shown) { const g = a.category || "อื่นๆ"; if (!map.has(g)) map.set(g, []); map.get(g).push(a); }
    return [...map];
  }, [shown]);
  return <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
    <label className="text-sm">ค้นหาบัญชี<input value={query} onChange={e => setQuery(e.target.value)} placeholder="เช่น wavepay 5, bitcash 12, moniepoint" className={`${input} mt-2`} /></label>
    <label className="text-sm">บัญชี / ช่องทางที่ใช้เติม ({shown.length.toLocaleString("en-US")})
      <select value={value} onChange={e => onChange(e.target.value)} className={`${input} mt-2`} size={1}>
        <option value="">— เลือกบัญชี —</option>
        {groups.map(([g, list]) => <optgroup key={g} label={g}>{list.map(a => <option key={a.id} value={a.id} disabled={a.status !== "active"}>{a.label} ({a.currency}){a.status !== "active" ? " · ปิดใช้งาน" : ""}</option>)}</optgroup>)}
      </select>
    </label>
  </div>;
}

function History({ accounts, accountId, refreshKey, onReversed }) {
  const [day, setDay] = useState(bangkokToday);
  const [mine, setMine] = useState(true);
  const [onlyAccount, setOnlyAccount] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const load = useCallback(async () => {
    setError("");
    try {
      const p = new URLSearchParams({ view: "entries", from: day, to: day, ...(mine ? { mine: "1" } : {}), ...(onlyAccount && accountId ? { accountId } : {}) });
      setData(await apiJson(`${endpoint}?${p}`, { cache: "no-store" }));
    } catch (e) { setError(e.message); }
  }, [day, mine, onlyAccount, accountId]);
  useEffect(() => { const timer = setTimeout(load, 0); return () => clearTimeout(timer); }, [load, refreshKey]);
  async function reverse(entry) {
    if (!window.confirm(`ยกเลิกการยกยอด ${entry.orderRef} (${num(entry.amount)} ${entry.currency}) ใช่ไหม?\nระบบจะสร้างรายการกลับ ไม่ลบประวัติ`)) return;
    setBusy(entry.id);
    try {
      await apiJson(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reverse", requestId: uuid(), reversesEntryId: entry.id }) });
      onReversed(); await load();
    } catch (e) { setError(e.message); }
    finally { setBusy(""); }
  }
  const total = (data?.entries ?? []).reduce((m, e) => { const k = e.currency; m[k] = (m[k] ?? 0) - Number(e.direction) * Number(e.amount); return m; }, {});
  const label = id => accounts.find(a => a.id === id)?.label ?? "";
  return <section aria-label="ประวัติการยกยอด" className="space-y-3 rounded-xl border border-ll-hairline bg-ll-surface-1 p-4">
    <div className="flex flex-wrap items-end gap-3">
      <h2 className="mr-auto text-lg font-semibold">ประวัติการยกยอด</h2>
      <label className="text-sm">วันที่ (เวลาไทย)<input type="date" value={day} onChange={e => setDay(e.target.value)} className={`${input} mt-1`} /></label>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={mine} onChange={e => setMine(e.target.checked)} />เฉพาะของฉัน</label>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={onlyAccount} disabled={!accountId} onChange={e => setOnlyAccount(e.target.checked)} />เฉพาะบัญชีที่เลือก{accountId ? ` (${label(accountId)})` : ""}</label>
      <button type="button" onClick={load} className={button}><RefreshCw size={16} aria-hidden />โหลดใหม่</button>
    </div>
    {error && <p role="alert" className="text-sm text-ll-warning">{error}</p>}
    <p className="text-xs text-ll-ink-subtle">{data ? `${data.entries.length} รายการ` : "กำลังโหลด…"}{Object.keys(total).length ? ` · ยอดใช้สุทธิ ${Object.entries(total).map(([c, v]) => `${num(v)} ${c}`).join(" · ")}` : ""}{data?.truncated ? " · แสดงเฉพาะ 500 รายการล่าสุด" : ""}</p>
    <div className="overflow-x-auto"><PaginatedTable items={(data?.entries ?? [])} resetKey={JSON.stringify([day, mine, onlyAccount, accountId])}>{(tablePageItems, tablePageStart, tableAllItems) => (<table className="w-full min-w-[760px] text-left text-sm">
      <thead><tr className="text-xs text-ll-ink-subtle">{["เวลา", "บัญชี", "เลขออเดอร์", "ยอด", "Invoice", "ผู้บันทึก", ""].map(h => <th key={h} className={`${cell} font-medium`}>{h}</th>)}</tr></thead>
      <tbody>{tablePageItems.map((tableItem, tableIndex) => (e => <tr key={e.id} className={e.reversedBy || e.kind === "reversal" ? "text-ll-ink-subtle" : ""}>
        <td className={`${cell} whitespace-nowrap`}>{when(e.recordedAt)}</td>
        <td className={cell}>{e.accountLabel}</td>
        <td className={`${cell} font-medium`}>{e.orderRef}{e.kind === "reversal" && <span className="ml-1 text-xs">(รายการกลับ)</span>}{e.reversedBy && <span className="ml-1 text-xs">(ยกเลิกแล้ว)</span>}</td>
        <td className={`${cell} tabular-nums`}>{Number(e.direction) < 0 ? "" : "+"}{num(e.amount)} {e.currency}</td>
        <td className={cell}>{e.invoice || "—"}</td>
        <td className={cell}>{e.recordedBy}</td>
        <td className={cell}>{e.canReverse && <button type="button" disabled={busy === e.id} onClick={() => reverse(e)} className={button}><Undo2 size={14} aria-hidden />ยกเลิก</button>}</td>
      </tr>)(tableItem, tablePageStart + tableIndex, tableAllItems))}</tbody>
    </table>)}</PaginatedTable></div>
  </section>;
}

export default function InventoryLedgerDebit({ lang }) {
  const [accounts, setAccounts] = useState([]);
  const [accountId, setAccountId] = useState("");
  const [rows, setRows] = useState(() => [blankRow()]);
  const draftPagination = useTablePagination(rows);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [lookups, setLookups] = useState({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const orderInputs = useRef(new Map());
  const focusAfterPage = useRef(null);
  const asked = useRef(new Set());

  useEffect(() => {
    const input = orderInputs.current.get(focusAfterPage.current);
    if (input) { input.focus(); focusAfterPage.current = null; }
  }, [rows, draftPagination.page, draftPagination.pageSize]);

  useEffect(() => {
    apiJson(`${endpoint}?view=accounts`, { cache: "no-store" })
      .then(r => {
        setAccounts(r.accounts ?? []);
        const last = storage.get(LAST_ACCOUNT);
        if (last && r.accounts?.some(a => a.id === last && a.status === "active")) setAccountId(last);
      })
      .catch(e => setError(e.message));
  }, []);
  const account = accounts.find(a => a.id === accountId);
  function chooseAccount(id) { setAccountId(id); if (id) storage.set(LAST_ACCOUNT, id); }

  // Look up order numbers shortly after they are typed or pasted.
  const refsKey = [...new Set(rows.map(r => r.orderRef.trim()).filter(Boolean))].join("\n");
  useEffect(() => {
    if (!refsKey) return undefined;
    const timer = setTimeout(async () => {
      const refs = refsKey.split("\n").filter(r => !asked.current.has(r));
      if (!refs.length) return;
      refs.forEach(r => asked.current.add(r));
      try {
        const { orders } = await apiJson(`${endpoint}/lookup`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refs }) });
        setLookups(prev => ({ ...prev, ...orders }));
      } catch { refs.forEach(r => asked.current.delete(r)); }
    }, 450);
    return () => clearTimeout(timer);
  }, [refsKey]);

  const counts = useMemo(() => {
    const m = new Map();
    for (const r of rows) { const k = r.orderRef.trim(); if (k && r.state !== "saved") m.set(k, (m.get(k) ?? 0) + 1); }
    return m;
  }, [rows]);
  const update = (key, patch) => setRows(rs => rs.map(r => (r.key === key ? { ...r, ...patch, ...(r.state === "error" ? { state: "draft", error: "" } : {}) } : r)));
  function addRow(focus = true) {
    const row = blankRow();
    if (focus) {
      focusAfterPage.current = row.key;
      draftPagination.onPage(Math.floor(rows.length / draftPagination.pageSize) + 1);
    }
    setRows(rs => [...rs, row]);
  }
  function focusRow(index) {
    const row = rows[index];
    if (!row) return;
    const input = orderInputs.current.get(row.key);
    if (input) input.focus();
    else {
      focusAfterPage.current = row.key;
      draftPagination.onPage(Math.floor(index / draftPagination.pageSize) + 1);
    }
  }
  function applyPaste() {
    const parsed = parseDebitPaste(pasteText);
    if (!parsed.length) return;
    setRows(rs => [...rs.filter(r => r.orderRef || r.amount || r.state === "saved"), ...parsed.map(p => ({ ...blankRow(), ...p }))]);
    setPasteText(""); setPasteOpen(false);
  }
  const ready = rows.filter(r => r.state !== "saved" && r.orderRef.trim() && amountOk(r.amount));
  const invalid = rows.filter(r => r.state !== "saved" && (r.orderRef.trim() || r.amount) && !(r.orderRef.trim() && amountOk(r.amount)));
  const readyTotal = ready.reduce((s, r) => s + Number(r.amount), 0);

  async function save() {
    if (!account || !ready.length) return;
    setSaving(true); setError("");
    const batch = ready.slice(0, 200);
    setRows(rs => rs.map(r => (batch.some(b => b.key === r.key) ? { ...r, state: "saving" } : r)));
    try {
      const result = await apiJson(endpoint, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "debit", accountId, rows: batch.map(r => ({ requestId: r.requestId, orderRef: r.orderRef.trim(), amount: r.amount.trim(), invoice: r.invoice.trim() })) }) });
      setRows(rs => rs.map(r => {
        const i = batch.findIndex(b => b.key === r.key);
        if (i < 0) return r;
        const res = result.results.find(x => x.index === i);
        return res?.ok ? { ...r, state: "saved", savedAccount: account.label } : { ...r, state: "error", error: res?.error ?? "บันทึกไม่สำเร็จ" };
      }));
      batch.forEach(b => asked.current.delete(b.orderRef.trim()));
      setRefreshKey(k => k + 1);
    } catch (e) {
      // Nothing is lost: the same request ids are sent again on retry, so saved rows are not duplicated.
      setError(e.message);
      setRows(rs => rs.map(r => (r.state === "saving" ? { ...r, state: "draft" } : r)));
    } finally { setSaving(false); }
  }

  return <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-4 pb-14 pt-10 text-ll-ink sm:px-6">
    <header className="flex flex-wrap items-center justify-between gap-4 pr-12">
      <div><p className="text-xs text-ll-ink-tertiary">TOPUP INVENTORY · ยกยอดเติมมือ</p><h1 className="mt-2 text-3xl font-semibold">ยกยอด</h1>
        <p className="mt-2 text-sm text-ll-ink-subtle">เลือกบัญชีที่ใช้เติม แล้วใส่เลขออเดอร์กับยอดที่ตัด ระบบหักยอดของบัญชีนั้นให้ ใช้แทนการยกยอดในชีท</p></div>
      <div className="flex flex-wrap gap-2">
        <Link href={`${topupInventoryPath(lang)}/channels`} className={button}><ListChecks size={16} aria-hidden />ยอดเติมมือรายบัญชี</Link>
        <Link href={topupInventoryPath(lang)} className={button}><ArrowLeft size={16} aria-hidden />กลับ Topup Inventory</Link>
      </div>
    </header>

    <section aria-label="เลือกบัญชี" className="space-y-3 rounded-xl border border-ll-hairline bg-ll-surface-1 p-4">
      <AccountPicker accounts={accounts} value={accountId} onChange={chooseAccount} />
      {!accounts.length && !error && <p className="text-sm text-ll-ink-subtle">กำลังโหลดรายการบัญชี… (ถ้าว่างนาน แปลว่ายังไม่ได้นำเข้าทะเบียนบัญชี)</p>}
      {account && <p className="text-sm">ยกยอดเข้า <b>{account.label}</b> · สกุล {account.currency}{account.category ? ` · ${account.category}` : ""}</p>}
    </section>

    <section aria-label="รายการยกยอด" className="space-y-3 rounded-xl border border-ll-hairline bg-ll-surface-1 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-lg font-semibold">รายการ</h2>
        <button type="button" onClick={() => setPasteOpen(o => !o)} className={button}><ClipboardPaste size={16} aria-hidden />วางจากชีท</button>
        <button type="button" onClick={() => addRow()} className={button}><Plus size={16} aria-hidden />เพิ่มแถว</button>
        <button type="button" onClick={() => setRows(rs => { const left = rs.filter(r => r.state !== "saved"); return left.length ? left : [blankRow()]; })} className={button}><Trash2 size={16} aria-hidden />ล้างแถวที่บันทึกแล้ว</button>
      </div>
      {pasteOpen && <div className="space-y-2">
        <label className="text-sm">คัดลอกจากชีทมาวางได้เลย: แต่ละบรรทัด = เลขออเดอร์ [Tab] ยอด [Tab] Invoice (ไม่ใส่ก็ได้)
          <textarea rows={6} value={pasteText} onChange={e => setPasteText(e.target.value)} className={`${input} mt-2 py-2 font-mono`} placeholder={"K7366363\t11000\nK7366348\t5500"} /></label>
        <button type="button" onClick={applyPaste} className={button}>เพิ่ม {parseDebitPaste(pasteText).length} แถว</button>
      </div>}
      <div className="overflow-x-auto"><><table className="w-full min-w-[720px] text-left text-sm">
        <thead><tr className="text-xs text-ll-ink-subtle"><th className={`${cell} w-8`}>#</th><th className={cell}>เลขออเดอร์</th><th className={cell}>ยอดที่ตัด{account ? ` (${account.currency})` : ""}</th><th className={cell}>Invoice (ถ้ามี)</th><th className={cell}>ตรวจสอบ</th><th className={cell}></th></tr></thead>
        <tbody>{draftPagination.items.map((r, tableIndex) => {
          const i = draftPagination.start + tableIndex;

          const locked = r.state === "saved" || r.state === "saving";
          return <tr key={r.key} className={r.state === "saved" ? "bg-ll-surface-2" : ""}>
            <td className={`${cell} text-xs text-ll-ink-subtle`}>{i + 1}</td>
            <td className={cell}><input aria-label={`เลขออเดอร์แถว ${i + 1}`} ref={el => { if (el) orderInputs.current.set(r.key, el); else orderInputs.current.delete(r.key); }} disabled={locked} value={r.orderRef} onChange={e => update(r.key, { orderRef: e.target.value })} className={input} /></td>
            <td className={cell}><input aria-label={`ยอดแถว ${i + 1}`} inputMode="decimal" disabled={locked} value={r.amount} onChange={e => update(r.key, { amount: e.target.value.replace(/[,\s]/g, "") })}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); if (i === rows.length - 1) addRow(); else focusRow(i + 1); } }}
              className={`${input} tabular-nums ${r.amount && !amountOk(r.amount) ? "border-ll-warning" : ""}`} /></td>
            <td className={cell}><input aria-label={`Invoice แถว ${i + 1}`} disabled={locked} value={r.invoice} onChange={e => update(r.key, { invoice: e.target.value })} className={input} /></td>
            <td className={`${cell} min-w-56`}>
              {r.state === "saved" ? <span className="text-xs text-ll-success">✓ บันทึกแล้ว ({r.savedAccount})</span>
                : r.state === "saving" ? <span className="text-xs text-ll-ink-subtle">กำลังบันทึก…</span>
                : r.state === "error" ? <span className="text-xs text-ll-warning">{r.error}</span>
                : <LookupBadge info={lookups[r.orderRef.trim()]} duplicate={counts.get(r.orderRef.trim()) > 1} />}
            </td>
            <td className={cell}>{!locked && rows.length > 1 && <button type="button" aria-label={`ลบแถว ${i + 1}`} onClick={() => setRows(rs => rs.filter(x => x.key !== r.key))} className="min-h-11 px-2 text-ll-ink-subtle hover:text-ll-ink">×</button>}</td>
          </tr>;

        })}</tbody>
      </table>{draftPagination.showControls && <TablePagination {...draftPagination} loading={saving} label="แบ่งหน้ารายการยกยอด" />}</></div>
      {error && <p role="alert" className="text-sm text-ll-warning">{error}</p>}
      <div className="flex flex-wrap items-center justify-end gap-3">
        {invalid.length > 0 && <span className="text-xs text-ll-warning">{invalid.length} แถวยังไม่ครบ (ต้องมีเลขออเดอร์และยอดเป็นตัวเลข)</span>}
        <button type="button" disabled={!account || !ready.length || saving} onClick={save} className={primary}><Save size={16} aria-hidden />
          {saving ? "กำลังบันทึก…" : `บันทึก ${ready.length} รายการ · รวม ${num(readyTotal)} ${account?.currency ?? ""}`}</button>
      </div>
      {!account && <p className="text-right text-xs text-ll-ink-subtle">เลือกบัญชีก่อนบันทึก</p>}
      <p className="text-xs leading-6 text-ll-ink-subtle">กด Enter ที่ช่องยอดเพื่อขึ้นแถวใหม่ · บันทึกซ้ำได้โดยไม่เกิดรายการซ้ำ · บันทึกผิดกด &quot;ยกเลิก&quot; ในประวัติได้ภายในวันเดียวกัน (ระบบสร้างรายการกลับ ไม่ลบประวัติ)</p>
    </section>

    <History accounts={accounts} accountId={accountId} refreshKey={refreshKey} onReversed={() => setRefreshKey(k => k + 1)} />
  </main>;
}
