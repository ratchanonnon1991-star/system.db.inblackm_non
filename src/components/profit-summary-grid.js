"use client";

// Small stat-tile row shared by the dashboard and every category page —
// matches the "summary" grid from the original Card Ops dashboard, restyled
// with this project's ll- design tokens.
export default function ProfitSummaryGrid({ items }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((item) => {
        const valueClass = `mt-1 text-lg font-semibold ${
          item.tone === "pos"
            ? "text-emerald-600"
            : item.tone === "neg"
              ? "text-red-600"
              : "text-ll-ink"
        }`;
        // Tiles with an onClick (e.g. "duplicate cards found") act as a
        // filter toggle so the matching rows can be found without scrolling
        // through a long list -- `active` highlights it while the filter's on.
        if (item.onClick) {
          return (
            <button
              key={item.k}
              type="button"
              onClick={item.onClick}
              className={`cursor-pointer rounded-lg border p-3 text-left transition ${
                item.active
                  ? "border-ll-primary bg-ll-primary-subtle-bg"
                  : "border-ll-hairline bg-ll-surface-1 hover:border-ll-hairline-strong hover:bg-ll-surface-2"
              }`}
            >
              <p className="text-[11px] text-ll-ink-subtle">{item.k}</p>
              <p className={valueClass}>{item.v}</p>
            </button>
          );
        }
        return (
          <div key={item.k} className="rounded-lg border border-ll-hairline bg-ll-surface-1 p-3">
            <p className="text-[11px] text-ll-ink-subtle">{item.k}</p>
            <p className={valueClass}>{item.v}</p>
          </div>
        );
      })}
    </div>
  );
}
