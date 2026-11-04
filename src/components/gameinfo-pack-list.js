"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, ChevronDown, ChevronLeft, ChevronRight, ExternalLink, Image as ImageIcon, LayoutGrid, List, Plus, Search, X, ZoomIn, ZoomOut } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { setGameinfoFoldClosed } from "./gameinfo-fold";
import GameinfoPriceChannelEditor from "./gameinfo-price-channel-editor";
import { GameinfoPackVerifyButton, GameinfoPackVerifyDialog } from "./gameinfo-pack-verify";
import { GAMEINFO_LISTING_PRICE_CHANNEL, gameinfoListingEffective, gameinfoListingPack } from "@/lib/gameinfo-pack-listings";
import { apiJson } from "@/lib/api-json";
import {
  GAMEINFO_MARGIN_GOOD,
  GAMEINFO_MARGIN_LOW,
  GAMEINFO_PACK_LIST_STATUS_TABS,
  buildGameinfoPackListRows,
  filterGameinfoPackListRows,
  gameinfoColumnLooksBaht,
  gameinfoListRowColumns,
  gameinfoPriceChannelsWithColumn,
  gameinfoPackListStatusTab,
  gameinfoListNumber,
  gameinfoMarginTone,
  summarizeGameinfoPackList,
} from "@/lib/gameinfo-pack-list";
import { formatGameinfoPackColumnValue } from "@/lib/gameinfo-pack-columns";
import { formatGameinfoPackExpiry, gameinfoPackExpiryWarning, GAMEINFO_PACK_STATUS_LABELS } from "@/lib/gameinfo-pack-model";
import { gameinfoCountryDisplayName } from "@/lib/gameinfo-countries";
import { resolveGameinfoField } from "@/lib/gameinfo-formula-fields";

const num = (value, digits = 2) => (value === null || value === undefined ? "—" : Number(value).toLocaleString("en-US", { maximumFractionDigits: digits }));
const baht = (value) => (value === null || value === undefined ? "—" : `฿${num(value)}`);
const pct = (value) => (value === null || value === undefined ? "—" : `${num(value, 1)}%`);
const signedBaht = (value) => (value === null ? "—" : `${value < 0 ? "−" : "+"}฿${num(Math.abs(value))}`);

const STATUS_TONE = { open: "blue", new: "green", closed: "", expired: "red" };
// A pack this dear stands out in the list, so a slip on it is caught.
const HIGH_PRICE = 1000;
// How the packs are laid out: "list" rows, or "cards" in a grid as the TopUp
// site shows them. Each browser keeps its own choice.
const LAYOUT_KEY = "gameinfo-pack-layout";
function readLayout() {
  try {
    return window.localStorage.getItem(LAYOUT_KEY) === "cards" ? "cards" : "list";
  } catch {
    return "list";
  }
}
// Sent by the game card's Bot Auto notice: show the bot's packs.
export const GAMEINFO_SHOW_BOT_PACKS = "gameinfo:show-bot-packs";
const STOCK_TONE = { ok: "green", low: "amber", empty: "red" };

// The columns the row and its working-out already show; the rest go under
// "ข้อมูลอื่น" so nothing a column holds is lost to the shorter row.
const SHOWN_FIELDS = new Set([
  "serviceEnabled", "image", "name", "expiresAt", "amountReceived", "price",
  "amountBeforeFee", "amountChargedFee", "channelsMain", "channelsSecondary", "country", "priceUsd", "link",
]);

function packHref(link) {
  const text = String(link || "").trim();
  if (/^https?:\/\//i.test(text)) return text;
  return /^www\./i.test(text) ? `https://${text}` : "";
}

function listText(value) {
  const items = (Array.isArray(value) ? value : [value]).map((item) => String(item ?? "").trim()).filter(Boolean);
  return items.join(", ");
}

/**
 * A currency's packs as a list a person reads without scrolling sideways:
 * five numbers a row in the Product view (got, cost, and the chosen channel's
 * price, profit and margin), price, wallet and link in the Topup view.
 */
export default function GameinfoPackList({
  currency,
  columns,
  game,
  context,
  topupView = false,
  chargeUnit = "",
  stock = {},
  beforeList = null,
  hintAction = null,
  verify = null,
  botAuto = false,
  className = "",
  // { gameId, dataMode, configured, editable }: the game's own selling
  // channels (null: the built-in ones) and whether this viewer may set them.
  channelSetup = null,
  // The extra columns this view's rows show (null: the default); set on the
  // edit page, section มุมมองหน้าเกม.
  rowColumnKeys = null,
}) {
  const product = !topupView;
  const built = useMemo(
    () => buildGameinfoPackListRows(currency, columns, game, context, channelSetup?.configured ?? null),
    [currency, columns, game, context, channelSetup?.configured]
  );
  const { channels, costColumn } = built;
  // Bot Auto is set per game, so in a Bot Auto game every pack is the bot's.
  const rows = useMemo(() => built.rows.map((row) => ({ ...row, auto: botAuto })), [built.rows, botAuto]);
  const [channelChoice, setChannelChoice] = useState("page");
  const channel = channels.find((item) => item.key === channelChoice) || channels[0] || null;
  const channelKey = channel?.key || "page";
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState("all");
  const [status, setStatus] = useState("all");
  // The category tabs, as the TopUp site shows a game's packs: one category at a time, or all.
  const [categoryTab, setCategoryTab] = useState("all");
  const [lightbox, setLightbox] = useState(null);
  // false, true (the editor as it is) or "add" (with a new channel ready to name).
  const [editingChannels, setEditingChannels] = useState(false);
  const channelsEditable = Boolean(product && channelSetup?.editable);
  const router = useRouter();
  const [channelSaving, setChannelSaving] = useState("");
  const [channelError, setChannelError] = useState("");
  const priceColumns = useMemo(() => (columns || []).filter((column) => column.kind === "computed" && String(column.label ?? "").trim()), [columns]);
  // Picking a channel's price column in a pack's comparison sets it for the
  // whole game: one channel reads one column on every pack.
  async function setChannelColumn(key, column) {
    setChannelSaving(key);
    setChannelError("");
    try {
      await apiJson(`/api/gameinfo/gamelist/${channelSetup.gameId}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceChannels: { mode: channelSetup.dataMode, channels: gameinfoPriceChannelsWithColumn(channels, channelSetup.configured, key, column) } }),
        fallbackError: "บันทึกราคาขายของช่องทางไม่สำเร็จ",
      });
      router.refresh();
    } catch (error) {
      setChannelError(error instanceof Error ? error.message : "บันทึกราคาขายของช่องทางไม่สำเร็จ");
    } finally {
      setChannelSaving("");
    }
  }
  const channelPicker = channelsEditable
    ? { columns: priceColumns, saving: channelSaving, error: channelError, choose: setChannelColumn, add: () => setEditingChannels("add") }
    : null;
  const [layout, setLayoutState] = useState("list");
  useEffect(() => {
    // After hydration, so the server's "list" and the browser's choice never clash.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLayoutState(readLayout());
  }, []);
  function setLayout(next) {
    setLayoutState(next);
    try {
      window.localStorage.setItem(LAYOUT_KEY, next);
    } catch {
      // Private window: the choice lasts until the page closes.
    }
  }
  // The pack whose details are open in a window, in the card layout.
  const [detailPackId, setDetailPackId] = useState(null);
  const listRef = useRef(null);
  useEffect(() => {
    function showBotPacks() {
      setChip("bot");
      setStatus("all");
      setGameinfoFoldClosed("price", false);
      setTimeout(() => listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    }
    window.addEventListener(GAMEINFO_SHOW_BOT_PACKS, showBotPacks);
    return () => window.removeEventListener(GAMEINFO_SHOW_BOT_PACKS, showBotPacks);
  }, []);
  const [sort, setSort] = useState("default");
  const [open, setOpen] = useState(() => new Set());
  // Where each pack is listed for sale (gameinfo-pack-verify.js), kept here so
  // a save in the window updates the row's badge too.
  const [listings, setListings] = useState(() => verify?.listings || []);
  // Channels a pack is kept off although the game sells there.
  const [channelsOff, setChannelsOff] = useState(() => verify?.channelsOff || []);
  const [verifyPackId, setVerifyPackId] = useState(null);
  // A round runs out after an hour; this moves the badges along without a reload.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const listingsByPack = useMemo(() => {
    const byPack = new Map();
    for (const listing of listings) {
      if (!byPack.has(listing.packId)) byPack.set(listing.packId, []);
      byPack.get(listing.packId).push(listing);
    }
    return byPack;
  }, [listings]);
  const verifyRow = verifyPackId === null ? null : rows.find((row) => String(row.pack.id) === verifyPackId) || null;
  // Each listing as it stands against the pack's price for that channel now.
  // Only channels the game sells on count; a listing left on one it stopped
  // selling on stays stored but out of the badge.
  const soldOn = new Set((verify?.channels || []).map((item) => item.key));
  const offKeys = new Set(channelsOff.map((item) => `${item.packId}\u0000${item.channel}`));
  const isOff = (row, channel) => offKeys.has(`${row.pack.id}\u0000${channel}`);
  const offChannelsFor = (row) => new Set([...soldOn].filter((channel) => isOff(row, channel)));
  const channelCountFor = (row) => [...soldOn].filter((channel) => !isOff(row, channel)).length;
  // A check holds the pack to its cost rate as well (gameinfo-pack-listings.js).
  const listingPack = (row) => gameinfoListingPack(row.pack, resolveGameinfoField(row.pack, game, "อัตราต้นทุน", context));
  const listingsFor = (row) => (listingsByPack.get(String(row.pack.id)) || []).filter((listing) => soldOn.has(listing.channel) && !isOff(row, listing.channel)).map((listing) => {
    const key = GAMEINFO_LISTING_PRICE_CHANNEL[listing.channel];
    return gameinfoListingEffective(listing, key ? row.channels[key]?.price ?? null : null, now, listingPack(row));
  });

  const inCategory = categoryTab === "all" ? rows : rows.filter((row) => String(row.category.id) === categoryTab);
  const visible = filterGameinfoPackListRows(inCategory, { query, chip, status, sort, channel: channelKey });
  const summary = product ? summarizeGameinfoPackList(visible, channelKey) : null;
  const lowCount = product ? rows.filter((row) => (row.channels[channelKey]?.margin ?? Infinity) < GAMEINFO_MARGIN_LOW).length : 0;
  const categories = currency?.categories || [];
  const chips = [
    { id: "all", label: "ทั้งหมด", count: rows.length },
    ...(botAuto ? [{ id: "bot", label: "Bot Auto", count: rows.filter((row) => row.auto).length }] : []),
    ...(product ? [{ id: "low", label: "กำไรต่ำ", count: lowCount }] : []),
  ];
  const statusCounts = { all: rows.length };
  rows.forEach((row) => { statusCounts[gameinfoPackListStatusTab(row)] = (statusCounts[gameinfoPackListStatusTab(row)] || 0) + 1; });
  const gotField = rows.some((row) => String(row.pack.amountReceived ?? "").trim()) ? "amountReceived" : rows.some((row) => String(row.pack.priceUsd ?? "").trim()) ? "priceUsd" : "";
  const gotLabel = gotField === "priceUsd" ? "USD" : "ได้รับ";
  // Columns people added show in the rows too (gameinfoListRowColumns).
  const rowColumns = gameinfoListRowColumns(columns, rowColumnKeys);
  const tracks = [
    "minmax(150px,1fr)",
    gotField ? "72px" : null,
    ...(product ? ["88px", "112px", "96px", "78px"] : ["96px", "170px", "120px"]),
    ...rowColumns.map(() => "96px"),
    "28px",
  ].filter(Boolean).join(" ");
  // Packs stay under their category headings through search, chips and status
  // tabs; only a sort by margin or price lists them as one run.
  const grouped = sort === "default";

  const shownIds = new Set([costColumn?.id, ...channels.map((item) => item.priceColumn?.id)].filter(Boolean));
  rowColumns.forEach((column) => shownIds.add(column.id));
  const otherColumns = (columns || []).filter((column) => !shownIds.has(column.id) && !(column.kind !== "computed" && SHOWN_FIELDS.has(column.id)));

  function toggle(packId) {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(packId)) next.delete(packId);
      else next.add(packId);
      return next;
    });
  }

  function item(row) {
    return (
      <PackItem
        key={row.pack.id}
        row={row}
        product={product}
        tracks={tracks}
        gotField={gotField}
        channel={channel}
        channels={channels}
        costColumn={costColumn}
        otherColumns={otherColumns}
        rowColumns={rowColumns}
        chargeUnit={chargeUnit}
        context={context}
        stock={stock[row.pack.name]}
        open={open.has(row.pack.id)}
        onToggle={() => toggle(row.pack.id)}
        listings={verify ? listingsFor(row) : null}
        channelCount={channelCountFor(row)}
        onVerify={() => setVerifyPackId(String(row.pack.id))}
        onImage={() => setLightbox(visible.indexOf(row))}
        channelPicker={channelPicker}
      />
    );
  }

  function card(row) {
    return (
      <PackCard
        key={row.pack.id}
        row={row}
        product={product}
        channel={channel}
        gotField={gotField}
        stock={stock[row.pack.name]}
        listings={verify ? listingsFor(row) : null}
        channelCount={channelCountFor(row)}
        rowColumns={rowColumns}
        onOpen={() => setDetailPackId(String(row.pack.id))}
        onVerify={() => setVerifyPackId(String(row.pack.id))}
      />
    );
  }
  const detailRow = detailPackId === null ? null : rows.find((row) => String(row.pack.id) === detailPackId) || null;

  return (
    <>
      <div className="gd-ctrl">
        {/* Setting the channels up is on the edit page (ช่องทางดูกำไร). */}
        {product && channels.length > 1 ? (
          <div className="flex flex-col gap-1.5">
            <span className="gd-lbl">ดูกำไรของช่องทาง</span>
            {channels.length ? (
              <div className="gd-seg red fill" role="group" aria-label="ช่องทางขาย">
                {channels.map((item) => (
                  <button key={item.key} type="button" aria-pressed={item.key === channelKey} onClick={() => setChannelChoice(item.key)}>
                    {item.short}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        {editingChannels ? (
          <GameinfoPriceChannelEditor
            gameId={channelSetup.gameId}
            dataMode={channelSetup.dataMode}
            configured={channelSetup.configured}
            // The list starts from what the bar shows; a saved list keeps
            // channels whose column is gone too, so they can be fixed here.
            initial={channelSetup.configured || channels.map((item) => ({ key: item.key, label: item.short, column: item.priceColumn?.label || "" }))}
            startWithNewRow={editingChannels === "add"}
            columnLabels={(columns || []).filter((column) => column.kind === "computed").map((column) => String(column.label ?? "")).filter(Boolean)}
            onClose={() => setEditingChannels(false)}
          />
        ) : null}
        <div className="gd-ctrl-row">
          <label className="gd-search">
            <Search size={16} aria-hidden="true" />
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาชื่อแพ็ค" aria-label="ค้นหาแพ็ค" />
          </label>
          {product ? (
            <span className="gd-selw">
              <select className="gd-sel" value={sort} onChange={(event) => setSort(event.target.value)} aria-label="เรียงลำดับ">
                <option value="default">เรียง: ตามเกม</option>
                <option value="margin-asc">กำไร % ต่ำ → สูง</option>
                <option value="margin-desc">กำไร % สูง → ต่ำ</option>
                <option value="price">ราคาขาย ต่ำ → สูง</option>
              </select>
            </span>
          ) : null}
        </div>
        {chips.length > 1 ? (
          <div className="gd-chipbar" role="group" aria-label="กรองแพ็ค">
            {chips.map((option) => (
              <button key={option.id} type="button" className={`gd-chip${option.id === "bot" ? " bot" : ""}`} aria-pressed={chip === option.id} onClick={() => setChip(option.id)}>
                {option.id === "bot" ? <Bot size={14} aria-hidden="true" /> : null}
                {option.label} <span className="cnt">{option.count}</span>
              </button>
            ))}
          </div>
        ) : null}
        <div className="gd-seg red fill" role="group" aria-label="สถานะแพ็ค">
          {GAMEINFO_PACK_LIST_STATUS_TABS.map((tab) => (
            <button key={tab.id} type="button" aria-pressed={status === tab.id} onClick={() => setStatus(tab.id)}>
              {tab.label} <span className="cnt">{statusCounts[tab.id] || 0}</span>
            </button>
          ))}
        </div>
      </div>

      {product && summary ? (
        <div>
          <div className="gd-sum">
            <div className="gd-sbox">
              <small>กำไรเฉลี่ย</small>
              <b className={toneText(summary.average)}>{pct(summary.average)}</b>
              <span>{summary.count} แพ็ค</span>
            </div>
            <div className="gd-sbox">
              <small>ต่ำสุด</small>
              <b className={toneText(summary.lowest.channels[channelKey].margin)}>{pct(summary.lowest.channels[channelKey].margin)}</b>
              <span title={summary.lowest.pack.name}>{summary.lowest.pack.name}</span>
            </div>
            <div className="gd-sbox">
              <small>ต่ำกว่า {GAMEINFO_MARGIN_LOW}%</small>
              <b>{summary.low} แพ็ค</b>
              <span>{summary.low ? "กรองด้านบน" : "ไม่มี"}</span>
            </div>
          </div>
          <div className="gd-legend mt-2">
            <span><i style={{ background: "var(--gd-green)" }} />≥{GAMEINFO_MARGIN_GOOD}% ดี</span>
            <span><i style={{ background: "var(--gd-amber)" }} />{GAMEINFO_MARGIN_LOW}–{GAMEINFO_MARGIN_GOOD}% พอใช้</span>
            <span><i style={{ background: "var(--gd-red)" }} />&lt;{GAMEINFO_MARGIN_LOW}% ต่ำ</span>
          </div>
        </div>
      ) : null}
      {!product && rows.length ? <TopupSummary rows={visible.length ? visible : rows} total={rows.length} /> : null}

      {beforeList}

      {/* Right above the packs, as the TopUp site puts them. */}
      {categories.length && rows.length ? (
        <div className="gd-cattabs" role="group" aria-label="หมวดหมู่แพ็ค">
          {[{ id: "all", name: "ทั้งหมด" }, ...categories].map((category) => (
            <button
              key={category.id}
              type="button"
              className="gd-cattab"
              aria-pressed={categoryTab === String(category.id)}
              onClick={() => setCategoryTab(String(category.id))}
            >
              {category.name || "(ไม่มีชื่อหมวดหมู่)"}
            </button>
          ))}
        </div>
      ) : null}

      {!rows.length ? (
        <div className="gd-empty"><b>ยังไม่มีแพ็คในสกุลนี้</b></div>
      ) : !visible.length ? (
        <div className="gd-empty">
          <span className="eic"><Search size={22} aria-hidden="true" /></span>
          <b>ไม่พบแพ็คที่ตรงเงื่อนไข</b>
          <span>ลองล้างคำค้นหา หรือเลือก “ทั้งหมด”</span>
          <button type="button" className="gd-btn sm" onClick={() => { setQuery(""); setChip("all"); setStatus("all"); setCategoryTab("all"); }}>ล้างตัวกรอง</button>
        </div>
      ) : (
        <div ref={listRef} className="scroll-mt-20">
          {chip === "bot" ? <BotCallout /> : null}
          <div className="mb-2 ml-0.5 flex flex-wrap items-center justify-between gap-2">
            <p className="gd-note m-0">{product ? "แตะแพ็คเพื่อดูวิธีคำนวณและเทียบช่องทาง" : "แตะแพ็คเพื่อดูรายละเอียด"}</p>
            <div className="flex flex-wrap items-center gap-2">
              <div className="gd-seg" role="group" aria-label="รูปแบบการแสดงแพ็ค">
                <button type="button" aria-pressed={layout === "list"} onClick={() => setLayout("list")} title="แสดงเป็นรายการ">
                  <List size={15} aria-hidden="true" /> รายการ
                </button>
                <button type="button" aria-pressed={layout === "cards"} onClick={() => setLayout("cards")} title="แสดงเป็นการ์ดแบบหน้าเว็บ inblackm">
                  <LayoutGrid size={15} aria-hidden="true" /> แบบเว็บ
                </button>
              </div>
              {hintAction}
            </div>
          </div>
          {layout === "cards" ? (
            grouped && categories.length > 1 ? (
              <div className="gd-cgroups">
                {categories.map((category) => {
                  const items = visible.filter((row) => row.category.id === category.id);
                  if (!items.length) return null;
                  return (
                    <section key={category.id} className="gd-cgroup">
                      <h4 className="gd-cgtitle">{category.name || "(ไม่มีชื่อหมวดหมู่)"}<span>{items.length} แพ็ค</span></h4>
                      <div className="gd-packcards">{items.map(card)}</div>
                    </section>
                  );
                })}
              </div>
            ) : (
              <div className="gd-packcards">{visible.map(card)}</div>
            )
          ) : (
          <div className="gd-list">
            <div className="gd-lh" style={{ "--cols": tracks }} aria-hidden="true">
              <span>แพ็ค</span>
              {gotField ? <span className="r">{gotLabel}</span> : null}
              {product ? (
                <>
                  <span className="r">ต้นทุน</span>
                  <span className="r">ราคาขาย</span>
                  <span className="r">กำไร</span>
                  <span className="r">กำไร %</span>
                </>
              ) : (
                <>
                  <span className="r">ราคา</span>
                  <span>ช่องทางเติม</span>
                  <span className="r">ลิงก์</span>
                </>
              )}
              {rowColumns.map((column) => <span key={column.id} className="r gd-lh-x" title={column.label}>{column.label}</span>)}
              <span />
            </div>
            {grouped
              ? categories.map((category) => {
                const items = visible.filter((row) => row.category.id === category.id);
                if (!items.length) return null;
                return [
                  <div key={`g-${category.id}`} className="gd-gtitle">{category.name || "(ไม่มีชื่อหมวดหมู่)"}<span>{items.length} แพ็ค</span></div>,
                  ...items.map(item),
                ];
              })
              : visible.map(item)}
          </div>
          )}
        </div>
      )}

      {detailRow ? (
        <Dialog open onOpenChange={(next) => { if (!next) setDetailPackId(null); }}>
          <DialogContent showCloseButton={false} className={`gd gd-modal sm:max-w-[760px] ${className}`}>
            <div className="gd-mhead">
              <span className={`gd-micon${detailRow.pack.image ? " pic" : ""}`}>
                {detailRow.pack.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={detailRow.pack.image} alt="" />
                ) : <ImageIcon size={22} aria-hidden="true" />}
              </span>
              <div className="min-w-0">
                <DialogTitle className="truncate text-xl leading-tight font-semibold text-white">{detailRow.pack.name || "-"}</DialogTitle>
                <DialogDescription className="truncate text-[13px] text-white/90">
                  {[detailRow.category.name, detailRow.pack.amountReceived ? `ได้รับ ${detailRow.pack.amountReceived}` : ""].filter(Boolean).join(" · ") || "รายละเอียดแพ็ค"}
                </DialogDescription>
              </div>
              <button type="button" className="ml-auto grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/20 text-white" aria-label="ปิด" onClick={() => setDetailPackId(null)}>
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="gd-mbody">
              <div className="gd-dtgrid">
                <PackDetails row={detailRow} product={product} channel={channel} channels={channels} costColumn={costColumn} otherColumns={otherColumns} chargeUnit={chargeUnit} context={context} channelPicker={channelPicker} />
              </div>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}

      {lightbox !== null && visible[lightbox] ? (
        <PackLightbox
          rows={visible}
          index={lightbox}
          onIndex={setLightbox}
          onClose={() => setLightbox(null)}
          className={className}
        />
      ) : null}

      {verify && verifyRow ? (
        <GameinfoPackVerifyDialog
          key={verifyPackId}
          open
          onOpenChange={(next) => { if (!next) setVerifyPackId(null); }}
          gameId={verify.gameId}
          dataMode={verify.dataMode}
          pack={listingPack(verifyRow)}
          auto={verifyRow.auto}
          channels={verify.channels}
          listings={listingsFor(verifyRow)}
          offChannels={offChannelsFor(verifyRow)}
          onChannelsOffChange={setChannelsOff}
          referencePrices={Object.fromEntries(Object.entries(verifyRow.channels).map(([key, value]) => [key, value.price]))}
          cost={verifyRow.cost}
          product={product}
          canList={verify.canList}
          canReview={verify.canReview}
          viewer={verify.viewer}
          reviewers={verify.reviewers || []}
          setupHref={verify.setupHref}
          onListingsChange={setListings}
          className={verify.className}
        />
      ) : null}
    </>
  );
}

function toneText(margin) {
  const tone = gameinfoMarginTone(margin);
  return tone === "green" ? "pos" : tone === "red" ? "neg" : tone === "amber" ? "text-[color:var(--gd-amber)]" : "";
}

function TopupSummary({ rows, total }) {
  const wallets = rows.map((row) => row.pack.channelsMain?.[0]).filter(Boolean);
  const wallet = mostCommon(wallets);
  const country = mostCommon(rows.map((row) => row.pack.country).filter(Boolean));
  const prices = rows.map((row) => gameinfoListNumber(row.pack.price)).filter((value) => value !== null);
  return (
    <div className="gd-sum">
      <div className="gd-sbox"><small>ช่องทางเติม</small><b className="!text-lg">{wallet || "—"}</b><span>{country ? gameinfoCountryDisplayName(country) : "—"}</span></div>
      <div className="gd-sbox"><small>แพ็ค</small><b>{rows.length}</b><span>จาก {total}</span></div>
      <div className="gd-sbox"><small>ราคาเริ่มต้น</small><b>{prices.length ? baht(Math.min(...prices)) : "—"}</b><span>{prices.length ? `ถึง ${baht(Math.max(...prices))}` : ""}</span></div>
    </div>
  );
}

function mostCommon(values) {
  const counts = new Map();
  values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

function PackItem({ row, product, tracks, gotField, channel, channels, costColumn, otherColumns, rowColumns = [], chargeUnit, context, stock, open, onToggle, listings, channelCount, onVerify, onImage, channelPicker }) {
  const { pack } = row;
  // A row can show another channel than the bar above it. The pick holds
  // only while the bar stays on the channel it was made against: moving the
  // bar brings every row along again. Nothing is saved.
  const [ownChannel, setOwnChannel] = useState(null);
  const shownChannel = (ownChannel && ownChannel.base === channel?.key && channels.find((item) => item.key === ownChannel.key)) || channel;
  const figures = row.channels[shownChannel?.key] || { price: gameinfoListNumber(pack.price), profit: null, margin: null };
  const href = packHref(pack.link);
  const got = gotField ? String(pack[gotField] ?? "").trim() : "";
  const detailsId = `pack-${pack.id}-details`;
  const classes = [
    "gd-it",
    open ? "open" : "",
    row.status === "closed" ? "off" : "",
    row.status === "expired" ? "exp" : "",
    (gameinfoListNumber(pack.price) ?? 0) >= HIGH_PRICE ? "hi" : "",
  ].filter(Boolean).join(" ");
  return (
    <div className={classes}>
      {/* The chevron is the control; a click anywhere else on the row does the
          same for a mouse, except on the links and images inside it. */}
      <div
        className={`gd-rw ${product ? "pr" : "tp"} cursor-pointer`}
        style={{ "--cols": tracks }}
        onClick={(event) => {
          if (!event.target.closest("a, button, input, select, label")) onToggle();
        }}
      >
        <span className="gd-nmc">
          <button type="button" className={`gd-pimg${pack.image ? "" : " none"}`} onClick={onImage} aria-label={pack.image ? `ดูรูปแพ็ค ${pack.name}` : `ยังไม่มีรูป ${pack.name}`}>
            {pack.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={pack.image} alt="" width={36} height={36} />
            ) : <ImageIcon size={16} aria-hidden="true" />}
            {row.auto ? <span className="gd-pbot" title="Bot Auto"><Bot size={11} aria-hidden="true" /></span> : null}
          </button>
          <span className="gd-nmt">
            <span className="gd-nm1">
              {row.auto ? <span className="gd-botb" title="Bot Auto"><Bot size={12} aria-hidden="true" />BOT</span> : null}
              {row.status === "new" ? <span className="gd-stg new">NEW</span> : row.status === "expired" ? <span className="gd-stg exp">EXPIRED</span> : null}
              <span className="gd-nm" title={pack.name}>{pack.name || "-"}</span>
            </span>
            <PackNotes row={row} stock={stock} />
          </span>
          {listings ? <GameinfoPackVerifyButton packName={pack.name} listings={listings} channelCount={channelCount} onOpen={onVerify} /> : null}
        </span>
        {gotField ? <span className="gd-v r num got">{got ? (gotField === "priceUsd" ? `$${got}` : got) : "–"}</span> : null}
        {product ? (
          <>
            <span className="gd-v r num cost" data-l="ต้นทุน">{baht(row.cost)}</span>
            {channels.length > 1 ? (
              <span className="gd-v r num big" data-l="ราคาขาย">
                <label className={`gd-chsel${shownChannel?.key !== channel?.key ? " own" : ""}`}>
                  <span className="pr">{baht(figures.price)}</span>
                  <span className="chn">{shownChannel?.short}<ChevronDown size={12} aria-hidden="true" /></span>
                  <select
                    value={shownChannel?.key || ""}
                    aria-label={`ช่องทางที่แสดงของ ${pack.name || "แพ็คนี้"}`}
                    onChange={(event) => setOwnChannel(event.target.value === channel?.key ? null : { key: event.target.value, base: channel?.key })}
                  >
                    {channels.map((item) => (
                      <option key={item.key} value={item.key}>{item.short} · {baht(row.channels[item.key]?.price ?? null)}</option>
                    ))}
                  </select>
                </label>
              </span>
            ) : (
              <span className="gd-v r num big" data-l="ราคาขาย">{baht(figures.price)}</span>
            )}
            <span className={`gd-v r num ${figures.profit === null ? "" : figures.profit >= 0 ? "pos" : "neg"}`} data-l="กำไร">{signedBaht(figures.profit)}</span>
            <span className="gd-v r" data-l="กำไร %"><MarginPill margin={figures.margin} /></span>
          </>
        ) : (
          <>
            <span className="gd-v r num big">{baht(gameinfoListNumber(pack.price))}</span>
            <span className="gd-v text-[12.5px] text-[color:var(--gd-muted)]">{[listText(pack.channelsMain), pack.country ? gameinfoCountryDisplayName(pack.country) : ""].filter(Boolean).join(" · ") || "—"}</span>
            <span className="gd-v r">
              {href ? (
                <a className="gd-lnkbtn" href={href} target="_blank" rel="noreferrer" title={pack.link}>
                  <ExternalLink size={14} aria-hidden="true" /><span className="gd-lg">เปิดลิงก์เติม</span>
                </a>
              ) : <span className="gd-note">ไม่มีลิงก์</span>}
            </span>
          </>
        )}
        {rowColumns.map((column) => {
          const value = row.errors.has(column.id) ? "สูตรผิด" : formatGameinfoPackColumnValue(row.values[column.id], column);
          return <span key={column.id} className="gd-v r num gd-x" data-l={column.label} title={column.label}>{value && value !== "-" ? value : "—"}</span>;
        })}
        <button type="button" className="gd-chv" aria-expanded={open} aria-controls={detailsId} aria-label={`รายละเอียด ${pack.name || ""}`} onClick={onToggle}>
          <ChevronDown size={18} aria-hidden="true" />
        </button>
      </div>
      <div id={detailsId} className="gd-dt">
        {open ? <PackDetails row={row} product={product} channel={shownChannel} channels={channels} costColumn={costColumn} otherColumns={otherColumns} chargeUnit={chargeUnit} context={context} channelPicker={channelPicker} /> : null}
      </div>
    </div>
  );
}

// What opening a pack shows: the bot note, the channels side by side, how the
// cost is worked out, where it is topped up, and the remaining columns.
function PackDetails({ row, product, channel, channels, costColumn, otherColumns, chargeUnit, context, channelPicker = null }) {
  return (
    <>
      {row.auto ? <BotCallout /> : null}
      {product && channels.length ? <ChannelCompare row={row} channels={channels} selected={channel?.key} picker={channelPicker} /> : null}
      {costColumn ? <CostWorking row={row} chargeUnit={chargeUnit} context={context} product={product} /> : null}
      <TopupInfo row={row} href={packHref(row.pack.link)} />
      <OtherColumns row={row} columns={otherColumns} />
    </>
  );
}

// One pack as the TopUp site shows it: picture, name and price on a card.
// The card opens the details; the check badge opens its own window.
function PackCard({ row, product, channel, gotField, stock, listings, channelCount, rowColumns = [], onOpen, onVerify }) {
  const { pack } = row;
  const figures = row.channels[channel?.key] || { price: gameinfoListNumber(pack.price), profit: null, margin: null };
  const price = product ? figures.price : gameinfoListNumber(pack.price);
  const got = gotField ? String(pack[gotField] ?? "").trim() : "";
  const classes = [
    "gd-packcard",
    row.status === "closed" ? "off" : "",
    row.status === "expired" ? "exp" : "",
    (gameinfoListNumber(pack.price) ?? 0) >= HIGH_PRICE ? "hi" : "",
  ].filter(Boolean).join(" ");
  return (
    <div className={classes}>
      <button type="button" className="gd-packcard-hit" onClick={onOpen} aria-label={`รายละเอียด ${pack.name || ""}`} />
      <span className="gd-packcard-tags">
        {row.auto ? <span className="gd-botb" title="Bot Auto"><Bot size={12} aria-hidden="true" />BOT</span> : null}
        {row.status === "new" ? <span className="gd-stg new">NEW</span> : row.status === "expired" ? <span className="gd-stg exp">EXPIRED</span> : null}
      </span>
      <span className={`gd-packcard-img${pack.image ? "" : " none"}`}>
        {pack.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={pack.image} alt="" loading="lazy" />
        ) : <ImageIcon size={28} aria-hidden="true" />}
      </span>
      <span className="gd-packcard-nm" title={pack.name}>{pack.name || "-"}</span>
      {got ? <span className="gd-packcard-sub">{gotField === "priceUsd" ? `$${got}` : `ได้รับ ${got}`}</span> : null}
      <span className="gd-packcard-price num">{baht(price)}</span>
      {product && (figures.profit !== null || figures.margin !== null) ? (
        <span className="gd-packcard-sub">
          <span className={`num ${figures.profit === null ? "" : figures.profit >= 0 ? "pos" : "neg"}`}>{signedBaht(figures.profit)}</span>
          <MarginPill margin={figures.margin} />
        </span>
      ) : null}
      {rowColumns.length ? (
        <span className="gd-packcard-x">
          {rowColumns.map((column) => {
            const value = row.errors.has(column.id) ? "สูตรผิด" : formatGameinfoPackColumnValue(row.values[column.id], column);
            return <span key={column.id}><span>{column.label}</span><b className="num">{value && value !== "-" ? value : "—"}</b></span>;
          })}
        </span>
      ) : null}
      <span className="gd-packcard-notes"><PackNotes row={row} stock={stock} /></span>
      {listings ? <span className="gd-packcard-verify"><GameinfoPackVerifyButton packName={pack.name} listings={listings} channelCount={channelCount} onOpen={onVerify} /></span> : null}
    </div>
  );
}

function BotCallout() {
  return (
    <div className="gd-autoc">
      <span className="ai"><Bot size={22} aria-hidden="true" /></span>
      <small>แพ็คนี้เติมอัตโนมัติด้วย Bot Auto ข้อมูลที่บันทึกจะถูกใช้เติมให้ลูกค้าเลย ตรวจชื่อ ราคา และจำนวนให้ถูกก่อนกดบันทึกทุกครั้ง</small>
    </div>
  );
}

// A pack's picture large, to check it against its name and price before it is
// listed: zoom by steps, and step through the packs the list is showing.
function PackLightbox({ rows, index, onIndex, onClose, className }) {
  const [zoom, setZoom] = useState(1);
  const { pack } = rows[index];
  const step = (by) => {
    setZoom(1);
    onIndex((index + by + rows.length) % rows.length);
  };
  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent showCloseButton={false} className={`gd gd-modal sm:max-w-[560px] ${className}`}>
        <div className="gd-mhead">
          <div className="min-w-0">
            <DialogTitle className="truncate text-xl leading-tight font-semibold text-white">{pack.name || "-"}</DialogTitle>
            <DialogDescription className="truncate text-[13px] text-white/90">{pack.amountReceived ? `ได้รับ ${pack.amountReceived}` : "รูปแพ็ค"}</DialogDescription>
          </div>
          <button type="button" className="ml-auto grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/20 text-white" aria-label="ปิด" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="gd-mbody">
          <div className="gd-lbs">
            <div className="gd-lbi" style={{ width: `${240 * zoom}px` }}>
              {pack.image ? (
                <button type="button" className="block w-full cursor-zoom-in" onClick={() => setZoom(zoom >= 3 ? 1 : zoom + 1)} aria-label="ขยายรูป">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={pack.image} alt={pack.name || ""} />
                </button>
              ) : (
                <div className="gd-empty"><span className="eic"><ImageIcon size={22} aria-hidden="true" /></span><b>ยังไม่มีรูปแพ็คนี้</b></div>
              )}
            </div>
          </div>
          <div className="gd-lbc">
            <button type="button" className="gd-btn sm" onClick={() => step(-1)} aria-label="แพ็คก่อนหน้า"><ChevronLeft size={18} aria-hidden="true" /></button>
            <div className="gd-seg">
              <button type="button" onClick={() => setZoom(Math.max(1, zoom - 1))} aria-label="ย่อ"><ZoomOut size={16} aria-hidden="true" /></button>
              <button type="button" onClick={() => setZoom(1)} aria-label="ขนาดเดิม">{zoom * 100}%</button>
              <button type="button" onClick={() => setZoom(Math.min(3, zoom + 1))} aria-label="ขยาย"><ZoomIn size={16} aria-hidden="true" /></button>
            </div>
            <button type="button" className="gd-btn sm" onClick={() => step(1)} aria-label="แพ็คถัดไป"><ChevronRight size={18} aria-hidden="true" /></button>
          </div>
          <div className="gd-vsec">
            <div className="gd-kvl"><span>ชื่อแพ็ค</span><span>{pack.name || "-"}</span></div>
            <div className="gd-kvl"><span>ได้รับ</span><span>{String(pack.amountReceived ?? "").trim() || "–"}</span></div>
            <div className="gd-kvl"><span>ราคาขาย</span><span>{baht(gameinfoListNumber(pack.price))}</span></div>
          </div>
          <span className="gd-note">ตรวจรูปให้ตรงกับชื่อและราคาแพ็คก่อนลงสินค้า</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PackNotes({ row, stock }) {
  const { pack, status } = row;
  const warning = gameinfoPackExpiryWarning(pack);
  const expiry = formatGameinfoPackExpiry(pack.expiresAt);
  if (status !== "closed" && !expiry && !stock) return null;
  return (
    <span className="gd-nth">
      {status === "closed" ? <span className={`gd-pill ${STATUS_TONE[status]}`}>{GAMEINFO_PACK_STATUS_LABELS[status]}</span> : null}
      {expiry ? <span>หมดอายุ {expiry}</span> : null}
      {warning ? <span className="gd-pill amber">{warning}</span> : null}
      {stock ? (
        <span className={`gd-pill ${STOCK_TONE[stock.tone]}`} title={`stock: ${stock.codes.join(", ")}`}>
          {stock.tone === "empty" ? "stock หมด" : `stock ${stock.left}`}
        </span>
      ) : null}
    </span>
  );
}

function MarginPill({ margin }) {
  if (margin === null || margin === undefined) return <span className="gd-note">—</span>;
  return <span className={`gd-pb ${gameinfoMarginTone(margin)}`}>{pct(margin)}</span>;
}

// Each channel's price and what it makes on this pack. Under its name, the
// column its price comes from; someone who may set the game's channels picks
// another by its price (option B on the design canvas), seeing what each
// column holds for this pack, columns not in baht marked so.
function ChannelCompare({ row, channels, selected, picker = null }) {
  const [openKey, setOpenKey] = useState(null);
  return (
    <div className="gd-blk">
      <h4>เทียบรายช่องทางขาย</h4>
      <div className="gd-cmp">
        <span className="h nx">ช่องทาง</span>
        <span className="h rr">ราคาขาย</span>
        <span className="h rr hp">กำไร</span>
        <span className="h rr">กำไร %</span>
        {channels.map((item) => {
          const value = row.channels[item.key];
          const sel = item.key === selected ? " sel" : "";
          const open = Boolean(picker) && openKey === item.key;
          return [
            <span key={`${item.key}-n`} className={`nx${sel}`}>
              <span className="block truncate">{item.short}</span>
              <span className="gd-cmp-src">จาก {item.priceColumn?.label || "ราคา (ของแพ็ค)"}</span>
            </span>,
            picker ? (
              <span key={`${item.key}-p`} className="rr">
                <button
                  type="button"
                  className={`gd-cmp-pick${open ? " on" : ""}${sel}`}
                  aria-expanded={open}
                  aria-label={`ราคาขายของ ${item.short} ${baht(value.price)} เปลี่ยนคอลัมน์`}
                  disabled={picker.saving === item.key}
                  onClick={() => setOpenKey(open ? null : item.key)}
                >
                  {picker.saving === item.key ? "กำลังบันทึก…" : baht(value.price)}
                  <ChevronDown size={14} aria-hidden="true" style={open ? { transform: "rotate(180deg)" } : undefined} />
                </button>
              </span>
            ) : (
              <span key={`${item.key}-p`} className={`rr${sel}`}>{baht(value.price)}</span>
            ),
            <span key={`${item.key}-f`} className={`rr hp ${value.profit === null ? "" : value.profit >= 0 ? "pos" : "neg"}`}>{signedBaht(value.profit)}</span>,
            <span key={`${item.key}-m`} className="rr"><MarginPill margin={value.margin} /></span>,
            open ? (
              <PriceSourceList
                key={`${item.key}-list`}
                row={row}
                channel={item}
                columns={picker.columns}
                onPick={(column) => {
                  setOpenKey(null);
                  if (column !== (item.priceColumn?.label || "")) picker.choose(item.key, column);
                }}
              />
            ) : null,
          ];
        })}
      </div>
      {picker ? (
        <button type="button" className="gd-cmp-add" onClick={picker.add}>
          <Plus size={15} aria-hidden="true" /> เพิ่มช่องทาง
        </button>
      ) : null}
      {picker?.error ? <p role="alert" className="gd-cmp-err">{picker.error}</p> : null}
    </div>
  );
}

function PriceSourceList({ row, channel, columns, onPick }) {
  const current = channel.priceColumn?.label || "";
  const options = [
    { column: "", label: "ราคา (ของแพ็ค)", shown: baht(gameinfoListNumber(row.pack.price)), baht: true },
    ...columns.map((column) => {
      const isBaht = gameinfoColumnLooksBaht(column);
      const raw = row.errors.has(column.id) ? "สูตรผิด" : row.values[column.id];
      const number = gameinfoListNumber(raw);
      const shown = isBaht && number !== null ? baht(number) : formatGameinfoPackColumnValue(raw, column) || "—";
      return { column: String(column.label), label: String(column.label), shown, baht: isBaht };
    }),
  ].sort((left, right) => Number(right.baht) - Number(left.baht));
  const name = `gd-src-${row.pack.id}-${channel.key}`;
  return (
    <div className="gd-cmp-list" role="radiogroup" aria-label={`ราคาขายของ ${channel.short} มาจากคอลัมน์`}>
      <span className="gd-cmp-src">ราคาขายของ {channel.short} มาจากคอลัมน์ · ใช้กับทุกแพ็คของเกมนี้</span>
      {options.map((option) => (
        <label key={option.column || "__price"} className={`${option.column === current ? "on" : ""}${option.baht ? "" : " off"}`}>
          <input type="radio" name={name} checked={option.column === current} onChange={() => onPick(option.column)} />
          <span className="nm">{option.label}</span>
          <span className="vl">{option.shown}{option.baht ? "" : " · ไม่ใช่บาท"}</span>
        </label>
      ))}
    </div>
  );
}

function CostWorking({ row, chargeUnit, context, product }) {
  const { pack } = row;
  const unit = chargeUnit ? ` ${chargeUnit}` : "";
  let rate = null;
  try {
    rate = gameinfoListNumber(resolveGameinfoField(pack, {}, "อัตราต้นทุน", context));
  } catch {
    rate = null;
  }
  const before = String(pack.amountBeforeFee ?? "").trim();
  const charged = String(pack.amountChargedFee ?? "").trim();
  return (
    <div className="gd-blk">
      <h4>ต้นทุนมาจากไหน</h4>
      <div className="gd-calc num">
        {before ? <div><span>ยอดที่กด</span><span>{before}{unit}</span></div> : null}
        {charged ? <div><span>รวมค่าธรรมเนียม</span><span>{gameinfoListNumber(charged) === null ? charged : num(gameinfoListNumber(charged), 2)}{unit}</span></div> : null}
        {rate !== null ? <div><span>เรทแลกเปลี่ยน</span><span>× {rate.toLocaleString("en-US", { maximumFractionDigits: 6 })}</span></div> : null}
        <div className="tot"><span>ต้นทุน</span><span>{row.errors.size && row.cost === null ? "สูตรผิด" : baht(row.cost)}</span></div>
        {product ? <span className="rule">กำไร = ราคาขาย − ต้นทุน · กำไร % = กำไร ÷ ราคาขาย × 100</span> : null}
      </div>
    </div>
  );
}

function TopupInfo({ row, href }) {
  const { pack, status } = row;
  const secondary = listText(pack.channelsSecondary);
  const expiry = formatGameinfoPackExpiry(pack.expiresAt);
  return (
    <div className="gd-blk">
      <h4>ข้อมูลการเติม</h4>
      <dl className="gd-kv">
        <dt>ได้รับ</dt><dd className="num">{String(pack.amountReceived ?? "").trim() || "–"}</dd>
        <dt>ช่องทางเติม</dt><dd>{listText(pack.channelsMain) || "–"}</dd>
        {secondary ? <><dt>ช่องทางรอง</dt><dd>{secondary}</dd></> : null}
        <dt>ประเทศ</dt><dd>{pack.country ? gameinfoCountryDisplayName(pack.country) : "–"}</dd>
        <dt>ราคา USD</dt><dd className="num">{String(pack.priceUsd ?? "").trim() ? `$${pack.priceUsd}` : "–"}</dd>
        {expiry ? <><dt>วันหมดอายุ</dt><dd className="num">{expiry}</dd></> : null}
        <dt>สถานะ</dt><dd><span className={`gd-pill ${STATUS_TONE[status]}`}><i className="d" />{GAMEINFO_PACK_STATUS_LABELS[status]}</span></dd>
      </dl>
      {href ? (
        <div className="mt-2.5">
          <a className="gd-lnkbtn" href={href} target="_blank" rel="noreferrer" title={pack.link}><ExternalLink size={14} aria-hidden="true" />เปิดลิงก์เติม</a>
        </div>
      ) : null}
    </div>
  );
}

// Every column is listed, empty ones as "—": a column just added has no
// values yet, and leaving it out read as the column not having been added.
function OtherColumns({ row, columns }) {
  const entries = columns.map((column) => {
    const raw = column.kind === "computed"
      ? row.errors.has(column.id) ? "สูตรผิด" : formatGameinfoPackColumnValue(row.values[column.id], column)
      : listText(row.pack[column.field]);
    const empty = !raw || raw === "—" || raw === "-";
    return [column, empty ? "—" : raw, empty];
  });
  if (!entries.length) return null;
  return (
    <div className="gd-blk">
      <h4>ข้อมูลอื่น</h4>
      <dl className="gd-kv">
        {entries.map(([column, value, empty]) => [
          <dt key={`${column.id}-l`}>{column.label}</dt>,
          <dd key={`${column.id}-v`} className="num" style={empty ? { color: "var(--gd-muted)" } : undefined}>{value}</dd>,
        ])}
      </dl>
    </div>
  );
}
