"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Loader2 } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { fmtDate, fmtMoney, fmtPct, fmtUsd, netSaleDisplay } from "@/lib/profit-format";
import { commitOverrideEdit } from "@/lib/profit-conflict";
import { useProfitCanEdit } from "@/components/profit-capabilities-context";
import PlatformSelect, { platformLabel } from "@/components/profit-platform-select";

function matchesQuery(q, parts) {
  if (!q) return true;
  const hay = parts.filter((p) => p != null && p !== "").join(" ").toLowerCase();
  return hay.includes(q);
}

function toLocalInput(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ProfitCodaresellerHistoryPage() {
  const router = useRouter();
  const canEdit = useProfitCanEdit();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [gameFilter, setGameFilter] = useState("");
  const [platformFilter, setPlatformFilter] = useState("");
  const [sortDir, setSortDir] = useState("desc");
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  const [platforms, setPlatforms] = useState([]);

  const load = useCallback(() => {
    apiJson("/api/profit/codareseller/history", { fallbackError: "โหลดประวัติ Codareseller ไม่สำเร็จ" })
      .then((res) => setRows(res.history || []))
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    apiJson("/api/profit/sale-prices/summary", { fallbackError: "โหลดรายชื่อแพลตฟอร์มไม่สำเร็จ" })
      .then((res) => setPlatforms((res.platforms || []).map((p) => p.platform)))
      .catch(() => {});
  }, []);

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
    setFrom("");
    setTo("");
    setGameFilter("");
    setPlatformFilter("");
    setPage(1);
  };

  const filtered = useMemo(() => {
    if (!rows) return [];
    const query = q.trim().toLowerCase();
    const fromTs = from ? new Date(from).getTime() : null;
    const toTs = to ? new Date(to).getTime() : null;
    let list = rows.filter((o) => {
      const t = new Date(o.createdAt).getTime();
      if (fromTs && t < fromTs) return false;
      if (toTs && t > toTs) return false;
      if (gameFilter === "__none__" ? o.gameName : gameFilter && o.gameName !== gameFilter) return false;
      if (platformFilter === "__none__" ? o.platform : platformFilter && o.platform !== platformFilter) return false;
      if (!matchesQuery(query, [o.txid, o.saleOrderId, o.packName, o.gameName, o.cardName, o.invoiceNumber, o.skuIds])) return false;
      return true;
    });
    list.sort((a, b) => {
      const d = new Date(a.createdAt) - new Date(b.createdAt);
      return sortDir === "asc" ? d : -d;
    });
    return list;
  }, [rows, q, from, to, gameFilter, platformFilter, sortDir]);

  const games = useMemo(() => {
    const set = new Set();
    for (const o of rows || []) if (o.gameName) set.add(o.gameName);
    return [...set].sort();
  }, [rows]);

  const filterPlatforms = useMemo(() => {
    const set = new Set(platforms);
    for (const o of rows || []) if (o.platform) set.add(o.platform);
    return [...set].sort();
  }, [rows, platforms]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const pageRows = filtered.slice(start, start + pageSize);

  const OVERRIDE_BASELINE_FIELD = { platform: "overridePlatform", saleAmount: "overrideSaleAmount", cost: "overrideCost" };

  const editOrder = (o, field, value) => {
    return commitOverrideEdit({
      save: (includeExpected) => apiJson(`/api/profit/codareseller/orders/${o.orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          [field]: value,
          ...(includeExpected ? { expected: { [field]: o[OVERRIDE_BASELINE_FIELD[field]] } } : {}),
        }),
        fallbackError: "แก้ไขยอดไม่สำเร็จ",
      }),
      reload: load,
    });
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
        <Link href="/profit/category/codareseller" className="hover:underline">Codareseller</Link>
        <ChevronRight size={12} />
        <span className="text-ll-ink">ประวัติทั้งหมด</span>
      </nav>

      <div>
        <h1 className="text-xl font-semibold text-ll-ink">ประวัติ Codareseller</h1>
        <p className="mt-0.5 text-[13px] text-ll-ink-subtle">
          ออเดอร์ที่สำเร็จจาก Codashop Reseller API ดึงตรงจาก codashop_orders (payment_method = &apos;CodashopUSD&apos;) ·
          ไม่ใช่บอท Sky Codashop · จัดกลุ่มตามเกมในหน้าหมวด · ก่อนตัด/ยอดตัด/คงเหลือ (USD) จาก inventory_transactions
          (ตัวเลขเดียวกับ Telegram Old/New Balance ของ CodaTopupWorker) ·
          ยอดขาย/ต้นทุน (บาท) คำนวณแบบเดียวกับ Donshop/Gamepoint (ต่อแพ็ก/ต่อแพลตฟอร์ม แก้ไขได้ทีละออเดอร์)
        </p>
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
          เกม
          <select value={gameFilter} onChange={(e) => { setGameFilter(e.target.value); setPage(1); }} className={inputClass}>
            <option value="">ทั้งหมด</option>
            <option value="__none__">ไม่ระบุเกม</option>
            {games.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-ll-ink-subtle">
          แพลตฟอร์ม
          <select value={platformFilter} onChange={(e) => { setPlatformFilter(e.target.value); setPage(1); }} className={inputClass}>
            <option value="">ทั้งหมด</option>
            <option value="__none__">ยังไม่ได้แท็ก</option>
            {filterPlatforms.map((p) => <option key={p} value={p}>{platformLabel(p)}</option>)}
          </select>
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
          <table className="w-full min-w-[1200px] text-[13px] text-ll-ink">
            <thead>
              <tr className="border-b border-ll-hairline text-left text-[11px] text-ll-ink-subtle">
                <th className="px-4 py-2 font-medium">QUEUE #</th>
                <th className="px-3 py-2 font-medium">ORDER ID</th>
                <th className="px-3 py-2 font-medium">เกม</th>
                <th className="px-3 py-2 font-medium">แพ็ก</th>
                <th className="px-3 py-2 font-medium">แพลตฟอร์ม</th>
                <th className="px-3 py-2 font-medium">Invoice</th>
                <th className="px-3 py-2 font-medium">เวลา</th>
                <th className="px-3 py-2 text-right font-medium">ก่อนตัด (USD)</th>
                <th className="px-3 py-2 text-right font-medium">ยอดตัด (USD)</th>
                <th className="px-3 py-2 text-right font-medium">คงเหลือ (USD)</th>
                <th className="px-3 py-2 text-right font-medium">ราคาขาย</th>
                <th className="px-3 py-2 text-right font-medium">ต้นทุน</th>
                <th className="px-3 py-2 text-right font-medium">กำไร</th>
                <th className="px-3 py-2 text-right font-medium">กำไร %</th>
                <th className="px-3 py-2 font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length ? (
                pageRows.map((o) => (
                  <tr key={o.id} className="border-b border-ll-hairline last:border-0">
                    <td className="px-4 py-2.5 font-medium text-ll-ink">{o.txid}</td>
                    <td className="px-3 py-2.5 text-ll-ink">{o.saleOrderId || "-"}</td>
                    <td className="px-3 py-2.5 text-ll-ink-subtle">
                      {o.cardId && o.gameName ? (
                        <button
                          type="button"
                          onClick={() => router.push(`/profit/category/codareseller/card/${encodeURIComponent(o.cardId)}`)}
                          className="hover:text-ll-ink hover:underline"
                          title="เปิดรายละเอียดเกมนี้"
                        >
                          {o.gameName}
                        </button>
                      ) : (
                        o.gameName || "-"
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-ll-ink">{o.packName || "-"}</td>
                    <td className="px-3 py-2.5">
                      <PlatformSelect
                        value={o.platform}
                        fromDb={o.platformFromDb}
                        platforms={platforms}
                        disabled={!canEdit}
                        onCommit={(v) => editOrder(o, "platform", v)}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-ll-ink-subtle" title="Codashop orderId จาก provider_response">
                      <div>{o.invoiceNumber || "-"}</div>
                      {o.skuIds && <div className="text-[11px] text-ll-ink-tertiary">{o.skuIds}</div>}
                    </td>
                    <td className="px-3 py-2.5 text-ll-ink-subtle">{fmtDate(o.createdAt)}</td>
                    <td className="px-3 py-2.5 text-right text-ll-ink-subtle" title="Old Balance จาก inventory (= Telegram)">
                      {o.oldBalanceUsd != null ? fmtUsd(o.oldBalanceUsd) : "-"}
                    </td>
                    <td className="px-3 py-2.5 text-right text-ll-ink-subtle" title={o.packPriceRaw ? `amount_used / pack_price = ${o.packPriceRaw}` : "ยอดตัด USD"}>
                      {o.deductedUsd != null ? fmtUsd(o.deductedUsd) : "-"}
                    </td>
                    <td className="px-3 py-2.5 text-right text-ll-ink-subtle" title="New Balance จาก inventory (= Telegram)">
                      {o.newBalanceUsd != null ? fmtUsd(o.newBalanceUsd) : "-"}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <HistoryCostInput
                        value={netSaleDisplay(o)}
                        disabled={!canEdit}
                        title={
                          o.platformFeePct > 0
                            ? `หักค่าธรรมเนียม ${o.platformFeePct}% ของ ${platformLabel(o.platform)} จากราคาเต็ม ${fmtMoney(o.saleAmount || 0)} แล้ว — แก้ตรงนี้ให้กรอกราคาเต็มใหม่ ระบบจะหักให้อัตโนมัติ`
                            : o.saleAmountUsdt != null
                              ? `แสดง ${o.saleAmountUsdt} USDT ตามที่กรอก · กำไรคูณ USD:THB อัตโนมัติ (= ${fmtMoney(o.saleAmount)}) — แก้ตรงนี้กรอก USDT`
                            : o.saleFromPlatform
                              ? "ค่านี้ดึงจากราคาขายตามแพ็กของแพลตฟอร์มนี้ — แก้ตรงนี้จะ override เฉพาะออเดอร์นี้"
                              : o.saleMissingPlatformPrice
                                ? `ยังไม่มีราคาอ้างอิงของ ${platformLabel(o.platform)} สำหรับแพ็กนี้ — ตั้งได้ที่หน้า "ตั้งราคาขายตามแพ็ก"`
                                : undefined
                        }
                        onCommit={(v) => editOrder(o, "saleAmount", v)}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <HistoryCostInput
                        value={o.cost || 0}
                        disabled={!canEdit}
                        title={
                          o.costFromPack
                            ? "ค่านี้มาจากต้นทุนเริ่มต้นของแพ็ก — แก้ตรงนี้จะ override เฉพาะออเดอร์นี้"
                            : o.costMissing
                              ? 'ยังไม่มีต้นทุนของแพ็กนี้เลย — ตั้งได้ที่หน้า "ตั้งค่าต้นทุนตามแพ็ก" หรือกรอกตรงนี้เฉพาะออเดอร์นี้'
                              : undefined
                        }
                        onCommit={(v) => editOrder(o, "cost", v)}
                      />
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right ${(o.profit || 0) >= 0 ? "text-emerald-600" : "text-red-600"}`}
                      title={o.platformFeePct > 0 ? `หักค่าธรรมเนียม ${o.platformFeePct}% ของ ${platformLabel(o.platform)} จากราคาขายก่อนคิดกำไรแล้ว` : undefined}
                    >
                      {fmtMoney(o.profit)}
                    </td>
                    <td className="px-3 py-2.5 text-right">{fmtPct(o.profitPct)}</td>
                    <td className="px-3 py-2.5">
                      {o.isDuplicate ? (
                        <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600">ตัดซ้ำ</span>
                      ) : (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-600">Done</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={15} className="px-4 py-8 text-center text-ll-ink-subtle">ไม่พบรายการตามตัวกรอง</td></tr>
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
