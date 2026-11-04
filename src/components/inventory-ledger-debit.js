"use client";

import PaginatedTable, { TablePagination, useTablePagination } from "@/components/table-pagination";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ClipboardPaste, ListChecks, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import TopupInventoryPage from "@/components/topup-inventory-page";
import { apiJson } from "@/lib/api-json";
import { topupInventoryPath } from "@/lib/topup-inventory";
import { tivButton as button, tivCheck, tivField, tivInput as input, tivPrimary as primary, tivTable, tivTableBox } from "@/lib/topup-inventory-ui";
import { parseDebitPaste } from "@/lib/inventory-ledger";

const endpoint = "/api/projectm/ledger";
const LAST_ACCOUNT = "inventory-ledger:last-account";
const uuid = () => crypto.randomUUID();
const bangkokToday = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
const amountOk = v => /^\d{1,16}(\.\d{1,4})?$/.test(String(v ?? "").trim());
const num = v => (v == null ? "—" : Number(v).toLocaleString("en-US", { maximumFractionDigits: 4 }));
const when = v => (v ? new Date(v).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" }) : "—");
const blankRow = () => ({ key: uuid(), requestId: uuid(), orderRef: "", amount: "", invoice: "", state: "draft", error: "" });
const storage = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };

// The check column of an unsaved row: what is missing, then what the order lookup found.
function RowCheck({ row, info, duplicate }) {
  const ref = row.orderRef.trim();
  if (!ref && !row.amount && !row.invoice) return null;
  if (duplicate) return <span className="tiv-bad">ซ้ำในตาราง</span>;
  if (!ref) return <span className="tiv-warn">ใส่เลขออเดอร์</span>;
  if (!amountOk(row.amount)) return <span className="tiv-warn">ยอดไม่ถูกต้อง</span>;
  const notes = [<span key="r" className="tiv-good">พร้อมบันทึก</span>];
  if (info?.alreadyDebited) notes.push(<span key="d" className="tiv-warn">⚠ เคยยกยอดออเดอร์นี้แล้ว</span>);
  if (info?.botCompleted) notes.push(<span key="b" className="tiv-warn">⚠ บอทเติมออเดอร์นี้สำเร็จแล้ว ระวังนับซ้ำ</span>);
  if (info && !info.found) notes.push(<span key="n" className="sm">ไม่พบในระบบ (ยังบันทึกได้)</span>);
  else if (info) notes.push(<span key="f" className="sm">✓ {[info.game, info.pack].filter(Boolean).join(" · ") || "พบออเดอร์"}{info.queue?.[0]?.status ? ` · คิว ${info.queue[0].status}` : ""}</span>);
  return notes;
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
  return <div className="tiv-two">
    <label className={tivField}><span>ค้นหาบัญชี</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="เช่น wavepay 5, bitcash 12, moniepoint" autoComplete="off" className={input} /></label>
    <label className={tivField}><span>บัญชี / ช่องทางที่ใช้เติม ({shown.length.toLocaleString("en-US")})</span>
      <select value={value} onChange={e => onChange(e.target.value)} className={input} size={1}>
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
  const net = Object.entries(total).map(([c, v]) => `${num(v)} ${c}`).join(" · ");
  return <section aria-label="ประวัติการยกยอด" className="tiv-card">
    <div className="tiv-card-h">
      <h2>ประวัติการยกยอด<small>{data ? `${data.entries.length} รายการ` : "กำลังโหลด…"}{net ? ` · ยอดใช้สุทธิ ${net}` : ""}{data?.truncated ? " · แสดงเฉพาะ 500 รายการล่าสุด" : ""}</small></h2>
      <div className="tiv-tools">
        <label className="flex items-center gap-2 text-xs font-semibold text-ll-ink-subtle">วันที่ (เวลาไทย)<input type="date" value={day} onChange={e => setDay(e.target.value)} className={`${input} date`} /></label>
        <label className={tivCheck}><input type="checkbox" checked={mine} onChange={e => setMine(e.target.checked)} />เฉพาะของฉัน</label>
        <label className={tivCheck}><input type="checkbox" checked={onlyAccount} disabled={!accountId} onChange={e => setOnlyAccount(e.target.checked)} />เฉพาะบัญชีที่เลือก{accountId ? ` (${label(accountId)})` : ""}</label>
        <button type="button" onClick={load} className={button}><RefreshCw size={16} aria-hidden />โหลดใหม่</button>
      </div>
    </div>
    {error && <p role="alert" className="tiv-alert mb-3">{error}</p>}
    {data && !data.entries.length ? <div className="tiv-dempty"><strong>ไม่มีรายการในวันที่เลือก</strong>บันทึกรายการด้านบน แล้วจะแสดงที่นี่ทันที</div>
      : <div className={tivTableBox}><PaginatedTable items={(data?.entries ?? [])} resetKey={JSON.stringify([day, mine, onlyAccount, accountId])}>{(tablePageItems, tablePageStart, tableAllItems) => (<table className={`${tivTable} min-w-[760px]`}>
      <thead><tr>{["เวลา", "บัญชี", "เลขออเดอร์", "ยอด", "Invoice", "ผู้บันทึก", ""].map(h => <th key={h} className={h === "ยอด" ? "r" : ""}>{h}</th>)}</tr></thead>
      <tbody>{tablePageItems.map((tableItem, tableIndex) => (e => <tr key={e.id} className={e.reversedBy || e.kind === "reversal" ? "cx" : ""}>
        <td className="whitespace-nowrap">{when(e.recordedAt)}</td>
        <td>{e.accountLabel}</td>
        <td><span className="oid">{e.orderRef}</span>{e.kind === "reversal" && <span className="sm">รายการกลับ</span>}{e.reversedBy && <span className="sm">ยกเลิกแล้ว</span>}</td>
        <td className={`r b ${Number(e.direction) < 0 ? "" : "tiv-neg"}`}>{Number(e.direction) < 0 ? "" : "+"}{num(e.amount)} {e.currency}</td>
        <td>{e.invoice || "—"}</td>
        <td>{e.recordedBy}</td>
        <td className="r">{e.canReverse && <button type="button" disabled={busy === e.id} onClick={() => reverse(e)} className="tiv-lnk">ยกเลิก</button>}</td>
      </tr>)(tableItem, tablePageStart + tableIndex, tableAllItems))}</tbody>
    </table>)}</PaginatedTable></div>}
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

  return <TopupInventoryPage provider="ledger" actions={<Link href={`${topupInventoryPath(lang)}/channels`} className={button}><ListChecks size={16} aria-hidden />ยอดเติมมือรายบัญชี</Link>}>
    <section aria-label="เลือกบัญชี" className="tiv-card">
      <AccountPicker accounts={accounts} value={accountId} onChange={chooseAccount} />
      {!accounts.length && !error && <p className="tiv-hint">กำลังโหลดรายการบัญชี… (ถ้าว่างนาน แปลว่ายังไม่ได้นำเข้าทะเบียนบัญชี)</p>}
      {account && <p className="tiv-hint">ยกยอดเข้า <b className="text-ll-ink">{account.label}</b> · สกุล {account.currency}{account.category ? ` · ${account.category}` : ""}</p>}
    </section>

    <section aria-label="รายการยกยอด" className="tiv-card">
      <div className="tiv-card-h">
        <h2>รายการ</h2>
        <div className="tiv-tools">
          <button type="button" onClick={() => setPasteOpen(o => !o)} aria-expanded={pasteOpen} className={button}><ClipboardPaste size={16} aria-hidden />วางจากชีท</button>
          <button type="button" onClick={() => addRow()} className={button}><Plus size={16} aria-hidden />เพิ่มแถว</button>
          <button type="button" onClick={() => setRows(rs => { const left = rs.filter(r => r.state !== "saved"); return left.length ? left : [blankRow()]; })} className={button}><Trash2 size={16} aria-hidden />ล้างแถวที่บันทึกแล้ว</button>
        </div>
      </div>
      {pasteOpen && <div className="tiv-paste">
        <label className={tivField}><span>วางข้อมูลจากชีท (เลขออเดอร์ [Tab] ยอด [Tab] Invoice ไม่ใส่ Invoice ก็ได้)</span>
          <textarea rows={6} value={pasteText} onChange={e => setPasteText(e.target.value)} className={`${input} font-mono`} placeholder={"K7366363\t11000\nK7366348\t5500"} /></label>
        <button type="button" onClick={applyPaste} className={primary}>นำเข้า {parseDebitPaste(pasteText).length} แถว</button>
      </div>}
      <div className="tiv-erows">{draftPagination.items.map((r, tableIndex) => {
        const i = draftPagination.start + tableIndex;
        const locked = r.state === "saved" || r.state === "saving";
        return <div key={r.key} className={`tiv-erow${r.state === "saved" ? " saved" : ""}`}>
          <span className="no">{i + 1}</span>
          <label className="tiv-cell c-o"><small>เลขออเดอร์</small><input aria-label={`เลขออเดอร์แถว ${i + 1}`} ref={el => { if (el) orderInputs.current.set(r.key, el); else orderInputs.current.delete(r.key); }} disabled={locked} value={r.orderRef} autoComplete="off" onChange={e => update(r.key, { orderRef: e.target.value })} className={input} /></label>
          <label className="tiv-cell c-a"><small>ยอดที่ตัด{account ? ` (${account.currency})` : ""}</small><input aria-label={`ยอดแถว ${i + 1}`} inputMode="decimal" placeholder="0.00" disabled={locked} value={r.amount} autoComplete="off" onChange={e => update(r.key, { amount: e.target.value.replace(/[,\s]/g, "") })}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); if (i === rows.length - 1) addRow(); else focusRow(i + 1); } }}
            className={`${input} num`} /></label>
          <label className="tiv-cell c-i"><small>Invoice (ถ้ามี)</small><input aria-label={`Invoice แถว ${i + 1}`} disabled={locked} value={r.invoice} autoComplete="off" onChange={e => update(r.key, { invoice: e.target.value })} className={input} /></label>
          <span className="tiv-chk" aria-live="polite">
            {r.state === "saved" ? <span>บันทึกแล้ว · {r.savedAccount}</span>
              : r.state === "saving" ? <span>กำลังบันทึก…</span>
              : r.state === "error" ? <span className="tiv-bad">{r.error}</span>
              : <RowCheck row={r} info={lookups[r.orderRef.trim()]} duplicate={counts.get(r.orderRef.trim()) > 1} />}
          </span>
          {!locked && rows.length > 1 ? <button type="button" aria-label={`ลบแถว ${i + 1}`} onClick={() => setRows(rs => rs.filter(x => x.key !== r.key))} className="tiv-rm">×</button> : <span />}
        </div>;
      })}</div>
      {draftPagination.showControls && <TablePagination {...draftPagination} loading={saving} label="แบ่งหน้ารายการยกยอด" />}
      {error && <p role="alert" className="tiv-alert mt-4">{error}</p>}
      <div className="tiv-foot">
        <button type="button" disabled={!account || !ready.length || saving} onClick={save} className={`${primary} big`}><Save size={16} aria-hidden />
          {saving ? "กำลังบันทึก…" : `บันทึก ${ready.length} รายการ · รวม ${num(readyTotal)} ${account?.currency ?? ""}`}</button>
        <small>{!account ? "เลือกบัญชีก่อนบันทึก" : invalid.length > 0 ? `${invalid.length} แถวยังไม่ครบ (ต้องมีเลขออเดอร์และยอดเป็นตัวเลข)` : ready.length ? "" : "กรอกเลขออเดอร์และยอดที่ตัด"}</small>
      </div>
      <p className="tiv-hint">กด Enter ที่ช่องยอดเพื่อขึ้นแถวใหม่ · บันทึกซ้ำได้โดยไม่เกิดรายการซ้ำ · บันทึกผิดกด &quot;ยกเลิก&quot; ในประวัติได้ภายในวันเดียวกัน (ระบบสร้างรายการกลับ ไม่ลบประวัติ)</p>
    </section>

    <History accounts={accounts} accountId={accountId} refreshKey={refreshKey} onReversed={() => setRefreshKey(k => k + 1)} />
  </TopupInventoryPage>;
}
