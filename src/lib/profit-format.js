export const fmtMoney = (n) => `฿${(Number(n) || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;

export const fmtUsd = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return "-";
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const fmtPct = (n) => `${(Number(n) || 0).toFixed(1)}%`;

export const fmtDate = (iso) => {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("th-TH", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const fmtPoints = (n) => `${(Number(n) || 0).toLocaleString("en-US")} pts`;

export const fmtKyat = (n) => `Ks${(Number(n) || 0).toLocaleString("en-US")}`;

export const fmtPhp = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return "-";
  return `₱${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
};

export const fmtIdr = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return "-";
  return `Rp${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
};

export const fmtMyr = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return "-";
  return `RM${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// What staff see / type in the sale-price cell. USDT Russia keeps the entered
// USDT figure (e.g. 0.61); profit math still uses saleAmount (THB = USDT × rate).
// Fee-adjusted display matches Kaleoz: show net when the platform takes a cut.
export function netSaleDisplay(o) {
  const base = o.saleAmountUsdt != null ? o.saleAmountUsdt : (o.saleAmount || 0);
  return o.platformFeePct > 0 ? Math.round(base * (1 - o.platformFeePct / 100) * 100) / 100 : base;
}
