"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { topupInventoryPath } from "@/lib/topup-inventory";

// inblackm staff ID <-> tools user. Used by the order pages (iTune mails and reserved channels).
const inputClass = "min-h-11 min-w-0 rounded-lg border border-ll-hairline bg-ll-surface-1 px-3 text-sm text-ll-ink focus-visible:outline focus-visible:outline-2";
const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-ll-hairline-strong bg-ll-surface-1 px-4 text-sm text-ll-ink hover:bg-ll-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ll-primary disabled:opacity-50";
const endpoint = "/api/projectm/itune/order-accounts";

async function readAccounts(signal) {
  const response = await fetch(endpoint, { cache: "no-store", signal });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "โหลดบัญชีไม่สำเร็จ");
  return data.accounts;
}

export default function StaffLinks({ lang }) {
  const [accounts, setAccounts] = useState([]);
  const [externalUserId, setExternalUserId] = useState("");
  const [username, setUsername] = useState("");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    readAccounts(controller.signal).then(setAccounts).catch((err) => { if (err.name !== "AbortError") setMessage(err.message); });
    return () => controller.abort();
  }, []);
  async function save(body) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(endpoint, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "บันทึกไม่สำเร็จ");
      setAccounts(await readAccounts()); setMessage("บันทึกแล้ว");
      if (!body.remove) { setExternalUserId(""); setUsername(""); }
    } catch (err) { setMessage(err.message); } finally { setBusy(false); }
  }
  const term = query.trim().toLowerCase();
  const shown = accounts.filter((a) => !term || `${a.externalUserId} ${a.username}`.toLowerCase().includes(term));
  return <main className="mx-auto max-w-4xl space-y-6 px-4 pb-14 pt-10 text-ll-ink sm:px-6">
    <header className="flex flex-wrap items-center justify-between gap-4 pr-12">
      <div><p className="text-xs text-ll-ink-tertiary">TOPUP INVENTORY</p><h1 className="mt-2 text-3xl font-semibold">จับคู่พนักงาน</h1>
        <p className="mt-2 text-sm text-ll-ink-subtle">จับคู่ User ID พนักงานของ inblackm กับชื่อผู้ใช้ใน tools ใช้กับหน้าออเดอร์ inblackm ทั้งการเลือกเมล iTune และการบันทึกยอดจากช่องทางที่จองไว้ ไม่ใช้ชื่อแสดงผล และไม่จับคู่จาก ID ที่บังเอิญตรงกัน (เฉพาะ Super Admin)</p>
        <p className="mt-1 text-sm text-ll-ink-subtle">จับคู่ได้ทุกบัญชีใน tools · การเลือกเมล iTune ในหน้าออเดอร์ยังต้องมีสิทธิ์ Topup · ใส่ User ID เดิมกับชื่อผู้ใช้ใหม่ = เปลี่ยนคนที่จับคู่</p></div>
      <Link href={topupInventoryPath(lang)} className={button}><ArrowLeft size={16} aria-hidden />กลับ Topup Inventory</Link>
    </header>
    <p role="status" className="text-sm">{message}</p>
    <form className="flex flex-col gap-3 sm:flex-row" onSubmit={(event) => { event.preventDefault(); if (window.confirm("ยืนยันจับคู่บัญชีทั้งสองระบบ? ตรวจ User ID ให้ตรงกับพนักงาน")) save({ externalUserId, username }); }}>
      <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">User ID พนักงานจาก inblackm<input required value={externalUserId} maxLength={128} onChange={(event) => setExternalUserId(event.target.value)} className={inputClass} /></label>
      <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">ชื่อผู้ใช้ใน tools<input required value={username} maxLength={128} onChange={(event) => setUsername(event.target.value)} className={inputClass} /></label>
      <button disabled={busy} className={`${inputClass} self-end disabled:opacity-50`}>บันทึกการจับคู่</button>
    </form>
    <label className="block max-w-sm text-sm">ค้นหา User ID / ชื่อผู้ใช้<input value={query} onChange={(event) => setQuery(event.target.value)} className={`${inputClass} mt-1 w-full`} /></label>
    <p className="text-xs text-ll-ink-subtle">จับคู่แล้ว {accounts.length} คน</p>
    <ul className="space-y-2">{shown.map((account) => <li key={account.externalUserId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ll-hairline p-3">
      <span className="break-all text-sm">{account.externalUserId} → {account.username} (#{account.userId})</span>
      <button type="button" disabled={busy} className={inputClass} onClick={() => {
        if (window.confirm(`ยกเลิกการจับคู่ ${account.externalUserId}? ประวัติเดิมยังอยู่`)) save({ externalUserId: account.externalUserId, remove: true });
      }}>ยกเลิกการจับคู่</button>
    </li>)}</ul>
  </main>;
}
