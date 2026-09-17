import {
  RAZER_STATUS_LABELS,
  RAZER_STATUSES,
  isRazerBusyStatus,
  normalizeRazerStatus,
  razerStatusLabel,
} from "@/lib/profit-razer-status";

const ZONE_STYLES = {
  CAD: "bg-sky-50 text-sky-700 ring-sky-200",
  SGD: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  PHP: "bg-amber-50 text-amber-700 ring-amber-200",
  VND: "bg-rose-50 text-rose-700 ring-rose-200",
  THB: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  OTHER: "bg-ll-surface-2 text-ll-ink-subtle ring-ll-hairline",
};

const STATUS_STYLES = {
  ACTIVE: "bg-emerald-50 text-emerald-700",
  FILLING_TWOCARD: "bg-amber-50 text-amber-800",
  FILLING_AZ: "bg-orange-50 text-orange-800",
  LINE_DROPPED: "bg-red-50 text-red-700",
  DISABLED: "bg-ll-surface-2 text-ll-ink-tertiary",
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
  const code = normalizeRazerStatus(status);
  const label = razerStatusLabel(code);
  return (
    <div className="flex flex-col gap-0.5">
      <span className={`inline-flex w-fit rounded px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[code] || STATUS_STYLES.ACTIVE}`}>
        {label}
      </span>
      {inUseBy && isRazerBusyStatus(code) && (
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

export { RAZER_STATUSES, RAZER_STATUS_LABELS, razerStatusLabel };
