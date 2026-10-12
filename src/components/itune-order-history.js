"use client";
import { useEffect, useState } from "react";
const labels = { planned: "เตรียมใช้", completed: "ใช้จริงแล้ว", cancelled: "ยกเลิก" };
export default function ItuneOrderHistory({ entryId }) {
  const [history, setHistory] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/projectm/itune/${encodeURIComponent(entryId)}/order-history`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "โหลดประวัติไม่สำเร็จ"); return data; })
      .then((data) => setHistory(data.history))
      .catch((err) => { if (err.name !== "AbortError") setError(err.message); });
    return () => controller.abort();
  }, [entryId]);
  return <section className="min-w-0 space-y-2 text-sm text-ll-ink">
    <h3 className="font-semibold">ประวัติ Order ที่ใช้เมลนี้ (ล่าสุด 100 รายการ)</h3>
    {error && <p role="alert">{error}</p>}
    {!history && !error && <p role="status">กำลังโหลด…</p>}
    {history?.length === 0 && <p className="text-ll-ink-subtle">ยังไม่มีประวัติ</p>}
    <ul className="space-y-2">{history?.map((row) => <li key={row.id} className="break-words rounded-lg border border-ll-hairline p-3">
      <a className="underline" href={`https://inblackm.com/admin/orders?q=${encodeURIComponent(row.orderId)}`} target="_blank" rel="noopener noreferrer">Order {row.orderId}</a>
      {row.lineId && ` · งานย่อย ${row.lineId}`} · {labels[row.status]}
      <p>{row.gameName} · {row.packageLabel} · {row.usedAmount ?? "—"} {row.currency}</p>
      <p className="text-xs text-ll-ink-subtle">{new Date(row.finishedAt || row.createdAt).toLocaleString("th-TH")} · รอบจอง {row.claimSessionId} · พนักงาน #{row.userId}</p>
      {row.cancelledByUserId && <p className="text-xs text-ll-ink-subtle">ยกเลิกโดยพนักงาน #{row.cancelledByUserId}</p>}
    </li>)}</ul>
  </section>;
}
