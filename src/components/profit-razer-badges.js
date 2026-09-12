const ZONE_STYLES = {
  CAD: "bg-sky-50 text-sky-700 ring-sky-200",
  SGD: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  PHP: "bg-amber-50 text-amber-700 ring-amber-200",
  VND: "bg-rose-50 text-rose-700 ring-rose-200",
  THB: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  OTHER: "bg-ll-surface-2 text-ll-ink-subtle ring-ll-hairline",
};

const STATUS_STYLES = {
  PENDING_TOPUP: "bg-red-50 text-red-600",
  SILVER_READY: "bg-violet-50 text-violet-600",
  ACTIVE: "bg-emerald-50 text-emerald-600",
  INACTIVE: "bg-ll-surface-2 text-ll-ink-tertiary",
  IN_USE: "bg-amber-50 text-amber-700",
};

export function RazerZoneBadge({ zone }) {
  const label = zone || "OTHER";
  return (
    <span className={`inline-flex rounded px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${ZONE_STYLES[label] || ZONE_STYLES.OTHER}`}>
      {label}
    </span>
  );
}

export function RazerStatusBadge({ status, inUseBy }) {
  const label = status || "PENDING_TOPUP";
  return (
    <div className="flex flex-col gap-0.5">
      <span className={`inline-flex w-fit rounded px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[label] || STATUS_STYLES.PENDING_TOPUP}`}>
        {label}
      </span>
      {inUseBy && (
        <span className="max-w-[180px] truncate text-[10px] text-amber-700" title={inUseBy}>
          {inUseBy}
        </span>
      )}
    </div>
  );
}

export const RAZER_ZONE_LABELS = {
  CAD: "Razer CAD",
  SGD: "Razer SGD",
  PHP: "Razer PHP",
  VND: "Razer VND",
  THB: "Razer THB",
  OTHER: "Razer Other",
};
