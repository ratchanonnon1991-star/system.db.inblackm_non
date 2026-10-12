"use client";
import { useEffect, useState } from "react";
import ItuneOrderHistory from "@/components/itune-order-history";

const inputClass = "min-h-11 min-w-0 rounded-lg border border-ll-hairline bg-ll-surface-1 px-3 text-sm text-ll-ink focus-visible:outline focus-visible:outline-2";
async function readAccounts(signal) {
  const response = await fetch("/api/projectm/itune/order-accounts", { cache: "no-store", signal });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "โหลดบัญชีไม่สำเร็จ");
  return data.accounts;
}
export default function ItuneOrderAccounts() {
  const [accounts, setAccounts] = useState([]);
  const [externalUserId, setExternalUserId] = useState("");
  const [username, setUsername] = useState("");
  const [entryId, setEntryId] = useState("");
  const [lookupId, setLookupId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    setAccounts(await readAccounts());
  }
  useEffect(() => {
    const controller = new AbortController();
    readAccounts(controller.signal).then(setAccounts).catch((err) => { if (err.name !== "AbortError") setMessage(err.message); });
    return () => controller.abort();
  }, []);
  async function save(body) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/projectm/itune/order-accounts", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "บันทึกไม่สำเร็จ");
      await load(); setMessage("บันทึกแล้ว");
    } catch (err) { setMessage(err.message); } finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-4xl space-y-6 p-5 text-ll-ink">
    <h1 className="text-xl font-semibold">เชื่อมบัญชี Orders ↔ iTune</h1>
    <p className="text-sm text-ll-ink-subtle">เฉพาะ Super Admin: ใช้ User ID พนักงานจากระบบ inblackm จับคู่กับชื่อผู้ใช้ iTune ที่มีสิทธิ์ Topup ไม่ใช้ชื่อแสดงผล และไม่จับคู่จาก ID ที่บังเอิญตรงกัน</p>
    <p role="status" className="text-sm">{message}</p>
    <form className="flex flex-col gap-3 sm:flex-row" onSubmit={(event) => { event.preventDefault(); if (window.confirm("ยืนยันจับคู่บัญชีทั้งสองระบบ? ตรวจ User ID ให้ตรงกับพนักงาน")) save({ externalUserId, username }); }}>
      <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">User ID จาก inblackm<input required value={externalUserId} maxLength={128} onChange={(event) => setExternalUserId(event.target.value)} className={inputClass} /></label>
      <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">ชื่อผู้ใช้ iTune<input required value={username} maxLength={128} onChange={(event) => setUsername(event.target.value)} className={inputClass} /></label>
      <button disabled={busy} className={`${inputClass} self-end disabled:opacity-50`}>บันทึกการจับคู่</button>
    </form>
    <ul className="space-y-2">{accounts.map((account) => <li key={account.externalUserId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ll-hairline p-3">
      <span className="break-all text-sm">{account.externalUserId} → {account.username} (#{account.userId})</span>
      <button type="button" disabled={busy} className={inputClass} onClick={() => {
        if (window.confirm(`ยกเลิกการจับคู่ ${account.externalUserId}? ประวัติเดิมยังอยู่`)) save({ externalUserId: account.externalUserId, remove: true });
      }}>ยกเลิกการจับคู่</button>
    </li>)}</ul>
    <section className="space-y-3 border-t border-ll-hairline pt-5">
      <h2 className="font-semibold">ค้นประวัติตาม ID เมล (รวมเมลที่คืนแล้ว)</h2>
      <form className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); setLookupId(entryId); }}>
        <label className="text-sm">ID เมล <input required type="number" min="1" value={entryId} onChange={(event) => setEntryId(event.target.value)} className={inputClass} /></label>
        <button className={inputClass}>ดูประวัติ</button>
      </form>
      {lookupId && <ItuneOrderHistory key={lookupId} entryId={lookupId} />}
    </section>
  </main>;
}
