"use client";

import PaginatedTable from "@/components/table-pagination";
import { useState } from "react";
import { CheckCircle2, Save, Store } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { useGameinfoUnsavedChanges } from "@/lib/gameinfo-unsaved-changes";
import { gameinfoMarginTone } from "@/lib/gameinfo-pack-list";
import {
  GAMEINFO_MARKET_RESULTS,
  GAMEINFO_SALES_CHANNELS,
  GAMEINFO_SALES_STATUSES,
  gameinfoMarketResult,
  gameinfoSalesStatus,
} from "@/lib/gameinfo-sales-channels";

const TONE = {
  ok: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-400",
  info: "bg-sky-500/15 text-sky-800 dark:text-sky-300",
  warn: "bg-amber-500/15 text-amber-800 dark:text-amber-400",
  bad: "bg-[#D90005]/10 text-[#B80004] dark:text-[#FF8A8C]",
  muted: "bg-linear-surface-3 text-linear-ink-muted",
};
const LABEL = Object.fromEntries(GAMEINFO_SALES_CHANNELS.map((channel) => [channel.key, channel.label]));

function marginText(margin) {
  return margin == null ? "—" : `${Number(margin).toFixed(2)}%`;
}

/** The game page's cards. Margins only in the Product view. */
// The game page's folding card carries the title; these are its rows, in the
// page's own look (gameinfo-game-detail.css).
const PILL_TONE = { ok: "green", info: "blue", warn: "amber", bad: "red", muted: "" };

export function GameinfoSalesChannelCards({ channels, showMargin }) {
  if (channels.length === 0) return <p className="gd-note">ยังไม่มีข้อมูลช่องทางขาย</p>;
  return (
    <ul className="gd-chan m-0 list-none p-0">
      {channels.map((row) => {
        const status = gameinfoSalesStatus(row.status);
        const market = gameinfoMarketResult(row.market);
        const margin = row.margin == null ? null : Number(row.margin);
        return (
          <li key={row.channel} className="gd-ch">
            <div className="gd-chl">
              <b title={LABEL[row.channel]}>{LABEL[row.channel]}</b>
              <p className={market ? PILL_TONE[market.tone] : ""}>{market ? `ราคาตลาด: ${market.label}` : "ไม่เทียบราคาตลาด"}</p>
              {row.note ? <p>{row.note}</p> : null}
            </div>
            {showMargin ? (
              <span className={`gd-chm ${margin === null ? "na" : gameinfoMarginTone(margin)}`} title="Margin">{marginText(row.margin)}</span>
            ) : null}
            {status ? <span className={`gd-pill ${PILL_TONE[status.tone]}`}>{status.label}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}

function rowsFor(channels) {
  const byKey = new Map(channels.map((row) => [row.channel, row]));
  return GAMEINFO_SALES_CHANNELS.map(({ key }) => {
    const row = byKey.get(key);
    return { channel: key, status: row?.status || "", market: row?.market || "", margin: row?.margin == null ? "" : String(row.margin), note: row?.note || "" };
  });
}

/** Manage-page editor: every channel on one table, saved together. */
export default function GameinfoSalesChannelEditor({ gameId, initialChannels }) {
  const [saved, setSaved] = useState(() => rowsFor(initialChannels));
  const [rows, setRows] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const dirty = JSON.stringify(rows) !== JSON.stringify(saved);
  useGameinfoUnsavedChanges(dirty);

  function update(index, field, value) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
    setNotice("");
  }

  async function save() {
    const badMargin = rows.find((row) => row.margin.trim() && !Number.isFinite(Number(row.margin)));
    if (badMargin) {
      setError(`Margin ของ ${LABEL[badMargin.channel]} ต้องเป็นตัวเลข`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = await apiJson(`/api/gameinfo/gamelist/${gameId}/sales-channels`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channels: rows.map((row) => ({ ...row, margin: row.margin.trim() === "" ? null : Number(row.margin) })) }),
        fallbackError: "บันทึกช่องทางขายไม่สำเร็จ",
      });
      const next = rowsFor(data.channels);
      setSaved(next);
      setRows(next);
      setNotice("บันทึกเรียบร้อย");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "บันทึกช่องทางขายไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  const fieldClass = "h-10 w-full rounded-[10px] border border-linear-hairline-strong bg-linear-surface-1 px-2.5 text-sm text-linear-ink outline-none focus:border-[#D90005]";

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-xl border border-linear-hairline">
        <PaginatedTable items={rows}>{(tablePageItems, tablePageStart, tableAllItems) => (<table className="w-full min-w-[820px] text-left text-sm">
          <thead className="bg-linear-surface-2 text-[11px] font-black uppercase tracking-[0.06em] text-linear-ink-muted">
            <tr>
              <th scope="col" className="px-4 py-3">ช่องทาง</th>
              <th scope="col" className="px-3 py-3">สถานะ</th>
              <th scope="col" className="px-3 py-3">ราคาตลาด</th>
              <th scope="col" className="w-32 px-3 py-3">Margin (%)</th>
              <th scope="col" className="px-4 py-3">หมายเหตุ</th>
            </tr>
          </thead>
          <tbody>
            {tablePageItems.map((tableItem, tableIndex) => ((row, index) => (
              <tr key={row.channel} className="border-t border-linear-hairline">
                <th scope="row" className="px-4 py-2 text-left font-extrabold text-linear-ink">{LABEL[row.channel]}</th>
                <td className="px-3 py-2">
                  <select aria-label={`สถานะ ${LABEL[row.channel]}`} value={row.status} onChange={(e) => update(index, "status", e.target.value)} className={fieldClass}>
                    <option value="">—</option>
                    {GAMEINFO_SALES_STATUSES.map((status) => <option key={status.key} value={status.key}>{status.label}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <select aria-label={`ราคาตลาด ${LABEL[row.channel]}`} value={row.market} onChange={(e) => update(index, "market", e.target.value)} className={fieldClass}>
                    <option value="">—</option>
                    {GAMEINFO_MARKET_RESULTS.map((result) => <option key={result.key} value={result.key}>{result.label}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <input aria-label={`Margin ${LABEL[row.channel]}`} inputMode="decimal" value={row.margin} onChange={(e) => update(index, "margin", e.target.value)} className={`${fieldClass} text-right tabular-nums`} />
                </td>
                <td className="px-4 py-2">
                  <input aria-label={`หมายเหตุ ${LABEL[row.channel]}`} value={row.note} maxLength={200} onChange={(e) => update(index, "note", e.target.value)} className={fieldClass} />
                </td>
              </tr>
            ))(tableItem, tablePageStart + tableIndex, tableAllItems))}
          </tbody>
        </table>)}</PaginatedTable>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3">
        {notice ? <span role="status" className="mr-auto flex items-center gap-1.5 text-xs text-linear-success"><CheckCircle2 size={15} aria-hidden="true" /> {notice}</span> : null}
        {error ? <span role="alert" className="mr-auto text-xs text-linear-danger">{error}</span> : null}
        <button type="button" disabled={!dirty || busy} onClick={() => { setRows(saved); setError(""); }} className="h-11 rounded-xl border border-linear-hairline bg-linear-surface-1 px-[18px] text-sm font-bold text-linear-ink hover:bg-linear-surface-2 disabled:opacity-40">ยกเลิก</button>
        <button type="button" disabled={!dirty || busy} onClick={save} className="flex h-11 items-center gap-2 rounded-xl bg-[#D90005] px-5 text-sm font-extrabold text-white hover:bg-[#B80004] disabled:opacity-40">
          <Save size={16} aria-hidden="true" /> {busy ? "กำลังบันทึก…" : "บันทึก"}
        </button>
      </div>
    </div>
  );
}
