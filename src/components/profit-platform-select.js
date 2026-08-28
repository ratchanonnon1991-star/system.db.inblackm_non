"use client";

// Friendlier labels for the raw codashop_orders.source values -- anything
// not listed here just falls back to showing the raw value as-is.
const PLATFORM_LABELS = {
  kaleoz: "Kaleoz",
  russia_reseller: "USDT Russia",
  PAGE: "เพจ Facebook",
  inblackm_web: "เว็บ inblackm",
  playerok: "PlayerOK",
  itemku: "Itemku",
};

export function platformLabel(value) {
  return PLATFORM_LABELS[value] || value;
}

// Which resale platform (Kaleoz, USDT Russia, ...) a GoCash order sold
// through. codashop_orders.source (joined in by profit-gocash.js) already
// records this for orders the source system tagged -- that's ground truth,
// shown here read-only. Orders it never tagged (most historical ones) fall
// back to a manual pick, which stays editable; either way, once a platform
// is known the order's sale price falls back live to that platform's
// reference price for its pack (see gocashOrderView on the server), so
// there's nothing else to "commit" here beyond the tag itself.
export default function PlatformSelect({ value, fromDb, platforms, disabled, onCommit }) {
  if (fromDb) {
    return (
      <span
        title="ดึงมาจากระบบต้นทาง (codashop_orders.source) แก้ไม่ได้"
        className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-600"
      >
        {platformLabel(value)}
      </span>
    );
  }
  const options = value && !platforms.includes(value) ? [...platforms, value] : platforms;
  return (
    <select
      value={value || ""}
      disabled={disabled}
      onChange={(e) => onCommit(e.target.value)}
      className="h-8 rounded-md border border-ll-hairline-strong bg-ll-surface-2 px-2 text-[12px] text-ll-ink outline-none focus:border-ll-primary focus:bg-ll-surface-1 disabled:opacity-60"
    >
      <option value="">-</option>
      {options.map((p) => (
        <option key={p} value={p}>{platformLabel(p)}</option>
      ))}
    </select>
  );
}
