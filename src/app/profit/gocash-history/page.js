"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Loader2 } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { fmtDate, fmtMoney, fmtPct, fmtUsd } from "@/lib/profit-format";
import { useProfitCanEdit } from "@/components/profit-capabilities-context";

function matchesQuery(q, parts) {
  if (!q) return true;
  const hay = parts.filter((p) => p != null && p !== "").join(" ").toLowerCase();
  return hay.includes(q);
}

function toLocalInput(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ProfitGocashHistoryPage() {
  const router = useRouter();
  const canEdit = useProfitCanEdit();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [orderId, setOrderId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sortDir, setSortDir] = useState("desc");
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);

  const load = useCallback(() => {
    apiJson("/api/profit/gocash/history", { fallbackError: "โหลดประวัติ GoCash ไม่สำเร็จ" })
      .then((res) => setRows(res.history || []))
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const applyPreset = (days) => {
    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setHours(0, 0, 0, 0);
    if (days > 1) fromDate.setDate(fromDate.getDate() - (days - 1));
    setFrom(toLocalInput(fromDate));
    setTo(toLocalInput(toDate));
    setPage(1);
  };

  const clearFilters = () => {
    setQ("");
    setOrderId("");
    setFrom("");
    setTo("");
    setPage(1);
  };

  const filtered = useMemo(() => {
    if (!rows) return [];
    const query = q.trim().toLowerCase();
    const oid = orderId.trim().toLowerCase();
    const fromTs = from ? new Date(from).getTime() : null;
    const toTs = to ? new Date(to).getTime() : null;
    let list = rows.filter((h) => {
      const t = new Date(h.createdAt).getTime();
      if (fromTs && t < fromTs) return false;
      if (toTs && t > toTs) return false;
      if (oid && !String(h.orderId || "").toLowerCase().includes(oid) && !String(h.txid || "").toLowerCase().includes(oid)) return false;
      if (!matchesQuery(query, [h.txid, h.orderId, h.packName, h.cardName, h.cardSerial, h.slotIndex])) return false;
      return true;
    });
    list.sort((a, b) => {
      const d = new Date(a.createdAt) - new Date(b.createdAt);
      return sortDir === "asc" ? d : -d;
    });
    return list;
  }, [rows, q, orderId, from, to, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const pageRows = filtered.slice(start, start + pageSize);

  const editCost = async (historyId, value) => {
    try {
      await apiJson(`/api/profit/gocash/history/${historyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cost: Number(value) || 0 }),
        fallbackError: "แก้ไขต้นทุนไม่สำเร็จ",
      });
      load();
    } catch (err) {
      window.alert(err.message);
    }
  };

  if (error) {
    return <div className="rounded-lg border border-ll-hairline bg-ll-surface-1 p-6 text-sm text-ll-primary-subtle-text">เกิดข้อผิดพลาด: {error}</div>;
  }
  if (!rows) {
    return (
      <p className="flex items-center gap-2 py-10 text-sm text-ll-ink-subtle">
        <Loader2 size={15} className="animate-spin" /> กำลังโหลด...
      </p>
    );
  }

  const inputClass = "h-9 rounded-md border border-ll-hairline-strong bg-ll-surface-2 px-2.5 text-[13px] text-ll-ink outline-none focus:border-ll-primary focus:bg-ll-surface-1";

  return (
    <div className="flex flex-col gap-5">
      <nav className="flex items-center gap-1.5 text-[12px] text-ll-ink-subtle">
        <Link href="/profit" className="hover:underline">ภาพรวม</Link>
        <ChevronRight size={12} />
        <Link href="/profit/category/gocash" className="hover:underline">GoCash</Link>
        <ChevronRight size={12} />
        <span className="text-ll-ink">ประวัติทั้งหมด</span>
      </nav>

      <div>
        <h1 className="text-xl font-semibold text-ll-ink">ประวัติ GoCash</h1>
        <p className="mt-0.5 text-[13px] text-ll-ink-subtle">ตัดจากบัตรทีละรายการ · ยอดตัดต่อรายการเป็น USD · บัตรใบละ $100</p>
      </div>

      <section className="flex flex-wrap items-end gap-2.5 rounded-lg border border-ll-hairline bg-ll-surface-1 p-4">
        <label className="flex flex-col gap-1 text-[11px] text-ll-ink-subtle">
          ตั้งแต่
          <input type="datetime-local" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-ll-ink-subtle">
          ถึง
          <input type="datetime-local" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-ll-ink-subtle">
          ค้นหา
          <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="ค้นหา..." className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-ll-ink-subtle">
          Order ID
          <input type="search" value={orderId} onChange={(e) => { setOrderId(e.target.value); setPage(1); }} placeholder="เช่น 181210" className={inputClass} />
        </label>
        <button type="button" onClick={clearFilters} className="h-9 rounded-md border border-ll-hairline-strong px-3 text-[12px] font-medium text-ll-ink hover:bg-ll-surface-2">ล้างตัวกรอง</button>
        <button type="button" onClick={() => applyPreset(1)} className="h-9 rounded-md border border-ll-hairline-strong px-3 text-[12px] font-medium text-ll-ink hover:bg-ll-surface-2">วันนี้</button>
        <button type="button" onClick={() => applyPreset(7)} className="h-9 rounded-md border border-ll-hairline-strong px-3 text-[12px] font-medium text-ll-ink hover:bg-ll-surface-2">7 วัน</button>
        <button type="button" onClick={() => applyPreset(30)} className="h-9 rounded-md border border-ll-hairline-strong px-3 text-[12px] font-medium text-ll-ink hover:bg-ll-surface-2">30 วัน</button>
        <label className="ml-auto flex flex-col gap-1 text-[11px] text-ll-ink-subtle">
          เรียง
          <select value={sortDir} onChange={(e) => setSortDir(e.target.value)} className={inputClass}>
            <option value="desc">ใหม่สุดก่อน</option>
            <option value="asc">เก่าสุดก่อน</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-ll-ink-subtle">
          แถว
          <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} className={inputClass}>
            {[20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </section>

      <section className="rounded-lg border border-ll-hairline bg-ll-surface-1">
        <div className="flex items-center justify-between border-b border-ll-hairline px-4 py-3">
          <h2 className="text-sm font-semibold text-ll-ink">รายการ</h2>
          <span className="text-[12px] text-ll-ink-subtle">{filtered.length} รายการ · หน้า {safePage}/{totalPages}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-[13px] text-ll-ink">
            <thead>
              <tr className="border-b border-ll-hairline text-left text-[11px] text-ll-ink-subtle">
                <th className="px-4 py-2 font-medium">QUEUE #</th>
                <th className="px-3 py-2 font-medium">สินค้า</th>
                <th className="px-3 py-2 font-medium">บัตร</th>
                <th className="px-3 py-2 font-medium">เวลา</th>
                <th className="px-3 py-2 text-right font-medium">ก่อนตัด</th>
                <th className="px-3 py-2 text-right font-medium">คงเหลือ</th>
                <th className="px-3 py-2 text-right font-medium">ยอดตัด</th>
                <th className="px-3 py-2 text-right font-medium">ต้นทุน</th>
                <th className="px-3 py-2 text-right font-medium">กำไร (THB)</th>
                <th className="px-3 py-2 text-right font-medium">กำไร %</th>
                <th className="px-3 py-2 font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length ? (
                pageRows.map((h) => (
                  <tr
                    key={h.id}
                    onClick={() => h.cardId && router.push(`/profit/category/gocash/card/${encodeURIComponent(h.cardId)}`)}
                    className={`border-b border-ll-hairline last:border-0 ${h.cardId ? "cursor-pointer hover:bg-ll-surface-2" : ""}`}
                  >
                    <td className="px-4 py-2.5">
                      <div className="text-ll-ink">{h.txid}</div>
                      <div className="text-[11px] text-ll-ink-tertiary">slot {h.slotIndex == null ? "-" : h.slotIndex}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-ll-ink">{h.packName || "-"}</div>
                      <div className="text-[11px] text-ll-ink-tertiary">via GoCash USD</div>
                    </td>
                    <td className="px-3 py-2.5 text-ll-ink-subtle">{h.cardName || "-"}</td>
                    <td className="px-3 py-2.5 text-ll-ink-subtle">{fmtDate(h.createdAt)}</td>
                    <td className="px-3 py-2.5 text-right">{fmtUsd(h.oldBalance)}</td>
                    <td className="px-3 py-2.5 text-right">{fmtUsd(h.newBalance)}</td>
                    <td className="px-3 py-2.5 text-right">{fmtUsd(h.deducted)}</td>
                    <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                      <HistoryCostInput value={h.cost || 0} disabled={!canEdit} title={h.costFromPack ? "ค่านี้มาจากต้นทุนเริ่มต้นของแพ็ก — แก้ตรงนี้จะ override เฉพาะออเดอร์นี้" : undefined} onCommit={(v) => editCost(h.historyId, v)} />
                    </td>
                    <td className={`px-3 py-2.5 text-right ${(h.profit || 0) >= 0 ? "text-emerald-600" : "text-red-600"}`}>{fmtMoney(h.profit)}</td>
                    <td className="px-3 py-2.5 text-right">{fmtPct(h.profitPct)}</td>
                    <td className="px-3 py-2.5">
                      {h.isDuplicate ? (
                        <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600">ตัดซ้ำ</span>
                      ) : (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-600">Done</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={11} className="px-4 py-8 text-center text-ll-ink-subtle">ไม่พบรายการตามตัวกรอง</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-ll-hairline px-4 py-3 text-[12px] text-ll-ink-subtle">
          <button type="button" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded-md border border-ll-hairline-strong px-3 py-1.5 font-medium text-ll-ink hover:bg-ll-surface-2 disabled:opacity-50">ก่อนหน้า</button>
          <span>{filtered.length ? start + 1 : 0}–{Math.min(start + pageSize, filtered.length)} จาก {filtered.length}</span>
          <button type="button" disabled={safePage >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-md border border-ll-hairline-strong px-3 py-1.5 font-medium text-ll-ink hover:bg-ll-surface-2 disabled:opacity-50">ถัดไป</button>
        </div>
      </section>
    </div>
  );
}

function HistoryCostInput({ value, disabled, title, onCommit }) {
  const [local, setLocal] = useState(String(value));
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing the input's draft value when the server-loaded value changes underneath it
    setLocal(String(value));
  }, [value]);
  return (
    <input
      type="number"
      step="0.01"
      title={title}
      disabled={disabled}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        if (Number(local) !== Number(value)) onCommit(local);
      }}
      className="h-8 w-24 rounded-md border border-ll-hairline-strong bg-ll-surface-2 px-2 text-right text-[12px] text-ll-ink outline-none focus:border-ll-primary focus:bg-ll-surface-1 disabled:opacity-60"
    />
  );
}
