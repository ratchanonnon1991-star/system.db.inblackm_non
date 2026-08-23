export const fmtMoney = (n) => (Number(n) || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 });

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
