"use client";

import { useMemo } from "react";
import { gameinfoCostRateRows } from "@/lib/gameinfo-channel-costs";

function rateText(rate) {
  if (rate == null || rate === "" || !Number.isFinite(Number(rate))) return "ยังคิดไม่ได้";
  return Number(rate).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}

function dateText(value) {
  const date = new Date(value);
  return !value || Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok" });
}

// What a game's packs are costed at, wallet by wallet, the way the source
// sheet lays its rates out. Read-only; rates are edited under ตัวแปรผสม.
export default function GameinfoCostRates({ currencies, costProfiles, formulaVariables, externalValues, other, className = "" }) {
  const rows = useMemo(
    () => gameinfoCostRateRows(currencies, costProfiles, { formulaVariables, externalValues, other }),
    [currencies, costProfiles, formulaVariables, externalValues, other]
  );
  if (!rows.length) return null;
  return (
    <div className={`overflow-x-auto rounded-xl border border-linear-hairline bg-linear-surface-1 ${className}`}>
      <table className="w-full min-w-[520px] text-left text-[13px]">
        <caption className="px-3 pt-2.5 pb-1 text-left text-sm font-extrabold text-linear-ink">เรทต้นทุน</caption>
        <thead className="text-xs text-linear-ink-tertiary">
          <tr>
            <th scope="col" className="px-3 py-1.5 font-semibold">ช่องทาง</th>
            <th scope="col" className="px-3 py-1.5 text-right font-semibold">เรท (บาท)</th>
            <th scope="col" className="px-3 py-1.5 font-semibold">ที่มา</th>
            <th scope="col" className="px-3 py-1.5 font-semibold">แก้ล่าสุด</th>
            <th scope="col" className="px-3 py-1.5 text-right font-semibold">แพ็ค</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-linear-hairline">
              <td className="px-3 py-2 font-bold text-linear-ink">
                {row.channel}
                {row.currency ? <span className="ml-1.5 text-xs font-medium text-linear-ink-tertiary">ต่อ 1 {row.currency}</span> : null}
              </td>
              <td className="px-3 py-2 text-right font-extrabold tabular-nums text-[#D90005] dark:text-red-400">{rateText(row.rate)}</td>
              <td className="max-w-56 truncate px-3 py-2 font-mono text-xs text-linear-ink-muted" title={row.source}>{row.source}</td>
              <td className="px-3 py-2 tabular-nums text-linear-ink-muted">{dateText(row.updatedAt)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-linear-ink-muted">{row.packs}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
