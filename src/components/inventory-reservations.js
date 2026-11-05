"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import TopupInventoryPage from "@/components/topup-inventory-page";
import { apiJson } from "@/lib/api-json";
import { topupInventoryPath } from "@/lib/topup-inventory";
import { tivButton as button, tivCheck, tivField, tivInput as input, tivPrimary } from "@/lib/topup-inventory-ui";

const endpoint = "/api/projectm/ledger/reservations";
const when = (v) => (v ? new Date(v).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" }) : "");
const money = (v) => Number(v).toLocaleString("en-US", { maximumFractionDigits: 2 });
const STATUS = { all: "ทุกสถานะ", free: "ว่าง", held: "จองแล้ว", mine: "ที่ฉันจอง" };
const statusOf = (a) => (a.mine ? "mine" : a.holderId != null ? "held" : "free");

function AccountRow({ account, canManage, busy, onAction }) {
  const held = account.holderId != null, closed = account.status !== "active";
  return <li className="flex flex-wrap items-center justify-between gap-3 border-t border-ll-hairline py-3 first:border-t-0">
    <div className="min-w-0">
      <p className="break-words font-semibold">{account.label} <span className="text-xs font-normal text-ll-ink-subtle">· {account.currency}</span></p>
      <p className={`mt-1 text-xs ${account.mine ? "font-semibold text-ll-primary" : held ? "text-ll-warning" : "text-ll-success"}`}>
        {closed ? "ปิดใช้งาน" : held ? `${account.mine ? "คุณจองไว้" : `จองโดย ${account.holder}`} · ${when(account.reservedAt)}` : "ว่าง"}
      </p>
      <p className="mt-1 text-xs text-ll-ink-subtle">
        {account.bot
          ? <>คงเหลือ (บอทอ่าน) <span className="font-semibold tabular-nums text-ll-ink">{money(account.bot.balance)} {account.currency}</span> · {when(account.bot.balanceAt)}</>
          : account.balance == null
            ? "ยังไม่มียอดคงเหลือ"
            : <>คงเหลือประมาณ <span className="font-semibold tabular-nums text-ll-ink">{money(account.balance)} {account.currency}</span> · ยอดตั้งต้น {when(account.balanceSnapshotAt)}</>}
        {account.lastActivityAt && ` · ใช้ล่าสุด ${when(account.lastActivityAt)}`}
      </p>
    </div>
    {!closed && (account.mine
      ? <button type="button" className={button} disabled={busy} onClick={() => onAction("DELETE", account)}>คืน</button>
      : held
        ? canManage && <button type="button" className={button} disabled={busy} onClick={() => onAction("DELETE", account)}>คืนแทน</button>
        : <button type="button" className={tivPrimary} disabled={busy} onClick={() => onAction("POST", account)}>จอง</button>)}
  </li>;
}

// The accounts (all, or one Topup Inventory page's), and reserving / releasing them.
function useReservations(channel) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setError("");
    try { setData(await apiJson(channel ? `${endpoint}?channel=${encodeURIComponent(channel)}` : endpoint, { cache: "no-store" })); }
    catch (e) { setError(e.message); }
  }, [channel]);
  useEffect(() => { const timer = setTimeout(load, 0); return () => clearTimeout(timer); }, [load]);
  async function act(method, account) {
    if (method === "DELETE" && !account.mine && !window.confirm(`คืน ${account.label} ที่ ${account.holder} จองไว้?`)) return;
    setBusy(true); setError("");
    try { await apiJson(endpoint, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountId: account.id }) }); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); load(); }
  }
  return { data, error, busy, load, act };
}

function NotMapped({ lang }) {
  return <p role="status" className="tiv-banner">
    <span className="tiv-warn">บัญชีนี้ยังไม่ได้จับคู่กับ ID พนักงานของ inblackm บัญชีที่จองจะยังไม่ขึ้นในหน้าออเดอร์</span> ให้ Admin จับคู่ที่{" "}
    <Link className="tiv-lnk underline underline-offset-4" href={`${topupInventoryPath(lang)}/staff-links`}>หน้าจับคู่พนักงาน</Link></p>;
}

/** One Topup Inventory page's own accounts to reserve, as a card inside that page. */
export function ChannelReservations({ lang, channel }) {
  const { data, error, busy, load, act } = useReservations(channel);
  const accounts = data?.accounts ?? [];
  if (data && !accounts.length && !error) return null; // a page with no imported sheet account
  return <section aria-label="จองช่องทาง" className="tiv-card">
    <div className="tiv-card-h mb-2 flex flex-wrap items-center justify-between gap-2">
      <h2>จองช่องทาง<small>{accounts.length} บัญชี · จองอยู่ {accounts.filter((a) => a.holderId != null).length}</small></h2>
      <button type="button" className={button} onClick={load}><RefreshCw size={16} aria-hidden />โหลดใหม่</button>
    </div>
    {data && !data.mapped && <NotMapped lang={lang} />}
    {error && <p role="alert" className="tiv-alert">{error}</p>}
    {data?.botErrors?.length > 0 && <p role="status" className="tiv-muted">อ่านยอดบอทไม่สำเร็จ แสดงยอดจากชีตแทน</p>}
    {!data && !error && <p role="status" className="tiv-muted">กำลังโหลด…</p>}
    {/* Razer has hundreds of wallets: the list scrolls so the page's own content stays in reach. */}
    <ul className="max-h-[28rem] overflow-y-auto">{accounts.map((a) => <AccountRow key={a.id} account={a} canManage={data.canManage} busy={busy} onAction={act} />)}</ul>
    <p className="tiv-hint">จองแล้วเลือกบัญชีนี้พร้อมกรอกยอดที่ตัดในหน้าออเดอร์ inblackm ได้ · ดูทุกช่องทางรวมกันที่ <Link className="tiv-lnk underline underline-offset-4" href={`${topupInventoryPath(lang)}/reservations`}>หน้าจองช่องทาง</Link></p>
  </section>;
}

export default function InventoryReservations({ lang }) {
  const { data, error, busy, load, act } = useReservations(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [group, setGroup] = useState("");
  const [currency, setCurrency] = useState("");
  const [withBalance, setWithBalance] = useState(false);

  const groups = useMemo(() => {
    const term = search.trim().toLowerCase(), map = new Map();
    for (const a of data?.accounts ?? []) {
      const key = a.category || "อื่นๆ";
      if (status !== "all" && statusOf(a) !== status) continue;
      if (group && key !== group) continue;
      if (currency && a.currency !== currency) continue;
      if (withBalance && !(Number(a.bot?.balance ?? a.balance) > 0)) continue;
      if (term && !`${a.label} ${a.category ?? ""} ${a.holder ?? ""}`.toLowerCase().includes(term)) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(a);
    }
    return [...map];
  }, [data, search, status, group, currency, withBalance]);
  const all = data?.accounts ?? [];
  const groupNames = useMemo(() => [...new Set((data?.accounts ?? []).map((a) => a.category || "อื่นๆ"))], [data]);
  const currencies = useMemo(() => [...new Set((data?.accounts ?? []).map((a) => a.currency))].sort(), [data]);
  const count = (s) => all.filter((a) => s === "all" || statusOf(a) === s).length;

  return <TopupInventoryPage provider="reservations" description="จองบัญชีที่จะใช้เติม แล้วเลือกบัญชีนั้นพร้อมกรอกยอดที่ตัดในหน้าออเดอร์ของ inblackm (เว็บ · Russia · MarketPlace) ไม่ต้องยกยอดซ้ำ">
    {data && !data.mapped && <NotMapped lang={lang} />}
    <section aria-label="กรองบัญชี" className="tiv-card">
      <div className="flex flex-wrap items-end gap-3">
        <label className={`${tivField} flex-1 basis-64`}><span>ค้นหาบัญชี / กลุ่ม / คนจอง</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="เช่น wavepay, moniepoint, ชื่อคนจอง" className={input} /></label>
        <label className={tivField}><span>สถานะ</span><select value={status} onChange={(e) => setStatus(e.target.value)} className={input}>
          {Object.entries(STATUS).map(([key, label]) => <option key={key} value={key}>{label} ({count(key)})</option>)}</select></label>
        <label className={`${tivField} basis-56`}><span>กลุ่ม</span><select value={group} onChange={(e) => setGroup(e.target.value)} className={input}>
          <option value="">ทุกกลุ่ม</option>{groupNames.map((g) => <option key={g} value={g}>{g}</option>)}</select></label>
        <label className={tivField}><span>สกุลเงิน</span><select value={currency} onChange={(e) => setCurrency(e.target.value)} className={input}>
          <option value="">ทุกสกุล</option>{currencies.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
        <label className={tivCheck}><input type="checkbox" checked={withBalance} onChange={(e) => setWithBalance(e.target.checked)} />เฉพาะที่มียอดเหลือ</label>
        <button type="button" className={button} onClick={load}><RefreshCw size={16} aria-hidden />โหลดใหม่</button>
      </div>
      <p className="tiv-hint">จองได้ทีละคนต่อบัญชี และไม่หมดอายุเอง กดคืนเมื่อเลิกใช้ · บอทยังใช้บัญชีที่จองได้ตามปกติ · เมล iTunes จองในหน้า iTune เหมือนเดิม · คงเหลือ (บอทอ่าน) = ยอดล่าสุดที่บอทอ่านได้ (Razer SGD/CAD, WavePay, Netease, Garena Shell, Gamepoint, Plsbuy, Donshop, AgenH2H) · คงเหลือประมาณ = ยอดคงเหลือล่าสุดจากชีต + เติมเข้า − ใช้ไป ที่บันทึกหลังจากนั้น (ไม่รวมยอดที่บอทใช้)</p>
    </section>
    {error && <p role="alert" className="tiv-alert">{error}</p>}
    {data?.botErrors?.length > 0 && <p role="status" className="tiv-banner"><span className="tiv-warn">อ่านยอดบอทไม่สำเร็จ: {data.botErrors.join(", ")} บัญชีเหล่านี้แสดงยอดจากชีตแทน</span></p>}
    {!data && !error && <p role="status" className="tiv-muted">กำลังโหลด…</p>}
    {groups.map(([category, accounts]) => <section key={category} aria-label={category} className="tiv-card">
      <div className="tiv-card-h mb-2"><h2>{category}<small>{accounts.length} บัญชี</small></h2></div>
      <ul>{accounts.map((a) => <AccountRow key={a.id} account={a} canManage={data.canManage} busy={busy} onAction={act} />)}</ul>
    </section>)}
    {data && !groups.length && <div className="tiv-dempty"><strong>ไม่พบบัญชี</strong>ไม่พบบัญชีตามตัวกรอง</div>}
  </TopupInventoryPage>;
}
