"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BarChart3, Loader2, RefreshCw, ShoppingCart, Wallet } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import ProfitSummaryGrid from "@/components/profit-summary-grid";
import ProfitCategoriesOverview from "@/components/profit-categories-overview";
import ProfitRazerOverview from "@/components/profit-razer-overview";
import { DupBadge, GroupBadge } from "@/components/profit-badges";
import { fmtMoney, fmtPct, fmtUsd } from "@/lib/profit-format";

function DashboardStatCard({ icon: Icon, label, value, tone }) {
  const valueClass =
    tone === "pos" ? "text-emerald-600" : tone === "neg" ? "text-red-600" : "text-ll-ink";
  return (
    <div className="rounded-xl border border-ll-hairline bg-ll-surface-1 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-ll-ink-tertiary">{label}</p>
          <p className={`mt-2 text-2xl font-semibold tracking-[-0.03em] ${valueClass}`}>{value}</p>
        </div>
        {Icon && (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ll-primary-subtle-bg text-ll-primary">
            <Icon size={18} />
          </span>
        )}
      </div>
    </div>
  );
}

export default function ProfitDashboardPage() {
  const [dashboard, setDashboard] = useState(null);
  const [razerOverview, setRazerOverview] = useState(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const [razerError, setRazerError] = useState("");

  const loadAll = useCallback(async () => {
    setRefreshing(true);
    setError("");
    setRazerError("");
    try {
      const [dashResult, razerResult] = await Promise.allSettled([
        apiJson("/api/profit/dashboard", { fallbackError: "โหลดภาพรวมไม่สำเร็จ" }),
        apiJson("/api/profit/razer/overview", { fallbackError: "โหลด Razer Stock ไม่สำเร็จ" }),
      ]);

      if (dashResult.status === "fulfilled") {
        setDashboard(dashResult.value.dashboard);
      } else {
        setError(dashResult.reason?.message || "โหลดภาพรวมไม่สำเร็จ");
        setDashboard(null);
      }

      if (razerResult.status === "fulfilled") {
        setRazerOverview(razerResult.value.overview);
      } else {
        setRazerError(razerResult.reason?.message || "โหลด Razer Stock ไม่สำเร็จ");
        setRazerOverview(null);
      }
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  if (error && !dashboard) {
    return <div className="rounded-lg border border-ll-hairline bg-ll-surface-1 p-6 text-sm text-ll-primary-subtle-text">เกิดข้อผิดพลาด: {error}</div>;
  }
  if (!dashboard) {
    return (
      <p className="flex items-center gap-2 py-10 text-sm text-ll-ink-subtle">
        <Loader2 size={15} className="animate-spin" /> กำลังโหลด...
      </p>
    );
  }

  const { totals, bot, api, categories } = dashboard;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ll-ink-tertiary">SaaS Portal / Analytics Dashboard</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-ll-ink">System Overview</h1>
          <p className="mt-1 text-[13px] text-ll-ink-subtle">ยอดขาย / ต้นทุน / กำไร และสต็อกทุกช่องทาง</p>
        </div>
        <button
          type="button"
          onClick={loadAll}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 rounded-lg border border-ll-hairline bg-ll-surface-1 px-3 py-2 text-[12px] font-medium text-ll-ink hover:bg-ll-surface-2 disabled:opacity-60"
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} /> Refresh Data
        </button>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DashboardStatCard icon={Wallet} label="ยอดขายรวม" value={fmtMoney(totals.saleTotal)} />
        <DashboardStatCard icon={ShoppingCart} label="บัตรทั้งหมด" value={totals.cardCount} />
        <DashboardStatCard
          icon={BarChart3}
          label="กำไรรวม"
          value={fmtMoney(totals.profitTotal)}
          tone={totals.profitTotal >= 0 ? "pos" : "neg"}
        />
        <DashboardStatCard icon={Wallet} label="% กำไร" value={fmtPct(totals.profitPct)} />
      </section>

      <ProfitSummaryGrid
        items={[
          { k: "ต้นทุนรวม", v: fmtMoney(totals.costTotal) },
          { k: "Bot — บัตร/เกม", v: bot?.cardCount ?? 0 },
          { k: "API — เกม", v: api?.cardCount ?? 0 },
          { k: "บัตรที่พบยอดซ้ำ", v: totals.duplicateCardCount, tone: totals.duplicateCardCount > 0 ? "neg" : undefined },
        ]}
      />

      <ProfitCategoriesOverview categories={categories} bot={bot} api={api} />

      <ProfitRazerOverview overview={razerOverview} onRefresh={loadAll} refreshing={refreshing} />
      {razerError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] text-amber-900">
          โหลด Razer Stock ไม่สำเร็จ: {razerError}
        </div>
      )}

      <section className="rounded-xl border border-ll-hairline bg-ll-surface-1 shadow-sm">
        <div className="flex items-center justify-between border-b border-ll-hairline px-4 py-3">
          <h2 className="text-sm font-semibold text-ll-ink">หมวดหมู่ Profit</h2>
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
