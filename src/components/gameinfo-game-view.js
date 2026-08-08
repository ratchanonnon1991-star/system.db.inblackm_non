"use client";

import { useMemo } from "react";
import { ExternalLink, Gamepad2 } from "lucide-react";
import { evaluateFormula, parseFormula } from "@/lib/gamedb-formula";
import { formatCell as formatComputedCell } from "@/lib/gamedb-layout";
import { resolveGameinfoField } from "@/lib/gameinfo-formula-fields";
import GameinfoTutorialButton from "./gameinfo-tutorial-modal";

// One game's game_list row, read-only (editing region/platform/server/etc.
// happens on the list table or the pack editor, not here — see
// gameinfo-gamelist-table.js and GameinfoPackEditor) plus its packs — same
// currencies/computedColumns tree the pack editor saves to gamelist_packs,
// so what's shown here always matches what "จัดการแพ็ก" last saved.
export default function GameinfoGameView({ row, currencies, computedColumns }) {
  // Same field set the pack editor's formulas can reference (see
  // gameinfo-formula-fields.js) — built from the game_list row, not the
  // gamelist_packs game shape, since that's all this page has.
  const formulaGame = useMemo(
    () => ({ gameName: row.game, region: row.region, platform: row.platform, server: row.server }),
    [row.game, row.region, row.platform, row.server]
  );
  const parsedColumns = useMemo(
    () =>
      (computedColumns || []).map((col) => {
        try {
          return { ...col, ast: parseFormula(col.formula) };
        } catch {
          return { ...col, ast: null };
        }
      }),
    [computedColumns]
  );

  return (
    <div>
      {/* Compact view card — icon, bold title, one-line Region/Platform/
          Server/VPN summary, pill button to the game's top-up website. */}
      <div className="mb-8 flex items-start gap-4 rounded-xl border border-linear-hairline bg-linear-surface-1 p-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-linear-primary/10">
          <Gamepad2 size={26} className="text-linear-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-bold uppercase tracking-tight text-linear-ink">
            {row.game}
          </h1>
          {/* Horizontal flowing summary — every field from the list table's
              column set (ลำดับ, ID, Region, Platform, Server, VPN, Bot/
              Manual) except Link, which is represented by the button below
              instead of repeated as inline text. Wraps onto more than one
              line on narrow screens rather than stacking one field per row. */}
          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-linear-ink-tertiary">
            <span>ลำดับ: {row.orderPosition ?? "-"}</span>
            <span>ID: {row.id}</span>
            <span>Region: {row.region || "-"}</span>
            <span>Platform: {row.platform || "-"}</span>
            <span>Server: {row.server || "-"}</span>
            <span>VPN: {row.vpnComputed || "NO"}</span>
            <span>Bot/Manual: {row.botManual || "-"}</span>
          </p>
          <ChannelSummary channels={row.channels} className="mt-1.5" />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {row.link ? (
              <a
                href={row.link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-md bg-linear-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-linear-primary-hover"
              >
                ไปที่เว็บเติมเกม <ExternalLink size={13} />
              </a>
            ) : (
              <span className="inline-block text-xs text-linear-ink-tertiary">
                ยังไม่มีลิงก์เว็บเติมเกม
              </span>
            )}
            {/* Always view-only here regardless of role — editing the
                tutorial happens from the "⋮" menu / list table, not this
                page (see gameinfo-gamelist-table.js). */}
            <GameinfoTutorialButton gameId={row.id} gameName={row.game} editable={false} />
          </div>
        </div>
      </div>

      <h2 className="mb-3 text-lg font-semibold text-linear-ink">แพ็ก</h2>
      {(currencies || []).length === 0 ? (
        <p className="rounded-lg border border-dashed border-linear-hairline-strong bg-linear-surface-1 p-8 text-center text-linear-ink-tertiary">
          ยังไม่มีข้อมูลแพ็กสำหรับเกมนี้
        </p>
      ) : (
        <div className="space-y-4">
          {currencies.map((currency) => (
            <PackCurrency key={currency.id} currency={currency} game={formulaGame} computedColumns={parsedColumns} />
          ))}
        </div>
      )}
    </div>
  );
}

function PackCurrency({ currency, game, computedColumns }) {
  return (
    <div className="rounded-lg border border-linear-hairline bg-linear-surface-1 p-4">
      <div className="mb-3 flex items-center gap-2">
        {currency.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={currency.image} alt="" className="h-6 w-6 shrink-0 rounded object-cover" />
        ) : null}
        <h3 className="font-medium text-linear-ink">{currency.name || "(ไม่มีชื่อสกุลเงิน)"}</h3>
      </div>
      <div className="space-y-3">
        {currency.categories.map((cat) => (
          <PackCategory key={cat.id} category={cat} game={game} computedColumns={computedColumns} />
        ))}
      </div>
    </div>
  );
}

function PackCategory({ category, game, computedColumns }) {
  return (
    <div className="rounded-md border border-linear-hairline bg-linear-surface-2 p-3">
      <div className="mb-2 flex items-center gap-2">
        <h4 className="text-sm font-medium text-linear-ink-muted">{category.name || "(ไม่มีชื่อหมวดหมู่)"}</h4>
        <span className="text-xs text-linear-ink-tertiary">({category.packs.length} แพ็ก)</span>
      </div>
      {category.packs.length === 0 ? (
        <p className="px-1 py-2 text-xs text-linear-ink-tertiary">ยังไม่มี pack</p>
      ) : (
        <div className="overflow-hidden rounded-md border border-linear-hairline bg-linear-surface-1">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="border-b border-linear-hairline bg-linear-surface-2 text-xs text-linear-ink-subtle">
                <tr>
                  <th className="px-3 py-2 font-medium">ชื่อ pack</th>
                  <th className="px-3 py-2 font-medium">ราคา</th>
                  <th className="px-3 py-2 font-medium">ยอดที่กด</th>
                  <th className="px-3 py-2 font-medium">ยอดที่กด + fee</th>
                  <th className="px-3 py-2 font-medium">ช่องทางหลัก</th>
                  <th className="px-3 py-2 font-medium">ช่องทางรอง</th>
                  <th className="px-3 py-2 font-medium">ประเทศ</th>
                  {computedColumns.map((fc) => (
                    <th key={fc.key} className="whitespace-nowrap px-3 py-2 font-medium">
                      {fc.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {category.packs.map((pack) => (
                  <tr key={pack.id} className="border-b border-linear-hairline last:border-b-0">
                    <td className="max-w-[220px] truncate px-3 py-2 text-linear-ink-muted">
                      {pack.name || "-"}
                    </td>
                    <td className="px-3 py-2 text-linear-ink-muted">{pack.price || "-"}</td>
                    <td className="px-3 py-2 text-linear-ink-muted">{pack.amountCharged || "-"}</td>
                    <td className="px-3 py-2 text-linear-ink-muted">{pack.amountChargedFee || "-"}</td>
                    <td className="px-3 py-2 text-linear-ink-muted">
                      {pack.channelsMain?.length ? pack.channelsMain.join(", ") : "-"}
                    </td>
                    <td className="px-3 py-2 text-linear-ink-muted">
                      {pack.channelsSecondary?.length ? pack.channelsSecondary.join(", ") : "-"}
                    </td>
                    <td className="px-3 py-2 text-linear-ink-muted">{pack.country || "-"}</td>
                    {computedColumns.map((fc) => {
                      const value = fc.ast
                        ? evaluateFormula(fc.ast, (label) => resolveGameinfoField(pack, game, label))
                        : null;
                      return (
                        <td key={fc.key} className="max-w-[160px] truncate px-3 py-2 text-linear-ink-muted">
                          {formatComputedCell(value, fc.type)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// Main and secondary channels labeled separately (not merged into one
// list), and secondary explicitly says "ไม่มี" when empty instead of just
// disappearing, so it's clear that side was checked and found empty.
function ChannelSummary({ channels, className = "" }) {
  const main = channels?.main || [];
  const secondary = channels?.secondary || [];
  return (
    <div className={`space-y-1 text-xs ${className}`}>
      <ChannelSummaryRow label="ช่องทางหลัก" tags={main} />
      <ChannelSummaryRow label="ช่องทางรอง" tags={secondary} />
    </div>
  );
}

function ChannelSummaryRow({ label, tags }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="shrink-0 text-linear-ink-tertiary">{label}:</span>
      {tags.length === 0 ? (
        <span className="text-linear-ink-tertiary">ไม่มี</span>
      ) : (
        tags.map((v) => (
          <span
            key={v}
            className="truncate rounded bg-linear-surface-3 px-1.5 py-0.5 text-[11px] text-linear-ink-muted"
          >
            {v}
          </span>
        ))
      )}
    </div>
  );
}
