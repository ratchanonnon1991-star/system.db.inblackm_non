"use client";

import Link from "next/link";
import { GroupBadge } from "@/components/profit-badges";
import { fmtIdr, fmtKyat, fmtMoney, fmtMyr, fmtPct, fmtPhp, fmtPoints, fmtUsd } from "@/lib/profit-format";

const GROUP_LABELS = { bot: "Bot", api: "API", human: "Human (manual)" };
const GROUP_ORDER = ["bot", "api", "human"];

function fmtStockValue({ value, unit }) {
  switch (unit) {
    case "usd":
      return fmtUsd(value);
    case "points":
      return fmtPoints(value);
    case "kyat":
      return fmtKyat(value);
    case "thb":
      return fmtMoney(value);
    case "php":
      return fmtPhp(value);
    case "idr":
      return fmtIdr(value);
    case "myr":
      return fmtMyr(value);
    default:
      return String(value ?? "-");
  }
}

function CategoryCard({ category }) {
  const profitTone = category.profitTotal >= 0 ? "text-emerald-600" : "text-red-600";

  return (
    <Link
      href={`/profit/category/${category.id}`}
      className="group flex flex-col rounded-xl border border-ll-hairline bg-ll-surface-1 p-4 shadow-sm transition hover:border-ll-primary/40 hover:bg-ll-surface-2"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ll-ink group-hover:text-ll-primary">{category.name}</p>
          {category.excludeFromTotals && (
            <p className="mt-0.5 text-[10px] text-ll-ink-tertiary">ไม่รวมยอดรวม</p>
          )}
        </div>
        <GroupBadge group={category.group} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[12px]">
        <div>
          <p className="text-ll-ink-tertiary">บัตร/เกม</p>
          <p className="font-semibold text-ll-ink">{category.cardCount}</p>
        </div>
        <div>
          <p className="text-ll-ink-tertiary">ยอดขาย</p>
          <p className="font-semibold text-ll-ink">{fmtMoney(category.saleTotal)}</p>
        </div>
        <div>
          <p className="text-ll-ink-tertiary">กำไร</p>
          <p className={`font-semibold ${profitTone}`}>{fmtMoney(category.profitTotal)}</p>
        </div>
        <div>
          <p className="text-ll-ink-tertiary">% กำไร</p>
          <p className={`font-semibold ${profitTone}`}>{fmtPct(category.profitPct)}</p>
        </div>
      </div>

      {(category.stock || category.deducted) && (
        <div className="mt-3 space-y-1 border-t border-ll-hairline pt-3 text-[11px]">
          {category.stock?.value != null && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-ll-ink-tertiary">{category.stock.label}</span>
              <span className="font-medium text-ll-ink">{fmtStockValue(category.stock)}</span>
            </div>
          )}
          {category.deducted?.value != null && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-ll-ink-tertiary">{category.deducted.label}</span>
              <span className="font-medium text-ll-ink">{fmtStockValue(category.deducted)}</span>
            </div>
          )}
        </div>
      )}

      {category.duplicateCardCount > 0 && (
        <p className="mt-2 text-[11px] font-medium text-red-600">
          พบยอดซ้ำ {category.duplicateCardCount} รายการ
        </p>
      )}
    </Link>
  );
}

function GroupRollupCard({ label, rollup }) {
  const profitTone = rollup.profitTotal >= 0 ? "text-emerald-600" : "text-red-600";
  return (
    <div className="rounded-xl border border-ll-hairline bg-ll-surface-1 p-4 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-ll-ink-tertiary">{label}</p>
      <div className="mt-3 grid grid-cols-2 gap-3 text-[12px] sm:grid-cols-4">
        <div>
          <p className="text-ll-ink-tertiary">บัตร/เกม</p>
          <p className="mt-0.5 text-lg font-semibold text-ll-ink">{rollup.cardCount}</p>
        </div>
        <div>
          <p className="text-ll-ink-tertiary">ยอดขาย</p>
          <p className="mt-0.5 text-lg font-semibold text-ll-ink">{fmtMoney(rollup.saleTotal)}</p>
        </div>
        <div>
          <p className="text-ll-ink-tertiary">กำไร</p>
          <p className={`mt-0.5 text-lg font-semibold ${profitTone}`}>{fmtMoney(rollup.profitTotal)}</p>
        </div>
        <div>
          <p className="text-ll-ink-tertiary">% กำไร</p>
          <p className={`mt-0.5 text-lg font-semibold ${profitTone}`}>{fmtPct(rollup.profitPct)}</p>
        </div>
      </div>
    </div>
  );
}

export default function ProfitCategoriesOverview({ categories, bot, api }) {
  if (!categories?.length) return null;

  return (
    <section className="flex flex-col gap-5">
      <div>
        <h2 className="text-base font-semibold text-ll-ink">บัตร / ช่องทางทั้งหมด</h2>
        <p className="mt-0.5 text-[12px] text-ll-ink-subtle">สรุปยอดขาย กำไร และสต็อกแยกตามแหล่งข้อมูล</p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {bot && <GroupRollupCard label="Bot — รวม" rollup={bot} />}
        {api && <GroupRollupCard label="API — รวม" rollup={api} />}
      </div>

      {GROUP_ORDER.map((group) => {
        const items = categories.filter((c) => c.group === group);
        if (items.length === 0) return null;
        return (
          <div key={group}>
            <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-ll-ink-subtle">
              {GROUP_LABELS[group]}
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {items.map((c) => (
                <CategoryCard key={c.id} category={c} />
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}
