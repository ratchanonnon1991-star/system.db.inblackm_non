"use client";

// Small stat-tile row shared by the dashboard and every category page —
// matches the "summary" grid from the original Card Ops dashboard, restyled
// with this project's ll- design tokens.
export default function ProfitSummaryGrid({ items }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((item) => (
        <div key={item.k} className="rounded-lg border border-ll-hairline bg-ll-surface-1 p-3">
          <p className="text-[11px] text-ll-ink-subtle">{item.k}</p>
          <p
            className={`mt-1 text-lg font-semibold ${
              item.tone === "pos"
                ? "text-emerald-600"
                : item.tone === "neg"
                  ? "text-red-600"
                  : "text-ll-ink"
            }`}
          >
            {item.v}
          </p>
        </div>
      ))}
    </div>
  );
}
