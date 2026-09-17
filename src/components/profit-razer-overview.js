"use client";

import Link from "next/link";
import { Coins, Globe, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { RAZER_ZONE_LABELS, RAZER_STATUS_LABELS } from "@/components/profit-razer-badges";
import { fmtMoney } from "@/lib/profit-format";

function fmtGold(n) {
  return `${(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} G`;
}

function fmtSilver(n) {
  return (Number(n) || 0).toLocaleString("en-US");
}

function StatCard({ icon: Icon, label, value, sub, accent }) {
  return (
    <div className="rounded-xl border border-ll-hairline bg-ll-surface-1 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-ll-ink-tertiary">{label}</p>
          <p className={`mt-2 text-2xl font-semibold tracking-[-0.03em] ${accent || "text-ll-ink"}`}>{value}</p>
          {sub && <p className="mt-1 text-[12px] text-ll-ink-subtle">{sub}</p>}
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

function ProgressRow({ label, count, total, detail, color }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-[12px]">
        <span className="font-medium text-ll-ink">{label}</span>
        <span className="shrink-0 text-ll-ink-subtle">
          {count} ACCS ({pct}%)
        </span>
      </div>
      {detail && <p className="mt-0.5 text-[11px] text-ll-ink-tertiary">{detail}</p>}
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ll-surface-2">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(pct, count > 0 ? 4 : 0)}%` }} />
      </div>
    </div>
  );
}

const STATUS_COLORS = {
  ACTIVE: "bg-emerald-500",
  FILLING_TWOCARD: "bg-amber-500",
  FILLING_AZ: "bg-orange-500",
  LINE_DROPPED: "bg-red-500",
  DISABLED: "bg-ll-ink-tertiary",
};

export default function ProfitRazerOverview({ overview, onRefresh, refreshing }) {
  if (!overview) return null;

  const { totals, zones, statuses } = overview;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ll-ink">Razer Stock</h2>
          <p className="mt-0.5 text-[12px] text-ll-ink-subtle">ยอด Razer Gold / Silver แยกตามโซน</p>
        </div>
        <div className="flex items-center gap-2">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-ll-hairline bg-ll-surface-1 px-3 py-1.5 text-[12px] font-medium text-ll-ink hover:bg-ll-surface-2 disabled:opacity-60"
            >
              <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} /> รีเฟรช
            </button>
          )}
          <Link
            href="/profit/razer-stock"
            className="inline-flex items-center rounded-lg bg-ll-primary px-3 py-1.5 text-[12px] font-medium text-white hover:opacity-90"
          >
            จัดการบัญชี
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Coins}
          label="Total Gold Balance"
          value={fmtGold(totals.totalGold)}
          sub={`≈ ${fmtMoney(totals.totalGoldThb)}`}
          accent="text-amber-600"
        />
        <StatCard
          icon={Sparkles}
          label="Total Silver Balance"
          value={fmtSilver(totals.totalSilver)}
          sub={`${totals.accountCount} บัญชี`}
          accent="text-ll-ink-subtle"
        />
        <StatCard
          icon={ShieldCheck}
          label="บัญชีทั้งหมด"
          value={totals.accountCount}
          sub="Razer Accounts"
        />
        <StatCard
          icon={Globe}
          label="โซนที่มีสต็อก"
          value={zones.filter((z) => z.accountCount > 0).length}
          sub="จาก 5 โซน"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-ll-hairline bg-ll-surface-1 p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Globe size={16} className="text-ll-primary" />
            <h3 className="text-sm font-semibold text-ll-ink">Zone Distribution</h3>
          </div>
          <div className="mt-4 space-y-4">
            {zones.map((z) => (
              <ProgressRow
                key={z.zone}
                label={RAZER_ZONE_LABELS[z.zone] || z.zone}
                count={z.accountCount}
                total={totals.accountCount}
                detail={`${fmtGold(z.gold)} · Silver ${fmtSilver(z.silver)} · ≈ ${fmtMoney(z.goldThb)}`}
                color="bg-ll-primary"
              />
            ))}
            {totals.accountCount === 0 && (
              <p className="py-6 text-center text-[12px] text-ll-ink-tertiary">ยังไม่มีบัญชี Razer</p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-ll-hairline bg-ll-surface-1 p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-ll-primary" />
            <h3 className="text-sm font-semibold text-ll-ink">Account Health Check</h3>
          </div>
          <div className="mt-4 space-y-4">
            {statuses.length === 0 && (
              <p className="py-6 text-center text-[12px] text-ll-ink-tertiary">ยังไม่มีข้อมูลสถานะ</p>
            )}
            {statuses.map((s) => (
              <ProgressRow
                key={s.status}
                label={RAZER_STATUS_LABELS[s.status] || s.status}
                count={s.accountCount}
                total={totals.accountCount}
                color={STATUS_COLORS[s.status] || "bg-ll-ink-tertiary"}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {zones.map((z) => (
          <div key={z.zone} className="rounded-xl border border-ll-hairline bg-ll-surface-1 p-4 shadow-sm">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-ll-ink-tertiary">
              {RAZER_ZONE_LABELS[z.zone]}
            </p>
            <p className="mt-2 text-lg font-semibold text-amber-600">{fmtGold(z.gold)}</p>
            <p className="mt-0.5 text-[12px] text-ll-ink-subtle">Silver {fmtSilver(z.silver)}</p>
            <p className="mt-1 text-[11px] text-emerald-600">≈ {fmtMoney(z.goldThb)}</p>
            <p className="mt-2 text-[11px] text-ll-ink-tertiary">{z.accountCount} บัญชี</p>
          </div>
        ))}
      </div>
    </section>
  );
}
