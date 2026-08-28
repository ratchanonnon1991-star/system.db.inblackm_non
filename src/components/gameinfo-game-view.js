"use client";

import { useMemo, useState } from "react";
import { Gamepad2, Image as ImageIcon } from "lucide-react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { parseFormula } from "@/lib/gamedb-formula";
import {
  buildGameinfoPackColumns,
  formatGameinfoPackColumnValue,
  matchesGameinfoPackFilters,
} from "@/lib/gameinfo-pack-columns";
import { getGameinfoFormulaDisplay } from "@/lib/gameinfo-formula-overrides";
import { evaluateGameinfoComputedColumn } from "@/lib/gameinfo-computed-evaluator";
import { useGameinfoUnsavedChanges } from "@/lib/gameinfo-unsaved-changes";
import { gameinfoStableColorStyle } from "@/lib/gameinfo-stable-color";
import GameinfoFormulaModeToggle from "./gameinfo-formula-mode-toggle";
import { useGameinfoRates } from "./gameinfo-rate-panel";
import GameinfoImagePreview from "./gameinfo-image-preview";
import GameinfoTutorialButton, { GameinfoDetailsButton } from "./gameinfo-tutorial-modal";
import { GameinfoGameLinkButtons } from "./gameinfo-game-links";
import {
  GameinfoPackColumnControls,
  useGameinfoPackColumnLayout,
} from "./gameinfo-pack-column-layout";

// One game's game_list row, read-only (editing region/platform/server/etc.
// happens on the list table or the pack editor, not here — see
// gameinfo-gamelist-table.js and GameinfoPackEditor) plus its packs — same
// currencies/computedColumns tree the pack editor saves to gamelist_packs,
// so what's shown here always matches what "จัดการแพ็ก" last saved.
export default function GameinfoGameView({ row, currencies, computedColumns, costProfiles = [], formulaVariables = [], userId, dataMode = "uid" }) {
  const [formulaMode, setFormulaMode] = useState("result");
  const rateState = useGameinfoRates();
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
  const packColumns = useMemo(() => buildGameinfoPackColumns(parsedColumns), [parsedColumns]);
  const packLayout = useGameinfoPackColumnLayout({
    columns: packColumns,
    userId,
    gameId: row.id,
    surface: "view",
  });
  useGameinfoUnsavedChanges(packLayout.dirty);

  return (
    <div>
      {/* Compact view card — icon, bold title, one-line Region/Platform/
          Server/VPN summary, pill button to the game's top-up website. */}
      <div className="mb-8 flex flex-col items-start gap-4 rounded-xl border border-linear-hairline bg-linear-surface-1 p-4 sm:flex-row sm:items-center">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-linear-primary/10 sm:h-[126px] sm:w-[126px]">
          {row.image ? (
            <GameinfoImagePreview src={row.image} alt="" wrapperClassName="block h-full w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={row.image} alt="" className="h-full w-full rounded-lg object-cover" />
            </GameinfoImagePreview>
          ) : (
            <Gamepad2 size={32} className="text-linear-primary" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                row.serviceStatus === "offline"
                  ? "bg-zinc-500"
                  : row.serviceStatus === "partial"
                    ? "bg-amber-400"
                    : "bg-emerald-400"
              }`}
              title={row.serviceStatus === "offline" ? "ปิดให้บริการ" : row.serviceStatus === "partial" ? "เปิดเกม แต่มีบาง pack ปิด" : "ให้บริการปกติ"}
            />
            <h1 className="truncate text-base font-bold uppercase tracking-tight text-linear-ink">
              {row.game}
            </h1>
          </div>
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
            <span>VPN: {row.vpn}</span>
            <span>Bot/Manual: {row.botManual || "-"}</span>
          </p>
          <ChannelSummary channels={row.channels} className="mt-1.5" />
          {(row.tags || []).length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {row.tags.map((tag) => <span key={tag} className="rounded-full bg-linear-surface-3 px-2 py-1 text-[11px] text-linear-ink-muted">{tag}</span>)}
            </div>
          ) : null}
          {(row.publishers || []).length ? (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-linear-ink-tertiary">ค่ายเกม</span>
              {row.publishers.map((publisher) => <span key={publisher} className="rounded-full bg-linear-surface-3 px-2 py-1 text-[11px] text-linear-ink-muted">{publisher}</span>)}
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <GameinfoGameLinkButtons links={row.links || []} />
            {/* Always view-only here regardless of role — editing the
                tutorial happens from the "⋮" menu / list table, not this
                page (see gameinfo-gamelist-table.js). */}
            <GameinfoDetailsButton
              gameId={row.id}
              gameName={row.game}
              editable={false}
              hasTutorial={row.hasTutorial}
              hasVpnNote={row.hasVpnNote}
              dataMode={dataMode}
            />
            <GameinfoTutorialButton
              gameId={row.id}
              gameName={row.game}
              editable={false}
              hasData={row.hasWarning}
              variant="warning"
              autoOpen={row.warningAutoOpen}
              autoOpenRevision={row.warningRevision}
              dataMode={dataMode}
            />
          </div>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-linear-ink">แพ็ก</h2>
        <div className="flex items-center gap-2">
          <GameinfoFormulaModeToggle
            mode={formulaMode}
            onChange={setFormulaMode}
            disabled={(computedColumns || []).length === 0}
          />
          <GameinfoPackColumnControls
            columns={packLayout.orderedColumns}
            hidden={packLayout.layout.hidden}
            filters={packLayout.layout.filters}
            presets={packLayout.presets}
            selectedPresetId={packLayout.selectedPresetId}
            presetName={packLayout.presetName}
            dirty={packLayout.dirty}
            presetLocked={packLayout.presetLocked}
            loading={packLayout.loading}
            saving={packLayout.saving}
            error={packLayout.error}
            notice={packLayout.notice}
            legacyDraft={packLayout.legacyDraft}
            onSetVisible={packLayout.setVisible}
            onFiltersChange={packLayout.setFilters}
            onReset={packLayout.reset}
            onSelectPreset={packLayout.selectPreset}
            onPresetNameChange={packLayout.setPresetName}
            onSavePreset={packLayout.savePreset}
          />
        </div>
      </div>
      {(currencies || []).length === 0 ? (
        <p className="rounded-lg border border-dashed border-linear-hairline-strong bg-linear-surface-1 p-8 text-center text-linear-ink-tertiary">
          ยังไม่มีข้อมูลแพ็กสำหรับเกมนี้
        </p>
      ) : (
        <div className="space-y-4">
          {currencies.map((currency) => (
            <PackCurrency
              key={currency.id}
              currency={currency}
              game={formulaGame}
              columns={packLayout.visibleColumns}
              allColumns={packLayout.orderedColumns}
              filters={packLayout.layout.filters}
              formulaMode={formulaMode}
              costProfiles={costProfiles}
              formulaVariables={formulaVariables}
              externalValues={rateState.externalValues}
              onReorderColumns={packLayout.reorder}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PackCurrency({
  currency,
  game,
  columns,
  allColumns,
  filters,
  formulaMode,
  costProfiles,
  formulaVariables,
  externalValues,
  onReorderColumns,
}) {
  return (
    <div className="rounded-lg border border-linear-hairline bg-linear-surface-1 p-4">
      <div className="mb-3 flex items-center gap-2">
        {currency.image ? (
          <GameinfoImagePreview src={currency.image} alt="">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={currency.image} alt="" className="h-6 w-6 shrink-0 rounded object-cover" />
          </GameinfoImagePreview>
        ) : null}
        <h3 className="font-medium text-linear-ink">{currency.name || "(ไม่มีชื่อสกุลเงิน)"}</h3>
      </div>
      <div className="space-y-3">
        {currency.categories.map((cat) => (
          <PackCategory
            key={cat.id}
            category={cat}
            game={game}
            columns={columns}
            allColumns={allColumns}
            filters={filters}
            formulaMode={formulaMode}
            costProfiles={costProfiles}
            formulaVariables={formulaVariables}
            externalValues={externalValues}
            onReorderColumns={onReorderColumns}
          />
        ))}
      </div>
    </div>
  );
}

// Per-pack thumbnail (pack.image, set in the pack editor's own image field —
// not to be confused with the currency-level image shown in PackCurrency's
// header) — click to zoom, same as the tutorial/pack-editor image previews.
function PackThumb({ src }) {
  if (!src) {
    return (
      <span className="flex h-8 w-8 items-center justify-center rounded bg-linear-surface-3 text-linear-ink-tertiary">
        <ImageIcon size={14} />
      </span>
    );
  }
  return (
    <GameinfoImagePreview src={src} alt="">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="h-8 w-8 rounded object-cover" />
    </GameinfoImagePreview>
  );
}

function PackCategory({
  category,
  game,
  columns,
  allColumns,
  filters,
  formulaMode,
  costProfiles,
  formulaVariables,
  externalValues,
  onReorderColumns,
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const visiblePacks = category.packs.filter((pack) =>
    matchesGameinfoPackFilters(pack, filters, (columnId, targetPack) => {
      const column = allColumns.find((item) => item.id === columnId);
      if (!column) return "";
      if (column.id === "costProfileId") {
        return costProfiles.find((profile) => profile.id === targetPack.costProfileId)?.label || "";
      }
      if (column.kind !== "computed") return targetPack[column.field];
      try {
        return evaluateGameinfoComputedColumn(
          column.computed,
          allColumns.filter((item) => item.kind === "computed").map((item) => item.computed),
          targetPack,
          game,
          { costProfiles, formulaVariables, externalValues, categoryId: category.id }
        );
      } catch {
        return "";
      }
    })
  );

  function handleColumnDragEnd({ active, over }) {
    if (over && active.id !== over.id) onReorderColumns(active.id, over.id);
  }

  return (
    <div className="p-3">
      <div className="mb-2 flex items-center gap-2">
        <h4 className="text-sm font-medium text-linear-ink-muted">{category.name || "(ไม่มีชื่อหมวดหมู่)"}</h4>
        <span className="text-xs text-linear-ink-tertiary">
          ({visiblePacks.length === category.packs.length ? category.packs.length : `${visiblePacks.length}/${category.packs.length}`} แพ็ก)
        </span>
      </div>
      {visiblePacks.length === 0 ? (
        <p className="px-1 py-2 text-xs text-linear-ink-tertiary">
          {category.packs.length === 0 ? "ยังไม่มี pack" : "ไม่มี pack ที่ตรงกับตัวกรอง"}
        </p>
      ) : (
        <div className="overflow-hidden rounded-md border border-linear-hairline bg-linear-surface-1">
          <div className="overflow-x-auto">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleColumnDragEnd}
            >
              <SortableContext
                items={columns.map((column) => column.id)}
                strategy={horizontalListSortingStrategy}
              >
                <table className="w-full min-w-[700px] text-left text-sm">
                  <thead className="border-b border-linear-hairline bg-linear-surface-2 text-xs text-linear-ink-subtle">
                    <tr>
                      {columns.map((column) => (
                        <SortableViewHeader key={column.id} column={column} />
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visiblePacks.map((pack) => (
                      <tr key={pack.id} className="border-b border-linear-hairline last:border-b-0">
                        {columns.map((column) => (
                          <PackViewCell
                            key={column.id}
                            column={column}
                            pack={pack}
                            categoryId={category.id}
                            game={game}
                            formulaMode={formulaMode}
                            costProfiles={costProfiles}
                            formulaVariables={formulaVariables}
                            externalValues={externalValues}
                            computedColumns={allColumns.filter((item) => item.kind === "computed").map((item) => item.computed)}
                          />
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </SortableContext>
            </DndContext>
          </div>
        </div>
      )}
    </div>
  );
}

function SortableViewHeader({ column }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: column.id,
  });
  return (
    <th
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      {...attributes}
      {...listeners}
      className="cursor-grab whitespace-nowrap px-3 py-2 font-medium active:cursor-grabbing"
      title="กดค้างแล้วลากเพื่อเปลี่ยนลำดับ"
    >
      {column.label}
    </th>
  );
}

function PackViewCell({
  column,
  pack,
  categoryId,
  game,
  formulaMode,
  costProfiles,
  formulaVariables,
  externalValues,
  computedColumns,
}) {
  if (column.id === "serviceEnabled") {
    const enabled = pack.serviceEnabled !== false;
    const isNew = pack.serviceStatus === "new";
    return (
      <td className={`px-3 py-2 text-xs ${isNew ? "text-red-400" : enabled ? "text-emerald-400" : "text-linear-ink-tertiary"}`}>
        <span className="inline-flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-full ${isNew ? "bg-red-500" : enabled ? "bg-emerald-400" : "bg-zinc-500"}`} />
          {isNew ? "ใหม่" : enabled ? "เปิด" : "ปิด"}
        </span>
      </td>
    );
  }
  if (column.id === "image") {
    return (
      <td className="px-3 py-2">
        <PackThumb src={pack.image} />
      </td>
    );
  }
  if (column.kind === "computed") {
    const formula = column.computed;
    const effective = getGameinfoFormulaDisplay(formula, pack.id, categoryId);
    let value = null;
    let formulaError = false;
    try {
      value = evaluateGameinfoComputedColumn(
        formula,
        computedColumns,
        pack,
        game,
        { costProfiles, formulaVariables, externalValues, categoryId }
      );
    } catch {
      formulaError = true;
    }
    if (formulaMode === "formula") {
      return (
        <td
          className={`max-w-[220px] px-3 py-2 ${
            formulaError ? "text-red-400" : "text-linear-ink-muted"
          }`}
          title={effective.formula}
        >
          <span className="block truncate font-mono text-[11px]">
            {effective.formula || "(ไม่มีสูตร)"}
          </span>
          <span
            className={`mt-0.5 inline-block text-[9px] ${
              effective.overridden ? "text-linear-primary" : "text-linear-ink-tertiary"
            }`}
          >
            {formulaError ? `สูตรผิด · ${effective.sourceLabel}` : effective.sourceLabel}
          </span>
        </td>
      );
    }
    return (
      <td
        className={`max-w-[160px] truncate px-3 py-2 ${
          formulaError ? "text-red-400" : "text-linear-ink-muted"
        }`}
        title={effective.sourceLabel}
      >
        {formulaError ? "สูตรผิด" : formatGameinfoPackColumnValue(value, column)}
      </td>
    );
  }
  if (column.id === "costProfileId") {
    const profile = costProfiles.find((item) => item.id === pack.costProfileId);
    return (
      <td className="max-w-[180px] truncate px-3 py-2 text-linear-ink-muted">
        {profile?.label || "-"}
      </td>
    );
  }
  // Country and channels carry the same name-derived colour as the pack editor
  // (gameinfo-stable-color.js), so the same channel reads as the same colour
  // whichever screen it is on. Channels are one tag per entry rather than a
  // joined string — a pack with several channels should show several colours.
  if (column.id === "country" || column.id === "channelsMain" || column.id === "channelsSecondary") {
    const raw = pack[column.field];
    const values = (Array.isArray(raw) ? raw : [raw]).filter((item) => String(item || "").trim());
    return (
      <td className="max-w-[220px] px-3 py-2 text-linear-ink-muted">
        {values.length === 0 ? (
          "-"
        ) : (
          <span className="flex flex-wrap items-center gap-1">
            {values.map((item) => (
              <StableTag key={item} value={item} />
            ))}
          </span>
        )}
      </td>
    );
  }

  const raw = pack[column.field];
  const value = Array.isArray(raw) ? (raw.length ? raw.join(", ") : "-") : raw || "-";
  return (
    <td className="max-w-[220px] truncate px-3 py-2 text-linear-ink-muted">
      {value}
    </td>
  );
}

function StableTag({ value, className = "text-xs" }) {
  return (
    <span
      style={gameinfoStableColorStyle(value)}
      className={`gameinfo-stable-tag inline-flex max-w-full truncate rounded border px-2 py-0.5 ${className}`}
      title={value}
    >
      {value}
    </span>
  );
}

// Main and secondary channels labeled separately (not merged into one
// list), and secondary explicitly says "ไม่มี" when empty instead of just
// disappearing, so it's clear that side was checked and found empty.
function ChannelSummary({ channels, className = "" }) {
  const main = channels?.main || [];
  const secondary = channels?.secondary || [];
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-xs ${className}`}>
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
          <StableTag key={v} value={v} className="text-[11px]" />
        ))
      )}
    </div>
  );
}
