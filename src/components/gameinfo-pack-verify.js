"use client";

import { useEffect, useState } from "react";
import { Bot, Check, CircleAlert, Clock, ExternalLink, ShieldCheck, Timer, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { apiJson } from "@/lib/api-json";
import {
  GAMEINFO_LISTING_PRICE_CHANNEL,
  GAMEINFO_LISTING_REVIEW_MINUTES,
  gameinfoListingDeadline,
  gameinfoListingSnapshot,
  summarizeGameinfoPackListings,
} from "@/lib/gameinfo-pack-listings";
import { gameinfoJudgeNotice, gameinfoSendNotice, useGameinfoNoticeChain } from "./gameinfo-notice-chain";

const num = (value) => (value === null || value === undefined ? "—" : Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 }));
const baht = (value) => (value === null || value === undefined ? "—" : `฿${num(value)}`);
const when = (value) => (value
  ? new Date(value).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
  : "");
const clock = (time) => new Date(time).toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const BADGE_ICON = { bad: CircleAlert, late: Timer, warn: Clock, ok: ShieldCheck, none: ShieldCheck };
const STATUS_PILL = { ok: "green", pending: "amber", wrong: "red", late: "violet" };
const STATUS_WORD = { ok: "ตรวจแล้ว", pending: "รอตรวจ", wrong: "ราคาผิด", late: "หมดเวลา" };
const HISTORY_WORD = { ok: "ตรวจแล้ว", wrong: "ราคาผิด", late: "หมดเวลา", pending: "ส่งใหม่ก่อนตรวจ" };

/** The row's badge: what the pack's listings come to, and the way into them. */
export function GameinfoPackVerifyButton({ packName, listings, channelCount, onOpen }) {
  const summary = summarizeGameinfoPackListings(listings, channelCount);
  const Icon = BADGE_ICON[summary.tone];
  return (
    <button type="button" className={`gd-vbtn ${summary.tone}`} onClick={onOpen} aria-label={`ตรวจสอบสินค้า ${packName}: ${summary.label}`}>
      <Icon size={15} aria-hidden="true" />
      <span>{summary.label}</span>
    </button>
  );
}

function Person({ name }) {
  return <span><span className="gd-av" aria-hidden="true">{String(name || "?").slice(0, 1)}</span>{name || "—"}</span>;
}

/**
 * One pack's listings, a tab per sales channel: the link, the round it is on,
 * who listed it and who it was sent to, what they found, and the rounds
 * before. The lister sends each round to another admin, who has an hour to
 * check it; past that the round closes and the lister sends a new one.
 */
export function GameinfoPackVerifyDialog({
  open,
  onOpenChange,
  gameId,
  dataMode,
  pack,
  auto = false,
  channels,
  listings,
  referencePrices = {},
  cost = null,
  product = false,
  canList = false,
  canReview = false,
  viewer = "",
  reviewers = [],
  setupHref = null,
  onListingsChange,
  // Channels this pack is kept off although the game sells there, and the way
  // an admin turns one off or back on.
  offChannels = EMPTY_SET,
  onChannelsOffChange = null,
  className = "",
}) {
  const byChannel = new Map(listings.map((listing) => [listing.channel, listing]));
  const firstToLook = ["wrong", "late", "pending"].map((status) => channels.find((channel) => byChannel.get(channel.key)?.status === status)).find(Boolean)
    || channels.find((channel) => !offChannels.has(channel.key)) || channels[0];
  const [tab, setTab] = useState(firstToLook?.key);
  const [sending, setSending] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState("");
  const notices = useGameinfoNoticeChain(className);
  const channel = channels.find((item) => item.key === tab) || channels[0];
  const listing = channel ? byChannel.get(channel.key) || null : null;
  const reference = channel && GAMEINFO_LISTING_PRICE_CHANNEL[channel.key] ? referencePrices[GAMEINFO_LISTING_PRICE_CHANNEL[channel.key]] ?? null : null;
  const nameOf = (username) => reviewers.find((item) => item.username === username)?.name || username;
  const channelOff = Boolean(channel && offChannels.has(channel.key));
  const canSwitch = Boolean(canReview && onChannelsOffChange && channel);

  async function switchChannel(off) {
    setSwitching(true);
    setSwitchError("");
    try {
      const data = await apiJson(`/api/gameinfo/gamelist/${gameId}/listings${dataMode === "idpass" ? "?mode=idpass" : ""}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId: pack.id, channel: channel.key, off }),
        fallbackError: "เปิด/ปิดช่องทางไม่สำเร็จ",
      });
      onChannelsOffChange(data.channelsOff);
    } catch (error) {
      setSwitchError(error instanceof Error ? error.message : "เปิด/ปิดช่องทางไม่สำเร็จ");
    } finally {
      setSwitching(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className={`gd gd-modal sm:max-w-[680px] ${className}`}>
        <div className="gd-mhead">
          <span className={`gd-micon${pack.image ? " pic" : ""}`}>
            {pack.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={pack.image} alt="" />
            ) : <ShieldCheck size={24} aria-hidden="true" />}
          </span>
          <div className="min-w-0">
            <DialogTitle className="text-xl leading-tight font-semibold text-white">{sending ? `ส่งตรวจรอบที่ ${(listing?.round || 0) + 1}` : "ตรวจสอบสินค้า"}</DialogTitle>
            <DialogDescription className="truncate text-[13px] text-white/90">
              {pack.name}{pack.amountReceived ? ` (${pack.amountReceived})` : ""}{sending && channel ? ` · ${channel.label}` : ""}
            </DialogDescription>
          </div>
          <button type="button" className="ml-auto grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/20 text-white" aria-label="ปิด" onClick={() => onOpenChange(false)}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="gd-mbody">
          {sending && channel ? (
            <SendForm
              key={channel.key}
              gameId={gameId}
              dataMode={dataMode}
              pack={pack}
              channel={channel}
              listing={listing}
              reference={reference}
              viewer={viewer}
              reviewers={reviewers}
              nameOf={nameOf}
              notices={notices}
              onDone={(next) => { onListingsChange(next); setSending(false); }}
              onCancel={() => setSending(false)}
            />
          ) : (
            <>
              {auto ? (
                <div className="gd-autoc">
                  <span className="ai"><Bot size={22} aria-hidden="true" /></span>
                  <small>แพ็คนี้เติมอัตโนมัติด้วย Bot Auto ข้อมูลที่บันทึกจะถูกใช้เติมให้ลูกค้าเลย ตรวจชื่อ ราคา และจำนวนให้ถูกก่อนกดบันทึกทุกครั้ง</small>
                </div>
              ) : null}
              {!channels.length ? (
                <div className="gd-empty">
                  <span className="eic"><ShieldCheck size={22} aria-hidden="true" /></span>
                  <b>เกมนี้ยังไม่ได้ตั้งช่องทางขาย</b>
                  <span>แท็บตรวจสอบจะแยกตามช่องทางที่เปิดขาย ตั้งได้ที่หน้าแก้ไข หัวข้อ “ช่องทางขาย”</span>
                  {setupHref ? <a className="gd-btn sm" href={setupHref}>ไปตั้งช่องทางขาย</a> : null}
                </div>
              ) : null}
              <div className="gd-tabs" role="tablist" aria-label="ช่องทางขาย">
                {channels.map((item) => {
                  const off = offChannels.has(item.key);
                  return (
                    <button key={item.key} type="button" role="tab" className={`gd-tab${off ? " off" : ""}`} aria-selected={item.key === channel?.key} onClick={() => { setTab(item.key); setSwitchError(""); }} title={off ? `แพ็คนี้ไม่ได้ขายใน ${item.label}` : undefined}>
                      <i className={`gd-td ${off ? "off" : byChannel.get(item.key)?.status || ""}`} aria-hidden="true" />
                      {item.label}
                      {off ? <span className="gd-tab-off">ปิด</span> : null}
                    </button>
                  );
                })}
              </div>
              {canSwitch ? (
                <div className="gd-chsw">
                  <span>
                    <b>ขายแพ็คนี้ใน {channel.label}</b>
                    <small>{channelOff ? "ปิดอยู่ ไม่ต้องลงสินค้าและไม่นับในการตรวจ" : "ปิดถ้าแพ็คนี้ไม่ได้ขายในช่องทางนี้"}</small>
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={!channelOff}
                    aria-label={`ขายแพ็คนี้ใน ${channel.label}`}
                    className="gd-switch"
                    disabled={switching}
                    onClick={() => switchChannel(!channelOff)}
                  >
                    <i aria-hidden="true" />
                  </button>
                </div>
              ) : null}
              {switchError ? <p role="alert" className="gd-note text-[color:var(--gd-red)]">{switchError}</p> : null}
              {channel && channelOff ? (
                <div className="gd-empty">
                  <span className="eic"><ShieldCheck size={22} aria-hidden="true" /></span>
                  <b>แพ็คนี้ไม่ได้ขายใน {channel.label}</b>
                  <span>ไม่ต้องลงสินค้าและไม่นับใน “ตรวจแล้ว” ของแพ็คนี้{canSwitch ? " เปิดกลับได้ที่สวิตช์ด้านบน" : ""}</span>
                </div>
              ) : channel ? (
                <ChannelListing
                  key={`${channel.key}-${listing?.round || 0}-${listing?.status || ""}`}
                  gameId={gameId}
                  dataMode={dataMode}
                  pack={pack}
                  channel={channel}
                  listing={listing}
                  reference={reference}
                  cost={cost}
                  product={product}
                  canList={canList}
                  canReview={canReview}
                  viewer={viewer}
                  nameOf={nameOf}
                  notices={notices}
                  onListingsChange={onListingsChange}
                  onSend={() => setSending(true)}
                />
              ) : null}
            </>
          )}
        </div>
        {notices.node}
      </DialogContent>
    </Dialog>
  );
}

const EMPTY_SET = new Set();

// Re-renders every half minute so the time left and a round running out show without a reload.
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

// "ราคาขาย 90 → 95"; the cost rate is named, not shown by its id.
function describeChange(change) {
  if (change.key === "costProfileId") return `${change.label}เปลี่ยน`;
  return `${change.label} ${change.from || "ว่าง"} → ${change.to || "ว่าง"}`;
}

function ChannelListing({ gameId, dataMode, pack, channel, listing, reference, cost, product, canList, canReview, viewer, nameOf, notices, onListingsChange, onSend }) {
  const now = useNow();
  const [checkedPrice, setCheckedPrice] = useState(listing?.listedPrice ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const endpoint = `/api/gameinfo/gamelist/${gameId}/listings${dataMode === "idpass" ? "?mode=idpass" : ""}`;

  async function judge(ok) {
    setBusy(true);
    setError("");
    try {
      const data = await apiJson(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId: pack.id, channel: channel.key, status: ok ? "ok" : "wrong", checkedPrice, referencePrice: reference, snapshot: gameinfoListingSnapshot(pack), note }),
        fallbackError: "บันทึกผลตรวจไม่สำเร็จ",
      });
      onListingsChange(data.listings);
    } catch (judgeError) {
      setError(judgeError instanceof Error ? judgeError.message : "บันทึกผลตรวจไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError("");
    try {
      const data = await apiJson(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId: pack.id, channel: channel.key, url: "", listedPrice: "" }),
        fallbackError: "ลบการลงสินค้าไม่สำเร็จ",
      });
      onListingsChange(data.listings);
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "ลบการลงสินค้าไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(listing.url);
      setCopied(true);
    } catch {
      setError("คัดลอกไม่ได้ กดค้างที่ลิงก์เพื่อคัดลอก");
    }
  }

  if (!listing) {
    return (
      <>
        <div className="gd-vstb">
          <span className="si"><ShieldCheck size={18} aria-hidden="true" /></span>
          <span className="min-w-0 flex-1"><b>ยังไม่ได้ลงสินค้าในช่องทางนี้</b><span className="d">{canList ? "ลงแล้วส่งให้ admin คนอื่นตรวจภายใน 1 ชั่วโมง" : "ยังไม่มีข้อมูลการลงสินค้า"}</span></span>
        </div>
        {canList ? <button type="button" className="gd-btn red w-full" onClick={onSend}><Check size={16} aria-hidden="true" />ลงสินค้าแล้ว ส่งตรวจ</button> : null}
      </>
    );
  }

  const status = listing.status;
  const deadline = gameinfoListingDeadline(listing);
  const minutesLeft = Math.max(1, Math.ceil((deadline - now) / 60_000));
  const fraction = Math.max(0, Math.min(1, (deadline - now) / (GAMEINFO_LISTING_REVIEW_MINUTES * 60_000)));
  const round = listing.round || 1;
  const reviewerName = nameOf(listing.reviewedBy || listing.reviewer);
  const banner = listing.stale && listing.changes?.length
    ? { tone: "pending", Icon: Clock, title: `ข้อมูลแพ็คถูกแก้หลังตรวจ · รอบที่ ${round}`, detail: `${listing.changes.map(describeChange).join(" · ")} ต้องส่งตรวจรอบใหม่` }
    : listing.stale
    ? { tone: "pending", Icon: Clock, title: `ราคาในระบบเปลี่ยน · รอบที่ ${round}`, detail: `ตอนนี้ ${baht(reference)} แต่ตรวจไว้ที่ ${baht(listing.checkedReference)} ต้องส่งตรวจรอบใหม่` }
    : {
      wrong: { tone: "wrong", Icon: CircleAlert, title: `ราคาผิด · รอบที่ ${round}`, detail: `ลงไว้ ${baht(listing.checkedPrice ?? listing.listedPrice)}${reference !== null ? ` แต่ควรเป็น ${baht(reference)}` : ""}${listing.note ? ` · ${listing.note}` : ""}` },
      pending: { tone: "pending", Icon: Clock, title: `รอตรวจสอบ · รอบที่ ${round}`, detail: `ตรวจก่อน ${clock(deadline)} น. · เหลือ ${minutesLeft} นาที` },
      late: { tone: "late", Icon: Timer, title: `หมดเวลา ปิดการตรวจ · รอบที่ ${round}`, detail: "เกิน 1 ชั่วโมง ผู้ลงต้องส่งตรวจรอบใหม่" },
      ok: { tone: "ok", Icon: Check, title: `ตรวจแล้ว ราคาตรงกัน · รอบที่ ${round}`, detail: `โดย ${reviewerName} · ${when(listing.reviewedAt)}` },
    }[status];
  const mine = Boolean(viewer && listing.listedBy === viewer);
  const myTurn = canReview && status === "pending" && !listing.stale && !mine && (!listing.reviewer || listing.reviewer === viewer);
  const profit = reference !== null && cost !== null ? reference - cost : null;

  return (
    <>
      {listing.url ? (
        <div className="gd-lnkc">
          <span className="gd-note">Link สินค้า · {channel.label}</span>
          <span className="gd-lnku" title={listing.url}>{listing.url}</span>
          <div className="grid grid-cols-2 gap-2">
            <a className="gd-lnkbtn justify-center" href={listing.url} target="_blank" rel="noreferrer"><ExternalLink size={14} aria-hidden="true" />เปิดลิงก์</a>
            <button type="button" className="gd-btn sm" onClick={copy}>{copied ? "คัดลอกแล้ว" : "คัดลอกลิงก์"}</button>
          </div>
        </div>
      ) : null}

      <div className={`gd-vstb ${banner.tone}`}>
        <span className="si"><banner.Icon size={18} aria-hidden="true" /></span>
        <span className="min-w-0 flex-1"><b>{banner.title}</b><span className="d">{banner.detail}</span></span>
      </div>
      {status === "pending" && !listing.stale ? (
        <div className={`gd-cdbar ${fraction > 0.5 ? "" : fraction > 0.2 ? "m" : "l"}`} role="img" aria-label={`เวลาที่เหลือ ${minutesLeft} นาที`}>
          <i style={{ width: `${fraction * 100}%` }} />
        </div>
      ) : null}

      <div className="gd-vsec">
        <h4>ผู้ลงสินค้า</h4>
        <div className="gd-kvl"><span>ชื่อ</span><Person name={nameOf(listing.listedBy)} /></div>
        <div className="gd-kvl"><span>ส่งตรวจเมื่อ</span><span>{when(listing.listedAt)}</span></div>
        <div className="gd-kvl"><span>ราคาที่ลง</span><span className={status === "wrong" ? "neg" : status === "ok" ? "pos" : ""}>{listing.listedPrice === null ? "ยังไม่มีราคา" : baht(listing.listedPrice)}</span></div>
        {reference !== null ? <div className="gd-kvl"><span>ราคาที่ถูกต้อง</span><span className="pos">{baht(reference)}</span></div> : null}
      </div>

      <div className="gd-vsec">
        <h4>ผู้ตรวจสอบ <span className={`gd-pill ${STATUS_PILL[status]}`}>{STATUS_WORD[status]}</span></h4>
        <div className="gd-kvl"><span>ชื่อ</span><Person name={reviewerName} /></div>
        <div className="gd-kvl"><span>วันที่ตรวจ</span><span>{listing.reviewedAt ? when(listing.reviewedAt) : status === "late" ? "ไม่ได้ตรวจทัน" : "ยังไม่ได้ตรวจ"}</span></div>
        <div className="gd-kvl"><span>ราคาที่ตรวจ</span><span className={status === "wrong" ? "neg" : ""}>{status === "ok" || status === "wrong" ? `${baht(listing.checkedPrice)} · ${status === "wrong" ? "ไม่ตรง" : "ตรงกัน"}` : "—"}</span></div>
        <div className="gd-kvl"><span>ผลการตรวจ</span><span className={status === "wrong" ? "neg" : status === "ok" ? "pos" : ""}>{{ wrong: "ราคาผิด ต้องแก้ไข", ok: "ถูกต้อง ตรวจแล้ว", late: "หมดเวลา ปิดการตรวจ", pending: "รอตรวจสอบ" }[status]}</span></div>
        {listing.note ? <div className="gd-kvl"><span>หมายเหตุ</span><span>{listing.note}</span></div> : null}
      </div>

      <div className="gd-vsec">
        <h4>รอบการตรวจ <span className="gd-pill blue">รอบที่ {round}</span></h4>
        <div className="gd-kvl"><span>ต้องตรวจก่อน</span><span>{clock(deadline)} น. · 1 ชั่วโมง</span></div>
        <div className="gd-kvl"><span>รายละเอียดที่ส่ง</span><span>{listing.sendNote || "—"}</span></div>
        {(listing.history || []).map((item) => (
          <div key={`${item.round}-${item.at}`} className="gd-hist">
            <span>รอบที่ {item.round}</span>
            <span>{nameOf(item.reviewer) || "—"} · {when(item.at)}</span>
            <span className={`gd-pill ${STATUS_PILL[item.status] || ""}`}>{HISTORY_WORD[item.status] || item.status}</span>
          </div>
        ))}
        <span className="gd-note">ตรวจไม่ทันใน 1 ชั่วโมง ระบบปิดการตรวจ และตรวจใหม่เมื่อผู้ลงส่งรอบใหม่</span>
      </div>

      {myTurn ? (
        <div className="gd-vsec">
          <h4>บันทึกผลการตรวจ</h4>
          <span className="gd-note">เปิดหน้าสินค้าบน {channel.label} แล้วเทียบราคากับ “ราคาที่ถูกต้อง”</span>
          <div className="grid gap-2 sm:grid-cols-[160px_minmax(0,1fr)]">
            <label className="gd-field">ราคาที่เห็นบนช่องทาง<input className="gd-input" inputMode="decimal" value={checkedPrice} onChange={(event) => setCheckedPrice(event.target.value)} /></label>
            <label className="gd-field">หมายเหตุ<input className="gd-input" value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} placeholder="เช่น ลงผิดแพ็ค ราคาเก่า" /></label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={busy} className="gd-btn sm bg-[color:var(--gd-green)]! text-white!" onClick={() => notices.run([gameinfoJudgeNotice({ ok: true, pack: pack.name, channel: channel.label })], () => judge(true))}>ราคาตรงกัน</button>
            <button type="button" disabled={busy} className="gd-btn sm red" onClick={() => notices.run([gameinfoJudgeNotice({ ok: false, pack: pack.name, channel: channel.label })], () => judge(false))}>ราคาผิด</button>
          </div>
        </div>
      ) : status === "pending" && !listing.stale ? (
        <p className="gd-note m-0">
          {mine && canReview ? "คุณเป็นผู้ลงสินค้านี้ ต้องให้ admin คนอื่นตรวจ" : `รอ ${reviewerName || "ผู้ตรวจ"} ตรวจภายใน ${clock(deadline)} น.`}
        </p>
      ) : null}

      {canList && (status !== "pending" || listing.stale) ? (
        <div className="gd-vsec">
          <h4>{status === "ok" && !listing.stale ? "ตรวจครบแล้ว" : `ส่งตรวจรอบที่ ${round + 1}`}</h4>
          <span className="gd-note">{status === "ok" && !listing.stale ? "ถ้าแก้ลิงก์หรือราคาบนช่องทาง ให้ส่งตรวจรอบใหม่" : "แก้ไขเสร็จแล้วกดส่งตรวจใหม่"}</span>
          <button type="button" className={`gd-btn ${status === "ok" && !listing.stale ? "" : "red"} w-full`} onClick={onSend}>
            <Check size={16} aria-hidden="true" />แก้ไขแล้ว ส่งตรวจใหม่
          </button>
          <button type="button" disabled={busy} className="gd-btn sm self-start" onClick={remove}>ลบการลงสินค้านี้</button>
        </div>
      ) : null}

      {product && reference !== null ? (
        <div className="gd-sum">
          <div className="gd-sbox"><small>ราคาขาย</small><b>{baht(reference)}</b><span>{channel.label}</span></div>
          <div className="gd-sbox"><small>ต้นทุน</small><b>{baht(cost)}</b><span>ต่อแพ็ค</span></div>
          <div className="gd-sbox"><small>กำไร</small><b className={profit === null ? "" : profit >= 0 ? "pos" : "neg"}>{profit === null || !reference ? "—" : `${num((profit / reference) * 100)}%`}</b><span>{baht(profit)}</span></div>
        </div>
      ) : null}

      {error ? <p role="alert" className="neg m-0 text-[13px]">{error}</p> : null}
    </>
  );
}

// Sending a round: the link and price as listed, the admin who checks it
// (never the sender), and what changed since the last round.
function SendForm({ gameId, dataMode, pack, channel, listing, reference, viewer, reviewers, nameOf, notices, onDone, onCancel }) {
  const choices = reviewers.filter((item) => item.username !== viewer);
  const [url, setUrl] = useState(listing?.url || "");
  const [price, setPrice] = useState(listing?.listedPrice ?? reference ?? "");
  const [reviewer, setReviewer] = useState(() => (choices.find((item) => item.username === listing?.reviewer) || choices[0])?.username || "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const round = (listing?.round || 0) + 1;
  const endpoint = `/api/gameinfo/gamelist/${gameId}/listings${dataMode === "idpass" ? "?mode=idpass" : ""}`;

  async function send() {
    setBusy(true);
    setError("");
    try {
      const data = await apiJson(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId: pack.id, channel: channel.key, url, listedPrice: price, reviewer, note }),
        fallbackError: "ส่งตรวจไม่สำเร็จ",
      });
      onDone(data.listings);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "ส่งตรวจไม่สำเร็จ");
      setBusy(false);
    }
  }

  function submit(event) {
    event.preventDefault();
    if (!reviewer) return setError("เลือกผู้ตรวจก่อนส่งตรวจ");
    if (listing && !note.trim()) return setError("กรอกรายละเอียดที่แก้ไขก่อนส่งตรวจ");
    notices.run([gameinfoSendNotice({ round, lister: nameOf(viewer), reviewer: nameOf(reviewer) })], send);
  }

  return (
    <form className="contents" onSubmit={submit}>
      <div className="gd-vstb pending">
        <span className="si"><Clock size={18} aria-hidden="true" /></span>
        <span className="min-w-0 flex-1"><b>ผู้ตรวจมีเวลา 1 ชั่วโมง</b><span className="d">เกินเวลา ระบบปิดการตรวจ ต้องส่งรอบใหม่</span></span>
      </div>
      <div className="gd-vsec">
        <h4>สินค้าที่ลงบน {channel.label}</h4>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_160px]">
          <label className="gd-field">ลิงก์สินค้า<input className="gd-input" type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://" /></label>
          <label className="gd-field">ราคาที่ลง<input className="gd-input" inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} /></label>
        </div>
      </div>
      <div className="gd-vsec">
        <h4>ผู้ลงแพ็ค</h4>
        <div className="gd-pcard"><span className="gd-av big" aria-hidden="true">{String(nameOf(viewer) || "?").slice(0, 1)}</span><div><b>{nameOf(viewer)}</b><small>ผู้ลงแพ็ค · ส่งตรวจรอบที่ {round}</small></div></div>
      </div>
      <div className="gd-vsec">
        <h4>ผู้ตรวจสอบ</h4>
        {choices.length ? (
          <div className="gd-tabs" role="group" aria-label="ผู้ตรวจสอบ">
            {choices.map((item) => (
              <button key={item.username} type="button" className="gd-tab" aria-pressed={item.username === reviewer} onClick={() => setReviewer(item.username)}>
                <span className="gd-av" aria-hidden="true">{String(item.name || "?").slice(0, 1)}</span>{item.name}
              </button>
            ))}
          </div>
        ) : <span className="gd-note">ยังไม่มี admin คนอื่นให้ส่งตรวจ</span>}
        {reviewer ? <div className="gd-pcard"><span className="gd-av big" aria-hidden="true">{String(nameOf(reviewer) || "?").slice(0, 1)}</span><div><b>{nameOf(reviewer)}</b><small>ผู้ตรวจสอบ · Admin GameInfo</small></div></div> : null}
      </div>
      <div className="gd-vsec">
        <h4>{listing ? "รายละเอียดที่แก้ไข" : "รายละเอียดที่ส่ง"}</h4>
        <textarea
          className="gd-textarea"
          value={note}
          maxLength={500}
          onChange={(event) => setNote(event.target.value)}
          placeholder={listing ? `เช่น แก้ราคาเป็น ${baht(reference)} และเปลี่ยนรูปให้ตรงกับชื่อแพ็ค` : "ไม่ใส่ก็ได้ ระบบจะบันทึกว่า “ลงแพ็คใหม่”"}
          aria-label={listing ? "รายละเอียดที่แก้ไข" : "รายละเอียดที่ส่ง"}
        />
      </div>
      {error ? <p role="alert" className="neg m-0 text-[13px]">{error}</p> : null}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="gd-btn" onClick={onCancel}>ยกเลิก</button>
        <button type="submit" disabled={busy || !choices.length} className="gd-btn red">{busy ? "กำลังส่ง…" : "ส่งตรวจ"}</button>
      </div>
    </form>
  );
}
