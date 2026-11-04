"use client";
import Link from "next/link";
import { useState } from "react";
import ItuneOrderHistory from "@/components/itune-order-history";
import { topupInventoryPath } from "@/lib/topup-inventory";

const inputClass = "min-h-11 min-w-0 rounded-lg border border-ll-hairline bg-ll-surface-1 px-3 text-sm text-ll-ink focus-visible:outline focus-visible:outline-2";

// Order usage history of one iTune mail. Matching staff IDs moved to Topup Inventory → จับคู่พนักงาน.
export default function ItuneOrderAccounts({ lang = "th" }) {
  const [entryId, setEntryId] = useState("");
  const [lookupId, setLookupId] = useState("");
  return <main className="mx-auto max-w-4xl space-y-6 p-5 text-ll-ink">
    <h1 className="text-xl font-semibold">ประวัติการใช้เมลในออเดอร์</h1>
    <p className="text-sm text-ll-ink-subtle">การจับคู่ User ID พนักงาน inblackm ย้ายไปที่{" "}
      <Link className="underline underline-offset-4" href={`${topupInventoryPath(lang)}/staff-links`}>Topup Inventory → จับคู่พนักงาน</Link></p>
    <section className="space-y-3">
      <h2 className="font-semibold">ค้นประวัติตาม ID เมล (รวมเมลที่คืนแล้ว)</h2>
      <form className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); setLookupId(entryId); }}>
        <label className="text-sm">ID เมล <input required type="number" min="1" value={entryId} onChange={(event) => setEntryId(event.target.value)} className={inputClass} /></label>
        <button className={inputClass}>ดูประวัติ</button>
      </form>
      {lookupId && <ItuneOrderHistory key={lookupId} entryId={lookupId} />}
    </section>
  </main>;
}
