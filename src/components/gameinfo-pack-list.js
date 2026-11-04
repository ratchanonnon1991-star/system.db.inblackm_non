"use client";

import { useMemo, useState } from "react";
import { Box, ChevronDown, ExternalLink, Search } from "lucide-react";
import GameinfoImagePreview from "./gameinfo-image-preview";
import {
  GAMEINFO_MARGIN_GOOD,
  GAMEINFO_MARGIN_LOW,
  buildGameinfoPackListRows,
  filterGameinfoPackListRows,
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
export default function GameinfoPackList({ currency, columns, game, context, topupView = false, chargeUnit = "", stock = {}, beforeList = null }) {
  const product = !topupView;
  const { rows, channels, costColumn } = useMemo(
    () => buildGameinfoPackListRows(currency, columns, game, context),
    [currency, columns, game, context]
  );
  const [channelChoice, setChannelChoice] = useState("page");
  const channel = channels.find((item) => item.key === channelChoice) || channels[0] || null;
  const channelKey = channel?.key || "page";
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState("all");
  const [sort, setSort] = useState("default");
  const [open, setOpen] = useState(() => new Set());

  const visible = filterGameinfoPackListRows(rows, { query, chip, sort, channel: channelKey });
  const summary = product ? summarizeGameinfoPackList(visible, channelKey) : null;
  const lowCount = product ? rows.filter((row) => (row.channels[channelKey]?.margin ?? Infinity) < GAMEINFO_MARGIN_LOW).length : 0;
  const categories = currency?.categories || [];
  const chips = [
    { id: "all", label: "ทั้งหมด", count: rows.length },
    ...(categories.length > 1 ? categories.map((category) => ({ id: category.id, label: category.name || "(ไม่มีชื่อหมวดหมู่)", count: (category.packs || []).length })) : []),
    ...(product && lowCount ? [{ id: "low", label: "กำไรต่ำ", count: lowCount }] : []),
  ];
  const gotField = rows.some((row) => String(row.pack.amountReceived ?? "").trim()) ? "amountReceived" : rows.some((row) => String(row.pack.priceUsd ?? "").trim()) ? "priceUsd" : "";
  const gotLabel = gotField === "priceUsd" ? "USD" : "ได้รับ";
  const tracks = [
    "minmax(150px,1fr)",
    gotField ? "72px" : null,
    ...(product ? ["88px", "96px", "96px", "78px"] : ["96px", "170px", "120px"]),
    "28px",
  ].filter(Boolean).join(" ");
  const grouped = sort === "default" && chip === "all" && !query.trim() && categories.length > 1;

  const shownIds = new Set([costColumn?.id, ...channels.map((item) => item.priceColumn?.id)].filter(Boolean));
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
        chargeUnit={chargeUnit}
        context={context}
        stock={stock[row.pack.name]}
        open={open.has(row.pack.id)}
        onToggle={() => toggle(row.pack.id)}
      />
    );
  }

  return (
    <>
      <div className="gd-ctrl">
        {product && channels.length > 1 ? (
          <div className="flex flex-col gap-1.5">
            <span className="gd-lbl">ดูกำไรของช่องทาง</span>
            <div className="gd-seg red fill" role="group" aria-label="ช่องทางขาย">
              {channels.map((item) => (
                <button key={item.key} type="button" aria-pressed={item.key === channelKey} onClick={() => setChannelChoice(item.key)}>
                  {item.short}
                </button>
              ))}
            </div>
          </div>
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
              <button key={option.id} type="button" className="gd-chip" aria-pressed={chip === option.id} onClick={() => setChip(option.id)}>
                {option.label} <span className="cnt">{option.count}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {product && summary ? (
        <div>
          <div className="gd-sum">
            <div className="gd-sbox">
              <small>กำไรเฉลี่ย · {channel?.label}</small>
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
              <span>{summary.low ? "กด “กำไรต่ำ” ด้านบน" : "ไม่มี"}</span>
            </div>
          </div>
          <div className="gd-legend mt-2">
            <span><i style={{ background: "var(--gd-green)" }} />ตั้งแต่ {GAMEINFO_MARGIN_GOOD}% ดี</span>
            <span><i style={{ background: "var(--gd-amber)" }} />{GAMEINFO_MARGIN_LOW}–{GAMEINFO_MARGIN_GOOD}% พอใช้</span>
            <span><i style={{ background: "var(--gd-red)" }} />ต่ำกว่า {GAMEINFO_MARGIN_LOW}% ต่ำ</span>
          </div>
        </div>
      ) : null}
      {!product && rows.length ? <TopupSummary rows={visible.length ? visible : rows} total={rows.length} /> : null}

      {beforeList}

      {!rows.length ? (
        <div className="gd-empty"><b>ยังไม่มีแพ็คในสกุลนี้</b></div>
      ) : !visible.length ? (
        <div className="gd-empty">
          <span className="eic"><Search size={22} aria-hidden="true" /></span>
          <b>ไม่พบแพ็คที่ตรงเงื่อนไข</b>
          <span>ลองล้างคำค้นหา หรือเลือก “ทั้งหมด”</span>
          <button type="button" className="gd-btn sm" onClick={() => { setQuery(""); setChip("all"); }}>ล้างตัวกรอง</button>
        </div>
      ) : (
        <div>
          <p className="gd-note mb-2 ml-0.5">{product ? "กดที่แพ็คเพื่อดูวิธีคิดต้นทุนและเทียบช่องทาง" : "กดที่แพ็คเพื่อดูรายละเอียด"}</p>
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
        </div>
      )}
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

function PackItem({ row, product, tracks, gotField, channel, channels, costColumn, otherColumns, chargeUnit, context, stock, open, onToggle }) {
  const { pack } = row;
  const figures = row.channels[channel?.key] || { price: gameinfoListNumber(pack.price), profit: null, margin: null };
  const href = packHref(pack.link);
  const got = gotField ? String(pack[gotField] ?? "").trim() : "";
  const off = row.status === "closed" || row.status === "expired";
  const detailsId = `pack-${pack.id}-details`;
  return (
    <div className={`gd-it${open ? " open" : ""}${off ? " off" : ""}`}>
      {/* The chevron is the control; a click anywhere else on the row does the
          same for a mouse, except on the links and images inside it. */}
      <div
        className={`gd-rw ${product ? "pr" : "tp"} cursor-pointer`}
        style={{ "--cols": tracks }}
        onClick={(event) => {
          if (!event.target.closest("a, button, input")) onToggle();
        }}
      >
        <span className="gd-nmc">
          <PackThumb src={pack.image} tone={row.categoryIndex % 4} />
          <span className="gd-nmt">
            <span className="gd-nm" title={pack.name}>{pack.name || "-"}</span>
            <PackNotes row={row} stock={stock} />
          </span>
        </span>
        {gotField ? <span className="gd-v r num got">{got ? (gotField === "priceUsd" ? `$${got}` : got) : "–"}</span> : null}
        {product ? (
          <>
            <span className="gd-v r num cost" data-l="ต้นทุน">{baht(row.cost)}</span>
            <span className="gd-v r num big" data-l="ราคาขาย">{baht(figures.price)}</span>
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
        <button type="button" className="gd-chv" aria-expanded={open} aria-controls={detailsId} aria-label={`รายละเอียด ${pack.name || ""}`} onClick={onToggle}>
          <ChevronDown size={18} aria-hidden="true" />
        </button>
      </div>
      <div id={detailsId} className="gd-dt">
        {open ? (
          <>
            {product && channels.length ? <ChannelCompare row={row} channels={channels} selected={channel?.key} /> : null}
            {costColumn ? <CostWorking row={row} chargeUnit={chargeUnit} context={context} product={product} /> : null}
            <TopupInfo row={row} href={href} />
            <OtherColumns row={row} columns={otherColumns} />
          </>
        ) : null}
      </div>
    </div>
  );
}

function PackThumb({ src, tone }) {
  if (!src) {
    return <span className={`gd-thumb t${tone}`} aria-hidden="true"><Box size={17} /></span>;
  }
  return (
    <GameinfoImagePreview src={src} alt="" wrapperClassName="gd-thumb">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" />
    </GameinfoImagePreview>
  );
}

function PackNotes({ row, stock }) {
  const { pack, status } = row;
  const warning = gameinfoPackExpiryWarning(pack);
  const expiry = formatGameinfoPackExpiry(pack.expiresAt);
  if (status === "open" && !expiry && !stock) return null;
  return (
    <span className="gd-nth">
      {status !== "open" ? <span className={`gd-pill ${STATUS_TONE[status]}`}>{GAMEINFO_PACK_STATUS_LABELS[status]}</span> : null}
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

function ChannelCompare({ row, channels, selected }) {
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
          return [
            <span key={`${item.key}-n`} className={`nx${sel}`}>{item.short}</span>,
            <span key={`${item.key}-p`} className={`rr${sel}`}>{baht(value.price)}</span>,
            <span key={`${item.key}-f`} className={`rr hp ${value.profit === null ? "" : value.profit >= 0 ? "pos" : "neg"}`}>{signedBaht(value.profit)}</span>,
            <span key={`${item.key}-m`} className="rr"><MarginPill margin={value.margin} /></span>,
          ];
        })}
      </div>
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

function OtherColumns({ row, columns }) {
  const entries = columns
    .map((column) => {
      if (column.kind === "computed") {
        const value = row.errors.has(column.id) ? "สูตรผิด" : formatGameinfoPackColumnValue(row.values[column.id], column);
        return [column, value];
      }
      return [column, listText(row.pack[column.field])];
    })
    .filter(([, value]) => value && value !== "—" && value !== "-");
  if (!entries.length) return null;
  return (
    <div className="gd-blk">
      <h4>ข้อมูลอื่น</h4>
      <dl className="gd-kv">
        {entries.map(([column, value]) => [
          <dt key={`${column.id}-l`}>{column.label}</dt>,
          <dd key={`${column.id}-v`} className="num">{value}</dd>,
        ])}
      </dl>
    </div>
  );
}
