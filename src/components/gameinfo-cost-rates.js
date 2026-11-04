"use client";

import PaginatedTable from "@/components/table-pagination";
import { useMemo } from "react";
import { Pencil, Plus } from "lucide-react";
import { gameinfoCostRateRows } from "@/lib/gameinfo-channel-costs";

function rateText(rate) {
  if (rate == null || rate === "" || !Number.isFinite(Number(rate))) return "ยังคิดไม่ได้";
  return Number(rate).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}

function dateText(value) {
  const date = new Date(value);
  return !value || Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok" });
}

const METHOD = {
  sheet: { label: "คิดแบบชีต", className: "bg-red-500/10 text-[#A80004] dark:text-red-300" },
  variable: { label: "ตัวแปร", className: "bg-violet-500/10 text-violet-700 dark:text-violet-300" },
  fixed: { label: "เรทคงที่", className: "bg-linear-surface-3 text-linear-ink-muted" },
};

// A suggestion this close to the rate in use is not worth a click.
const SAME_RATE = 0.0005;

/** How far today's sheet rate is from the one in use, as "+3.2%", or "" when it is the same. */
export function gameinfoRateDelta(rate, suggestion) {
  const current = Number(rate);
  const next = Number(suggestion);
  if (!Number.isFinite(current) || !Number.isFinite(next) || current <= 0) return "";
  const change = (next - current) / current;
  if (Math.abs(change) < SAME_RATE) return "";
  return `${change > 0 ? "+" : "−"}${Math.abs(change * 100).toFixed(1)}%`;
}

// What a game's packs are costed at, wallet by wallet, the way the source
// sheet lays its rates out. On the edit page an admin changes a rate from
// here (`onEdit`) or takes today's suggested one (`onApplySuggestion`); the
// change waits in the editor's draft like any other edit.
export default function GameinfoCostRates({
  currencies,
  costProfiles,
  formulaVariables,
  externalValues,
  other,
  editable = false,
  otherModeLabel = "",
  onEdit = null,
  onApplySuggestion = null,
  onAdd = null,
  className = "",
}) {
  const rows = useMemo(
    () => gameinfoCostRateRows(currencies, costProfiles, { formulaVariables, externalValues, other }),
    [currencies, costProfiles, formulaVariables, externalValues, other]
  );
  const addButton = editable && onAdd ? (
    <button type="button" onClick={onAdd} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#D90005] px-3.5 text-xs font-bold text-white hover:bg-[#B80004]">
      <Plus size={14} aria-hidden="true" /> เพิ่มช่องทางเติม
    </button>
  ) : null;
  if (!rows.length) {
    if (!editable) return null;
    return (
      <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border border-linear-hairline bg-linear-surface-1 px-4 py-3.5 ${className}`}>
        <div>
          <p className="text-sm font-extrabold text-linear-ink">เรทต้นทุน</p>
          <p className="text-xs text-linear-ink-tertiary">เกมนี้ยังไม่มีเรทของช่องทางเติม เพิ่มเรทแล้วต้นทุนของแพ็คที่ใช้ช่องทางนั้นจะคิดจากเรทนี้</p>
        </div>
        {addButton}
      </div>
    );
  }
  return (
    <div className={`overflow-x-auto rounded-xl border border-linear-hairline bg-linear-surface-1 ${className}`}>
      {addButton ? <div className="flex justify-end px-3 pt-2.5">{addButton}</div> : null}
      <PaginatedTable items={rows}>{(tablePageItems, tablePageStart, tableAllItems) => (<table className={`w-full text-left text-[13px] ${editable ? "min-w-[720px]" : "min-w-[520px]"}`}>
        <caption className="px-3 pt-2.5 pb-1 text-left text-sm font-extrabold text-linear-ink">
          เรทต้นทุน
          {editable ? <span className="ml-2 text-xs font-medium text-linear-ink-tertiary">ต้นทุนแพ็ค = (ยอดที่กด + fee) × เรทของช่องทางเติม</span> : null}
        </caption>
        <thead className="text-xs text-linear-ink-tertiary">
          <tr>
            <th scope="col" className="px-3 py-1.5 font-semibold">ช่องทาง</th>
            {editable ? <th scope="col" className="px-3 py-1.5 font-semibold">เรทมาจาก</th> : null}
            <th scope="col" className="px-3 py-1.5 text-right font-semibold">เรท (บาท)</th>
            {editable ? <th scope="col" className="px-3 py-1.5 font-semibold">ถ้าคิดด้วยเรทวันนี้</th> : <th scope="col" className="px-3 py-1.5 font-semibold">ที่มา</th>}
            <th scope="col" className="px-3 py-1.5 font-semibold">แก้ล่าสุด</th>
            <th scope="col" className="px-3 py-1.5 text-right font-semibold">แพ็ค</th>
          </tr>
        </thead>
        <tbody>
          {tablePageItems.map((tableItem, tableIndex) => ((row) => {
            const method = METHOD[row.method] || METHOD.fixed;
            const delta = row.suggestion !== null ? gameinfoRateDelta(row.rate, row.suggestion) : "";
            return (
              <tr key={row.id} className="border-t border-linear-hairline align-middle">
                <td className="px-3 py-2 font-bold text-linear-ink">
                  <span className="flex items-center gap-2">
                    {editable && row.own && onEdit ? (
                      <button
                        type="button"
                        onClick={() => onEdit(row)}
                        aria-label={`แก้เรท ${row.channel}`}
                        title={`แก้เรท ${row.channel}`}
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-linear-hairline-strong text-linear-ink hover:bg-linear-surface-2"
                      >
                        <Pencil size={15} aria-hidden="true" />
                      </button>
                    ) : null}
                    <span>
                      {row.channel}
                      <span className="block text-xs font-medium text-linear-ink-tertiary">
                        {row.currency ? `ต่อ 1 ${row.currency}` : ""}
                        {editable && !row.own ? `${row.currency ? " · " : ""}แก้ที่โหมด ${otherModeLabel}` : ""}
                      </span>
                    </span>
                  </span>
                </td>
                {editable ? (
                  <td className="px-3 py-2">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11.5px] font-bold ${method.className}`}>{method.label}</span>
                    <span className="mt-0.5 block max-w-64 truncate font-mono text-xs text-linear-ink-muted" title={row.source}>{row.source}</span>
                  </td>
                ) : null}
                <td className="px-3 py-2 text-right font-extrabold tabular-nums text-[#D90005] dark:text-red-400">{rateText(row.rate)}</td>
                {editable ? (
                  <td className="px-3 py-2">
                    {row.suggestion === null ? (
                      <span className="text-xs text-linear-ink-tertiary">{row.method === "sheet" ? "รอเรทสด" : "—"}</span>
                    ) : (
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="font-bold tabular-nums text-linear-ink">{rateText(row.suggestion)}</span>
                        {delta ? <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11.5px] font-bold text-amber-800 dark:text-amber-300">{delta}</span> : <span className="text-xs text-linear-ink-tertiary">เท่าเดิม</span>}
                        {delta && row.own && onApplySuggestion ? (
                          <button type="button" onClick={() => onApplySuggestion(row)} className="h-7 rounded-full border border-[#D90005]/40 px-2.5 text-xs font-bold text-[#C20004] hover:bg-[#D90005]/10 dark:text-red-300">
                            ใช้เรทนี้
                          </button>
                        ) : null}
                      </span>
                    )}
                  </td>
                ) : (
                  <td className="max-w-56 truncate px-3 py-2 font-mono text-xs text-linear-ink-muted" title={row.source}>{row.source}</td>
                )}
                <td className="px-3 py-2 tabular-nums text-linear-ink-muted" title={row.note || undefined}>
                  {dateText(row.updatedAt)}
                  {editable && row.note ? <span className="block max-w-44 truncate text-xs">{row.note}</span> : null}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-linear-ink-muted">{row.packs}</td>
              </tr>
            );
          })(tableItem, tablePageStart + tableIndex, tableAllItems))}
        </tbody>
      </table>)}</PaginatedTable>
      {editable ? (
        <p className="border-t border-linear-hairline px-3 py-2 text-xs text-linear-ink-tertiary">
          “ถ้าคิดด้วยเรทวันนี้” คิดตามชีตด้วย USDT/THB และ USDCNY สด อัปเดตทุกชั่วโมง เป็นแค่คำแนะนำ เรทจะเปลี่ยนเมื่อกด “ใช้เรทนี้” แล้วบันทึก
        </p>
      ) : null}
    </div>
  );
}
