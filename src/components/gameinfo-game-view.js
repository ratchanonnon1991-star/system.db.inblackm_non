"use client";

import { TablePagination, useTablePagination } from "@/components/table-pagination";
import { createContext, useContext, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeftRight, BookOpen, Bot, Boxes, Image as ImageIcon, Lock, Pencil, TriangleAlert } from "lucide-react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  buildGameinfoPackColumns,
  formatGameinfoPackColumnValue,
  isGameinfoPackColumnPinned,
  matchesGameinfoPackFilters,
} from "@/lib/gameinfo-pack-columns";
import { getGameinfoFormulaDisplay } from "@/lib/gameinfo-formula-overrides";
import { gameinfoChargeUnit, gameinfoCostRateRows } from "@/lib/gameinfo-channel-costs";
import { filterGameinfoColumnsForRole } from "@/lib/gameinfo-column-roles";
import { evaluateGameinfoComputedColumn } from "@/lib/gameinfo-computed-evaluator";
import { useGameinfoUnsavedChanges } from "@/lib/gameinfo-unsaved-changes";
import { gameinfoStableColorStyle } from "@/lib/gameinfo-stable-color";
import { gameinfoCountryDisplayName, gameinfoCountryThaiName } from "@/lib/gameinfo-countries";
import { isGameinfoBotAuto } from "@/lib/gameinfo-dashboard";
import { gameinfoGameColor, gameinfoGameInitials } from "@/lib/gameinfo-game-initials";
import { formatGameinfoPackExpiry, gameinfoPackExpiryWarning, GAMEINFO_PACK_STATUS_LABELS, GAMEINFO_PACK_STATUS_TONES, gameinfoPackDatePassed, gameinfoPackStatus } from "@/lib/gameinfo-pack-model";
import GameinfoFormulaModeToggle from "./gameinfo-formula-mode-toggle";
import GameinfoCostRates from "./gameinfo-cost-rates";
import { useGameinfoRates } from "./gameinfo-rate-panel";
import GameinfoImagePreview from "./gameinfo-image-preview";
import GameinfoTutorialButton, { GameinfoDetailsButton } from "./gameinfo-tutorial-modal";
import { GameinfoGameLinkButtons } from "./gameinfo-game-links";
import GameinfoPriorityStars, { GameinfoWebBadge } from "./gameinfo-priority-stars";
import {
  GameinfoPackColumnControls,
  useGameinfoPackColumnLayout,
} from "./gameinfo-pack-column-layout";
import GameinfoFold from "./gameinfo-fold";
import { GameinfoCeoNotice } from "./gameinfo-edit-gate";
import GameinfoPackList, { GAMEINFO_SHOW_BOT_PACKS } from "./gameinfo-pack-list";
import "./gameinfo-game-detail.css";

// One game's game_list row, read-only (editing region/platform/server/etc.
// happens on the list table or the pack editor, not here — see
// gameinfo-gamelist-table.js and GameinfoPackEditor) plus its packs — same
// currencies/computedColumns tree the pack editor saves to gamelist_packs,
// so what's shown here always matches what "จัดการแพ็ก" last saved.
// A stable empty list: a fresh [] as the default would be a new dependency
// on every render for the memos below.
const NO_COLUMNS = [];

// The columns used to be parsed here first, once per column per render, into
// a tree nothing ever read — on top of the parse the evaluator did per cell.
// The evaluator caches by formula text now (gameinfo-computed-evaluator.js)
// and a broken formula is reported in the cell, where a reader can see it.
// What is left in stock per GameInfo pack name (src/server/stock-repository.js
// listStockForGame), read by the pack name cell.
const StockContext = createContext({});
const NO_STOCK = { accounts: [], byPack: {} };

export default function GameinfoGameView({ row, currencies, computedColumns = NO_COLUMNS, costProfiles = [], formulaVariables = [], userId, dataMode = "uid", hiddenColumnKeys = [], editHref = null, stock = NO_STOCK, stockLinks = false, costRatesOther = null, columnOrder = null, topupView = false, verify = null }) {
  const [formulaMode, setFormulaMode] = useState("result");
  // The list is the page; the full table stays one switch away for the
  // columns, presets and formulas it carries.
  const [packLayoutMode, setPackLayoutMode] = useState("list");
  const rateState = useGameinfoRates();
  // Same field set the pack editor's formulas can reference (see
  // gameinfo-formula-fields.js) — built from the game_list row, not the
  // gamelist_packs game shape, since that's all this page has.
  const formulaGame = useMemo(
    () => ({ gameName: row.game, region: row.region, platform: row.platform, server: row.server }),
    [row.game, row.region, row.platform, row.server]
  );
  // Columns this viewer's role is not meant to see never reach the table, so
  // nothing downstream — widths, filters, presets — has to know about roles.
  // Main and secondary channels are two columns in the editor because they are
  // edited separately, but a reader is looking at one thing — where this pack
  // is topped up — and the second column is empty for most packs. Here they
  // share one column with a switch, so the table stays narrow and the presence
  // of a second channel is stated rather than left to be noticed.
  const [channelView, setChannelView] = useState("main");
  const packColumns = useMemo(() => {
    const roleColumns = filterGameinfoColumnsForRole(
      buildGameinfoPackColumns(computedColumns, columnOrder),
      new Set(hiddenColumnKeys)
    );
    const secondary = channelView === "secondary";
    return roleColumns
      .filter((column) => column.id !== "channelsSecondary")
      .map((column) => (column.id === "channelsMain"
        // The id stays channelsMain so saved layouts and filters keep working;
        // only which field it reads changes.
        ? {
            ...column,
            field: secondary ? "channelsSecondary" : "channelsMain",
            label: secondary ? "ช่องทางรอง" : "ช่องทางหลัก",
            channelToggle: true,
          }
        : column));
  }, [computedColumns, columnOrder, hiddenColumnKeys, channelView]);
  const hasSecondaryChannels = useMemo(
    () => currencies.some((currency) => currency.categories.some((category) =>
      category.packs.some((pack) => (pack.channelsSecondary || []).length > 0)
    )),
    [currencies]
  );
  // Every column is registered for every game, and this page shows them all,
  // filled or not, so every game reads with the same columns (the user asked
  // for this on 2026-11-04). Role rules and presets can still hide one.
  const packLayout = useGameinfoPackColumnLayout({
    columns: packColumns,
    userId,
    gameId: row.id,
    surface: "view",
  });
  useGameinfoUnsavedChanges(packLayout.dirty);

  const currencyList = currencies || [];
  const [currencyId, setCurrencyId] = useState(currencyList[0]?.id);
  const activeCurrency = currencyList.find((currency) => currency.id === currencyId) || currencyList[0];
  // The sheet heads these with the currency ("MMK ที่กด", "MMK รวม Fee"); so
  // does this table when the tab's packs are all charged in one.
  const chargeUnit = gameinfoChargeUnit(activeCurrency, costProfiles);
  const withChargeUnit = (columns) => (chargeUnit ? columns.map((column) => {
    if (column.id === "amountBeforeFee") return { ...column, label: `${chargeUnit} ที่กด` };
    return column.id === "amountChargedFee" ? { ...column, label: `${chargeUnit} รวม Fee` } : column;
  }) : columns);
  // The list reads every column this view may see, in the admin's order;
  // presets only shape the full table.
  const listColumns = packLayout.orderedColumns;
  const listContext = useMemo(
    () => ({ costProfiles, formulaVariables, externalValues: rateState.externalValues }),
    [costProfiles, formulaVariables, rateState.externalValues]
  );
  const packCount = activeCurrency ? countPacks(activeCurrency) : 0;
  const packWallets = (row.channels?.main || []).join(", ");
  const packCountry = gameinfoCountryThaiName(mostCommon(
    (activeCurrency?.categories || []).flatMap((category) => category.packs.map((pack) => pack.country)).filter(Boolean)
  ));
  const listMode = packLayoutMode === "list";
  const costRates = costRatesOther ? (
    <GameinfoCostRates
      currencies={currencies}
      costProfiles={costProfiles}
      formulaVariables={formulaVariables}
      externalValues={rateState.externalValues}
      other={costRatesOther}
    />
  ) : null;

  return (
    <>
      <GameHero row={row} dataMode={dataMode} editHref={editHref} />
      <GameinfoCeoNotice className={verify?.className || ""} />

      {/* The bot tops up from these prices, so a slip goes straight to a customer. */}
      {isGameinfoBotAuto(row.botManual) ? (
        <button type="button" className="gd-autotop" onClick={showBotPacks}>
          <span className="a-ic"><Bot size={22} aria-hidden="true" /></span>
          <span className="atx">
            <b>ระวัง แก้ไขแล้วบอทเติมตามทันที</b>
            <small>เกมนี้เติมอัตโนมัติด้วย Bot Auto ตรวจชื่อ ราคา และจำนวนให้ถูกก่อนกดบันทึก</small>
          </span>
          <span className="go"><span className="gd-lg">ดูแพ็ค </span>Bot Auto</span>
        </button>
      ) : null}

      {/* The full warning opens only from this strip. */}
      {row.hasWarning ? (
        <GameinfoTutorialButton
          gameId={row.id}
          gameName={row.game}
          editable={false}
          hasData={row.hasWarning}
          variant="warning"
          dataMode={dataMode}
          className="gd-alert"
        >
          <span className="a-ic"><TriangleAlert size={18} strokeWidth={2.2} aria-hidden="true" /></span>
          <span className="a-tx">
            <b>เกมนี้มีข้อควรระวัง อ่านก่อนทำรายการทุกครั้ง</b>
            <small>กดเพื่ออ่านและทำตามขั้นตอนก่อนทำรายการ</small>
          </span>
          <span className="go">อ่านข้อควรระวัง</span>
        </GameinfoTutorialButton>
      ) : null}

      <GameinfoFold
        id="price"
        icon="layers"
        tone="red"
        title="แพ็คและราคา"
        subtitle={[`${packCount} แพ็ค`, packWallets, packCountry, row.sourceNote ? `แหล่งที่มา: ${row.sourceNote}` : ""].filter(Boolean).join(" · ")}
      >
        {listMode && currencyList.length < 2 ? null : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {currencyList.length > 1 ? (
              <div role="group" aria-label="สกุลที่เติม" className="gd-seg red">
                {currencyList.map((currency) => (
                  <button
                    key={currency.id}
                    type="button"
                    aria-pressed={currency.id === activeCurrency?.id}
                    onClick={() => setCurrencyId(currency.id)}
                  >
                    {currency.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={currency.image} alt="" className="h-5 w-5 rounded object-cover" />
                    ) : null}
                    {currency.name || "(ไม่มีชื่อสกุลเงิน)"}
                    <span className="text-[11px] opacity-80">{countPacks(currency)}</span>
                  </button>
                ))}
              </div>
            ) : null}
            {listMode ? null : (
              <div role="group" aria-label="รูปแบบการแสดงแพ็ค" className="gd-seg">
                <button type="button" aria-pressed={listMode} onClick={() => setPackLayoutMode("list")}>รายการ</button>
                <button type="button" aria-pressed={!listMode} onClick={() => setPackLayoutMode("table")}>ตารางเต็ม</button>
              </div>
            )}
          </div>
          {listMode ? null : (
            <div className="flex flex-wrap items-center gap-2">
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
                onSetVisible={packLayout.setVisible}
                onFiltersChange={packLayout.setFilters}
                onReset={packLayout.reset}
                onSelectPreset={packLayout.selectPreset}
                onPresetNameChange={packLayout.setPresetName}
                onSavePreset={packLayout.savePreset}
              />
            </div>
          )}
        </div>
        )}
        {listMode ? null : <ChannelSummary channels={row.channels} botManual={row.botManual} />}
        {listMode ? null : <StockSummary accounts={stock.accounts} links={stockLinks} />}
        {!activeCurrency ? (
          <p className="gd-empty">ยังไม่มีข้อมูลแพ็กสำหรับเกมนี้</p>
        ) : listMode ? (
          <GameinfoPackList
            key={activeCurrency.id}
            currency={activeCurrency}
            columns={listColumns}
            game={formulaGame}
            context={listContext}
            topupView={topupView}
            chargeUnit={chargeUnit}
            stock={stock.byPack}
            verify={verify}
            botAuto={isGameinfoBotAuto(row.botManual)}
            className={verify?.className || ""}
            beforeList={(
              <>
                <StockSummary accounts={stock.accounts} links={stockLinks} />
                {costRatesOther ? (
                  <CostRateFold
                    currencies={currencies}
                    costProfiles={costProfiles}
                    formulaVariables={formulaVariables}
                    externalValues={rateState.externalValues}
                    other={costRatesOther}
                  />
                ) : null}
              </>
            )}
            hintAction={(
              <button type="button" className="gd-btn sm" onClick={() => setPackLayoutMode("table")}>ดูแบบตารางเต็ม</button>
            )}
          />
        ) : (
          <>
          {costRates}
          <div className="overflow-hidden rounded-2xl border border-[color:var(--gd-line2)] bg-linear-surface-1">
          <StockContext.Provider value={stock.byPack}>
          <PackCurrency
            key={activeCurrency.id}
            gameId={row.id}
            currency={activeCurrency}
            game={formulaGame}
            columns={withChargeUnit(packLayout.visibleColumns)}
            allColumns={withChargeUnit(packLayout.orderedColumns)}
            filters={packLayout.layout.filters}
            formulaMode={formulaMode}
            costProfiles={costProfiles}
            formulaVariables={formulaVariables}
            externalValues={rateState.externalValues}
            onReorderColumns={packLayout.reorder}
            channelView={channelView}
            hasSecondaryChannels={hasSecondaryChannels}
            onToggleChannelView={() =>
              setChannelView((current) => (current === "secondary" ? "main" : "secondary"))
            }
          />
          </StockContext.Provider>
          </div>
          </>
        )}
      </GameinfoFold>
    </>
  );
}

function showBotPacks() {
  window.dispatchEvent(new Event(GAMEINFO_SHOW_BOT_PACKS));
}

function countPacks(currency) {
  return currency.categories.reduce((total, category) => total + category.packs.length, 0);
}

function mostCommon(values) {
  const counts = new Map();
  values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

const rateText = (rate) => (rate == null || rate === "" || !Number.isFinite(Number(rate))
  ? "ยังคิดไม่ได้"
  : Number(rate).toLocaleString("en-US", { maximumFractionDigits: 6 }));

// The list's rate box: one line per wallet, this mode's in bold, and the
// open mode's main wallet as the folded title.
function CostRateFold({ currencies, costProfiles, formulaVariables, externalValues, other }) {
  const rows = useMemo(
    () => gameinfoCostRateRows(currencies, costProfiles, { formulaVariables, externalValues, other }),
    [currencies, costProfiles, formulaVariables, externalValues, other]
  );
  const ownIds = useMemo(
    () => new Set(gameinfoCostRateRows(currencies, costProfiles, { formulaVariables, externalValues }).map((rate) => rate.id)),
    [currencies, costProfiles, formulaVariables, externalValues]
  );
  if (!rows.length) return null;
  const main = rows.find((rate) => ownIds.has(rate.id)) || rows[0];
  const updated = rows.map((rate) => rate.updatedAt).filter(Boolean).sort().at(-1);
  const updatedText = updated && !Number.isNaN(new Date(updated).getTime())
    ? new Date(updated).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok" })
    : "";
  return (
    <GameinfoFold sub id="rates" title="เรทต้นทุนที่ใช้" subtitle={`${main.channel}: 1 ${main.currency || "หน่วย"} = ฿${rateText(main.rate)}`} defaultClosed>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-4 gap-y-2 text-[13px]">
        {rows.map((rate) => [
          <span key={`${rate.id}-n`} className={`truncate ${ownIds.has(rate.id) ? "font-semibold" : ""}`} title={rate.source}>{rate.channel}</span>,
          <span key={`${rate.id}-r`} className="text-right tabular-nums">1 {rate.currency || "หน่วย"} = {rateText(rate.rate)}</span>,
          <span key={`${rate.id}-p`} className="gd-note text-right">{rate.packs} แพ็ค</span>,
        ])}
      </div>
      <span className="gd-note">{updatedText ? `แก้ล่าสุด ${updatedText} · ` : ""}เรทนี้ใช้คำนวณต้นทุนของแพ็คทั้งหมด</span>
    </GameinfoFold>
  );
}

const HERO_STATUS = {
  online: { label: "พร้อมใช้งาน", tone: "green" },
  partial: { label: "เปิดบางแพ็ค", tone: "amber" },
  offline: { label: "ปิดใช้งาน", tone: "" },
};

// Image (or initials), name with region and the status badges, and the
// game's own links — what a topup person checks before anything else.
function GameHero({ row, dataMode, editHref }) {
  const status = HERO_STATUS[row.serviceStatus] || HERO_STATUS.online;
  const meta = [`ID ${row.id}`, row.orderPosition ? `ลำดับ ${row.orderPosition}` : null, row.platform, row.server ? `Server ${row.server}` : null, ...(row.tags || []), ...(row.publishers || [])]
    .filter(Boolean)
    .join(" · ");
  return (
    <section aria-labelledby="game-title" className="gd-card gd-hero">
      <div className={`gd-cover${row.serviceStatus === "offline" ? " off" : ""}`} style={row.image ? undefined : { background: gameinfoGameColor(row.id) }}>
        {row.image ? (
          <GameinfoImagePreview src={row.image} alt="" wrapperClassName="block h-full w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={row.image} alt="" className="h-full w-full object-cover" />
          </GameinfoImagePreview>
        ) : (
          <span aria-hidden="true">{gameinfoGameInitials(row.game)}</span>
        )}
      </div>
      <div className="gd-hero-main">
        <div className="gd-title">
          <h1 id="game-title">{row.game}</h1>
          {row.region ? <span className="gd-pill dark">{row.region}</span> : null}
          {row.priority ? <GameinfoPriorityStars value={row.priority} /> : null}
        </div>
        <div className="gd-meta">
          <span className={`gd-pill ${status.tone}`} title={row.serviceStatus === "partial" ? `ปิดอยู่ ${row.packDisabledCount} แพ็ค` : undefined}>
            <i className="d" aria-hidden="true" />{status.label}
          </span>
          <span>{meta}</span>
        </div>
      </div>
      <div className="gd-tags">
        <span className="gd-pill dark">{dataMode === "idpass" ? "ID-PASS" : "UID"}</span>
        {isGameinfoBotAuto(row.botManual) ? (
          <button type="button" className="gd-pill green gd-botpill" onClick={showBotPacks} title="ดูแพ็ค Bot Auto">
            <Bot size={12} aria-hidden="true" />{row.botManual}
          </button>
        ) : <span className="gd-pill">{row.botManual || "Manual"}</span>}
        {row.web ? <GameinfoWebBadge web={row.web} size="sm" /> : null}
        <span className={`gd-pill ${row.vpn === "YES" ? "amber" : ""}`}>{row.vpn === "YES" ? "ใช้ VPN" : "NO VPN"}</span>
      </div>
      <div className="gd-hero-act">
        {/* Always view-only here regardless of role — editing the
            tutorial happens on the manage page. */}
        <GameinfoDetailsButton
          gameId={row.id}
          gameName={row.game}
          editable={false}
          hasTutorial={row.hasTutorial}
          hasVpnNote={row.hasVpnNote}
          dataMode={dataMode}
          className="gd-btn red"
        >
          <BookOpen size={15} aria-hidden="true" /> วิธีเติม / ข้อมูลเกม
        </GameinfoDetailsButton>
        <GameinfoGameLinkButtons links={row.links || []} className="gd-btn" emptyClassName="gd-note" />
        {editHref ? (
          <Link
            href={editHref}
            // Same game, so it replaces this page in the history (see the
            // manage page's ดูหน้าผู้ใช้): back from the editor is the list.
            replace
            className="gd-btn"
          >
            <Pencil size={15} aria-hidden="true" /> แก้ไขข้อมูล
          </Link>
        ) : null}
      </div>
    </section>
  );
}

function PackCurrency({
  gameId,
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
  channelView,
  hasSecondaryChannels,
  onToggleChannelView,
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleColumnDragEnd({ active, over }) {
    if (over && active.id !== over.id) onReorderColumns(active.id, over.id);
  }

  // One table for the whole currency, a tinted row heading each category, so
  // the columns line up from the first category to the last.
  return (
    <div className="overflow-x-auto border-t border-linear-hairline">
      <DndContext
        id={`gameinfo-pack-${gameId}-${currency.id}`}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleColumnDragEnd}
      >
        <SortableContext
          items={columns.map((column) => column.id)}
          strategy={horizontalListSortingStrategy}
        >
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="bg-linear-surface-2 text-[11px] font-black uppercase tracking-[0.06em] text-linear-ink-muted">
              <tr>
                {columns.map((column) => (
                  <SortableViewHeader
                    key={column.id}
                    column={column}
                    channelView={channelView}
                    hasSecondaryChannels={hasSecondaryChannels}
                    onToggleChannelView={onToggleChannelView}
                  />
                ))}
              </tr>
            </thead>
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
              />
            ))}
          </table>
        </SortableContext>
      </DndContext>
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
}) {
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

  const pagination = useTablePagination(visiblePacks, { resetKey: JSON.stringify(filters) });
  return (
    <tbody>
      <tr className="border-t border-linear-hairline bg-[#FFF5F5] dark:bg-[#D90005]/10">
        <th colSpan={columns.length || 1} scope="rowgroup" className="px-5 py-2.5 text-left text-xs font-black uppercase tracking-[0.06em] text-[#B80004] dark:text-[#FF8A8C]">
          {category.name || "(ไม่มีชื่อหมวดหมู่)"}
          <span className="ml-2 font-bold normal-case tracking-normal text-linear-ink-tertiary">
            {visiblePacks.length === category.packs.length ? category.packs.length : `${visiblePacks.length}/${category.packs.length}`} แพ็ก
          </span>
        </th>
      </tr>
      {visiblePacks.length === 0 ? (
        <tr className="border-t border-linear-hairline">
          <td colSpan={columns.length || 1} className="px-5 py-3 text-xs text-linear-ink-tertiary">
            {category.packs.length === 0 ? "ยังไม่มี pack" : "ไม่มี pack ที่ตรงกับตัวกรอง"}
          </td>
        </tr>
      ) : (
        pagination.items.map((pack) => (
          <tr key={pack.id} className="border-t border-linear-hairline transition-colors hover:bg-[#FFF7F7] dark:hover:bg-white/[0.03]">
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
        ))
      )}
      {pagination.showControls && <tr><td colSpan={columns.length || 1}><TablePagination {...pagination} label={`แพ็ก ${category.name || "ไม่มีชื่อ"}`} /></td></tr>}
    </tbody>
  );
}

function SortableViewHeader({ column, channelView, hasSecondaryChannels, onToggleChannelView }) {
  const pinned = isGameinfoPackColumnPinned(column);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: column.id,
    disabled: pinned,
  });
  return (
    <th
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      {...(pinned ? {} : { ...attributes, ...listeners })}
      className={`whitespace-nowrap px-3 py-3 first:pl-5 ${
        pinned ? "cursor-default" : "cursor-grab active:cursor-grabbing"
      }`}
      title={pinned ? "คอลัมน์สถานะถูกตรึงไว้เป็นคอลัมน์แรก" : "กดค้างแล้วลากเพื่อเปลี่ยนลำดับ"}
    >
      <span className="inline-flex items-center gap-1">
        {pinned ? <Lock size={10} className="shrink-0" /> : null}
        {column.label}
        {column.channelToggle && hasSecondaryChannels ? (
          <button
            type="button"
            // Dragging reorders columns, so the button has to keep the drag
            // handlers on the header from swallowing its click.
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onToggleChannelView?.();
            }}
            title="เกมนี้มี 2 ช่องทาง — กดเพื่อสลับดูอีกช่องทาง"
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-linear-hairline-strong bg-linear-surface-1 px-2 py-0.5 text-[10px] font-medium text-linear-primary hover:bg-linear-surface-2"
          >
            <ArrowLeftRight size={9} />
            {channelView === "secondary" ? "ดูช่องทางหลัก" : "สลับช่องทางรอง"}
          </button>
        ) : null}
      </span>
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
    const status = gameinfoPackStatus(pack);
    const tone = GAMEINFO_PACK_STATUS_TONES[status];
    return (
      <td className={`px-3 py-2.5 first:pl-5 tabular-nums text-xs font-bold ${tone.text}`}>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <span className={`h-2 w-2 rounded-full ${tone.dot}`} />
          {GAMEINFO_PACK_STATUS_LABELS[status]}
        </span>
      </td>
    );
  }
  if (column.id === "expiresAt") {
    return (
      <td className={`whitespace-nowrap px-3 py-2.5 first:pl-5 tabular-nums ${gameinfoPackDatePassed(pack) ? GAMEINFO_PACK_STATUS_TONES.expired.text : "text-linear-ink-muted"}`}>
        <span className="inline-flex items-center gap-1.5">
          {formatGameinfoPackExpiry(pack.expiresAt) || "-"}
          <GameinfoPackExpiryWarning pack={pack} />
        </span>
      </td>
    );
  }
  if (column.id === "image") {
    return (
      <td className="px-3 py-2.5 first:pl-5">
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
          className={`max-w-[220px] px-3 py-2.5 first:pl-5 tabular-nums ${
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
        className={`max-w-[160px] truncate px-3 py-2.5 first:pl-5 tabular-nums ${
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
      <td className="max-w-[180px] truncate px-3 py-2.5 first:pl-5 tabular-nums text-linear-ink-muted">
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
      <td className="max-w-[220px] px-3 py-2.5 first:pl-5 tabular-nums text-linear-ink-muted">
        {values.length === 0 ? (
          "-"
        ) : (
          <span className="flex flex-wrap items-center gap-1">
            {values.map((item) => (
              <StableTag
                key={item}
                value={item}
                // Same trimmed country name the editor shows; the colour still
                // hashes the stored value, so both screens match either way.
                label={column.id === "country" ? gameinfoCountryDisplayName(item) : item}
              />
            ))}
          </span>
        )}
      </td>
    );
  }

  if (column.id === "name") return <PackNameCell pack={pack} />;
  if (column.id === "link") {
    const href = /^https?:\/\//i.test(pack.link || "") ? pack.link : /^www\./i.test(pack.link || "") ? `https://${pack.link}` : "";
    return (
      <td className="max-w-[220px] truncate px-3 py-2.5 first:pl-5 text-linear-ink-muted">
        {href ? <a href={href} target="_blank" rel="noreferrer" title={pack.link} className="font-bold text-[#D90005] underline dark:text-red-400">เปิดลิงก์</a> : pack.link || "-"}
      </td>
    );
  }
  const raw = pack[column.field];
  const value = Array.isArray(raw) ? (raw.length ? raw.join(", ") : "-") : raw || "-";
  // The pack name and the price are what a reader scans down the table for.
  const emphasis = column.id === "name"
    ? "font-extrabold text-linear-ink"
    : column.id === "price"
      ? "font-black text-linear-ink"
      : "text-linear-ink-muted";
  return (
    <td className={`max-w-[220px] truncate px-3 py-2.5 first:pl-5 tabular-nums ${emphasis}`}>
      {value}
    </td>
  );
}

function GameinfoPackExpiryWarning({ pack }) {
  const warning = gameinfoPackExpiryWarning(pack);
  if (!warning) return null;
  return <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] font-black text-amber-800 dark:text-amber-300">{warning}</span>;
}

function StableTag({ value, label = value, className = "text-xs" }) {
  return (
    <span
      style={gameinfoStableColorStyle(value)}
      className={`gameinfo-stable-tag inline-flex max-w-full truncate rounded border px-2 py-0.5 ${className}`}
      title={label}
    >
      {label}
    </span>
  );
}

// Main and secondary channels labeled separately (not merged into one
// list), and secondary explicitly says "ไม่มี" when empty instead of just
// disappearing, so it's clear that side was checked and found empty.
const STOCK_PILL = {
  ok: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
  low: "bg-amber-500/20 text-amber-900 dark:text-amber-300",
  empty: "bg-red-500/15 text-red-800 dark:text-red-300",
};

// The name, plus what is left in stock when a stock account carries this pack.
function PackNameCell({ pack }) {
  const stock = useContext(StockContext)[pack.name];
  return (
    <td className="max-w-[260px] px-3 py-2.5 first:pl-5 tabular-nums font-extrabold text-linear-ink">
      <span className="flex items-center gap-2">
        <span className="truncate">{pack.name || "-"}</span>
        {stock ? (
          <span
            title={`stock: ${stock.codes.join(", ")}`}
            className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-black ${STOCK_PILL[stock.tone]}`}
          >
            {stock.tone === "empty" ? "stock หมด" : `stock ${stock.left}`}
          </span>
        ) : null}
      </span>
    </td>
  );
}

function StockSummary({ accounts, links }) {
  if (!accounts?.length) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[13px]">
      <span className="flex items-center gap-1.5 text-linear-ink-tertiary">
        <Boxes size={15} aria-hidden="true" /> Stock ของเกมนี้
      </span>
      {accounts.map((account) => {
        const label = `${account.code} · ${account.leftTotal ? `คงเหลือ ${account.leftTotal} ชิ้น` : "ว่าง"}`;
        const className = "rounded-full border border-linear-hairline bg-linear-surface-1 px-3 py-1 font-bold text-linear-ink";
        return links ? (
          <Link key={account.code} href={`/stock/${account.code}`} className={`${className} hover:bg-linear-surface-3`}>{label}</Link>
        ) : (
          <span key={account.code} className={className}>{label}</span>
        );
      })}
    </div>
  );
}

function ChannelSummary({ channels, botManual }) {
  const main = channels?.main || [];
  const secondary = channels?.secondary || [];
  return (
    <div className="flex flex-wrap gap-2 text-[13px]">
      <ChannelSummaryRow label="ช่องทางหลัก" tags={main} />
      <ChannelSummaryRow label="ช่องทางรอง" tags={secondary} />
      <span className="flex items-center gap-1.5 rounded-lg bg-linear-surface-3 px-2.5 py-1.5">
        <span className="text-linear-ink-tertiary">ระบบการเติม</span>
        <strong className="font-extrabold text-linear-ink">{botManual || "Manual"}</strong>
      </span>
    </div>
  );
}

function ChannelSummaryRow({ label, tags }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-linear-surface-3 px-2.5 py-1.5">
      <span className="shrink-0 text-linear-ink-tertiary">{label}</span>
      {tags.length === 0 ? (
        <strong className="font-extrabold text-linear-ink-tertiary">ไม่มี</strong>
      ) : (
        tags.map((v) => (
          <StableTag key={v} value={v} className="text-[11px]" />
        ))
      )}
    </div>
  );
}
