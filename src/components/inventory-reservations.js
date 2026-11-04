"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { topupInventoryPath } from "@/lib/topup-inventory";

const endpoint = "/api/projectm/ledger/reservations";
const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-ll-hairline-strong bg-ll-surface-1 px-4 text-sm text-ll-ink hover:bg-ll-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ll-primary disabled:opacity-50";
const input = "min-h-11 w-full rounded-lg border border-ll-hairline-strong bg-ll-surface-1 px-3 text-sm text-ll-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ll-primary";
const when = (v) => (v ? new Date(v).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" }) : "");

function AccountRow({ account, canManage, busy, onAction }) {
  const held = account.holderId != null, closed = account.status !== "active";
  return <li className="flex flex-wrap items-center justify-between gap-3 border-t border-ll-hairline px-4 py-3">
    <div className="min-w-0">
      <p className="break-words font-medium">{account.label} <span className="text-xs font-normal text-ll-ink-subtle">· {account.currency}</span></p>
      <p className={`mt-1 text-xs ${account.mine ? "text-ll-primary" : "text-ll-ink-subtle"}`}>
        {closed ? "ปิดใช้งาน" : held ? `${account.mine ? "คุณจองไว้" : `จองโดย ${account.holder}`} · ${when(account.reservedAt)}` : "ว่าง"}
      </p>
    </div>
    {!closed && (account.mine
      ? <button type="button" className={button} disabled={busy} onClick={() => onAction("DELETE", account)}>คืน</button>
      : held
        ? canManage && <button type="button" className={button} disabled={busy} onClick={() => onAction("DELETE", account)}>คืนแทน</button>
        : <button type="button" className={button} disabled={busy} onClick={() => onAction("POST", account)}>จอง</button>)}
  </li>;
}

export default function InventoryReservations({ lang }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [mineOnly, setMineOnly] = useState(false);
  const load = useCallback(async () => {
    setError("");
    try { setData(await apiJson(endpoint, { cache: "no-store" })); } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { const timer = setTimeout(load, 0); return () => clearTimeout(timer); }, [load]);

  async function act(method, account) {
    if (method === "DELETE" && !account.mine && !window.confirm(`คืน ${account.label} ที่ ${account.holder} จองไว้?`)) return;
    setBusy(true); setError("");
    try { await apiJson(endpoint, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountId: account.id }) }); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); load(); }
  }

  const groups = useMemo(() => {
    const term = search.trim().toLowerCase(), map = new Map();
    for (const a of data?.accounts ?? []) {
      if (mineOnly && !a.mine) continue;
      if (term && !`${a.label} ${a.category ?? ""} ${a.holder ?? ""}`.toLowerCase().includes(term)) continue;
      const key = a.category || "อื่นๆ";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(a);
    }
    return [...map];
  }, [data, search, mineOnly]);
  const mine = (data?.accounts ?? []).filter((a) => a.mine).length;

  return <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-4 pb-14 pt-10 text-ll-ink sm:px-6">
    <header className="flex flex-wrap items-center justify-between gap-4 pr-12">
      <div><p className="text-xs text-ll-ink-tertiary">TOPUP INVENTORY</p><h1 className="mt-2 text-3xl font-semibold">จองช่องทาง</h1>
        <p className="mt-2 text-sm text-ll-ink-subtle">จองบัญชีที่จะใช้เติม แล้วเลือกบัญชีนั้นพร้อมกรอกยอดที่ตัดในหน้าออเดอร์ของ inblackm (เว็บ · Russia · MarketPlace) ไม่ต้องยกยอดซ้ำ</p></div>
      <Link href={topupInventoryPath(lang)} className={button}><ArrowLeft size={16} aria-hidden />กลับ Topup Inventory</Link>
    </header>
    {data && !data.mapped && <p role="status" className="rounded-xl border border-ll-hairline p-4 text-sm text-ll-warning">
      บัญชีนี้ยังไม่ได้จับคู่กับ ID พนักงานของ inblackm บัญชีที่จองจะยังไม่ขึ้นในหน้าออเดอร์ ให้ Admin จับคู่ที่{" "}
      <Link className="underline underline-offset-4" href={`/projectm/${lang}/itune/admin/order-links`}>หน้าจับคู่บัญชีพนักงาน</Link></p>}
    <section aria-label="กรองบัญชี" className="flex flex-wrap items-end gap-3 rounded-xl border border-ll-hairline bg-ll-surface-1 p-4">
      <label className="min-w-0 flex-1 basis-64 text-sm">ค้นหาบัญชี / กลุ่ม / คนจอง<input value={search} onChange={(e) => setSearch(e.target.value)} className={`${input} mt-1`} /></label>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />เฉพาะที่ฉันจอง ({mine})</label>
      <button type="button" className={button} onClick={load}><RefreshCw size={16} aria-hidden />โหลดใหม่</button>
    </section>
    <p className="text-xs text-ll-ink-subtle">จองได้ทีละคนต่อบัญชี และไม่หมดอายุเอง กดคืนเมื่อเลิกใช้ · บอทยังใช้บัญชีที่จองได้ตามปกติ · เมล iTunes จองในหน้า iTune เหมือนเดิม</p>
    {error && <p role="alert" className="rounded-xl border border-ll-hairline p-4 text-sm">{error}</p>}
    {!data && !error && <p role="status" className="text-sm text-ll-ink-subtle">กำลังโหลด…</p>}
    {groups.map(([category, accounts]) => <section key={category} aria-label={category} className="overflow-hidden rounded-xl border border-ll-hairline bg-ll-surface-1">
      <h2 className="px-4 py-3 font-semibold">{category} <span className="text-sm font-normal text-ll-ink-subtle">· {accounts.length} บัญชี</span></h2>
      <ul>{accounts.map((a) => <AccountRow key={a.id} account={a} canManage={data.canManage} busy={busy} onAction={act} />)}</ul>
    </section>)}
    {data && !groups.length && <p className="text-sm text-ll-ink-subtle">ไม่พบบัญชีตามตัวกรอง</p>}
  </main>;
}
