"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import ProfitSummaryGrid from "@/components/profit-summary-grid";
import { DupBadge, GroupBadge } from "@/components/profit-badges";
import { fmtMoney, fmtPct, fmtUsd } from "@/lib/profit-format";

export default function ProfitDashboardPage() {
  const [dashboard, setDashboard] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiJson("/api/profit/dashboard", { fallbackError: "โหลดภาพรวมไม่สำเร็จ" })
      .then((data) => setDashboard(data.dashboard))
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return <div className="rounded-lg border border-ll-hairline bg-ll-surface-1 p-6 text-sm text-ll-primary-subtle-text">เกิดข้อผิดพลาด: {error}</div>;
  }
  if (!dashboard) {
    return (
      <p className="flex items-center gap-2 py-10 text-sm text-ll-ink-subtle">
        <Loader2 size={15} className="animate-spin" /> กำลังโหลด...
      </p>
    );
  }

  const { totals, categories } = dashboard;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-ll-ink">ภาพรวม</h1>
        <p className="mt-0.5 text-[13px] text-ll-ink-subtle">ยอดขาย / ต้นทุนที่กรอกเอง และยอดตัดจากบอท (USD)</p>
      </div>

      <ProfitSummaryGrid
        items={[
          { k: "บัตรทั้งหมด", v: totals.cardCount },
          { k: "ยอดขายรวม", v: fmtMoney(totals.saleTotal) },
          { k: "ต้นทุนรวม", v: fmtMoney(totals.costTotal) },
          { k: "กำไรรวม", v: fmtMoney(totals.profitTotal), tone: totals.profitTotal >= 0 ? "pos" : "neg" },
          { k: "%กำไร", v: fmtPct(totals.profitPct) },
          { k: "คงเหลือรวม GoCash (USD)", v: fmtUsd(totals.remainingTotal) },
          { k: "ยอดตัดรวม GoCash (USD)", v: fmtUsd(totals.deductedTotal) },
          { k: "บัตรที่พบยอดซ้ำ", v: totals.duplicateCardCount, tone: totals.duplicateCardCount > 0 ? "neg" : undefined },
        ]}
      />

      <section className="rounded-lg border border-ll-hairline bg-ll-surface-1">
        <div className="flex items-center justify-between border-b border-ll-hairline px-4 py-3">
          <h2 className="text-sm font-semibold text-ll-ink">หมวดหมู่</h2>
          <span className="text-[12px] text-ll-ink-subtle">{categories.length} หมวด</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[13px] text-ll-ink">
            <thead>
              <tr className="border-b border-ll-hairline text-left text-[11px] text-ll-ink-subtle">
                <th className="px-4 py-2 font-medium">หมวดหมู่</th>
                <th className="px-3 py-2 font-medium">แหล่งที่มา</th>
                <th className="px-3 py-2 text-right font-medium">บัตร</th>
                <th className="px-3 py-2 text-right font-medium">ยอดขาย</th>
                <th className="px-3 py-2 text-right font-medium">ต้นทุน</th>
                <th className="px-3 py-2 text-right font-medium">กำไร</th>
                <th className="px-3 py-2 text-right font-medium">%กำไร</th>
                <th className="px-3 py-2 text-right font-medium">ยอดตัด</th>
                <th className="px-3 py-2 text-right font-medium">คงเหลือ</th>
                <th className="px-3 py-2 font-medium">พบซ้ำ</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => {
                const isUsd = c.source === "gocash" || c.source === "gocash-dust";
                return (
                  <tr key={c.id} className="border-b border-ll-hairline last:border-0 hover:bg-ll-surface-2">
                    <td className="px-4 py-2.5">
                      <Link href={`/profit/category/${c.id}`} className="font-medium text-ll-ink hover:underline">
                        {c.name}
                      </Link>
                      {c.excludeFromTotals && (
                        <span
                          title={`${c.name}: ตัวเลขไม่รวมในยอดรวมด้านบน (ข้อมูลซ้ำ/คนละหน่วยกับหมวดอื่น)`}
                          className="ml-1.5 rounded-full bg-ll-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-ll-ink-tertiary"
                        >
                          ไม่รวมยอด
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5"><GroupBadge group={c.group} /></td>
                    <td className="px-3 py-2.5 text-right">{c.cardCount}</td>
                    <td className="px-3 py-2.5 text-right">{fmtMoney(c.saleTotal)}</td>
                    <td className="px-3 py-2.5 text-right">{fmtMoney(c.costTotal)}</td>
                    <td className={`px-3 py-2.5 text-right ${c.profitTotal >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {fmtMoney(c.profitTotal)}
                    </td>
                    <td className="px-3 py-2.5 text-right">{fmtPct(c.profitPct)}</td>
                    <td className="px-3 py-2.5 text-right">{isUsd ? fmtUsd(c.deductedTotal) : fmtMoney(c.deductedTotal)}</td>
                    <td className="px-3 py-2.5 text-right">{isUsd ? fmtUsd(c.remainingTotal) : "-"}</td>
                    <td className="px-3 py-2.5"><DupBadge n={c.duplicateCardCount} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
