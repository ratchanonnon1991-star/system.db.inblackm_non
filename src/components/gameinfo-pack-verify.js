"use client";

import { useState } from "react";
import { CircleAlert, Clock, ExternalLink, ShieldCheck, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { apiJson } from "@/lib/api-json";
import { GAMEINFO_LISTING_PRICE_CHANNEL, summarizeGameinfoPackListings } from "@/lib/gameinfo-pack-listings";

const num = (value) => (value === null || value === undefined ? "—" : Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 }));
const baht = (value) => (value === null || value === undefined ? "—" : `฿${num(value)}`);
const when = (value) => (value
  ? new Date(value).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
  : "");
const BADGE_ICON = { bad: CircleAlert, warn: Clock, ok: ShieldCheck, none: ShieldCheck };
const STATUS_PILL = { ok: "green", pending: "amber", wrong: "red" };
const STATUS_WORD = { ok: "ตรวจแล้ว", pending: "รอตรวจ", wrong: "ราคาผิด" };

/** The row's badge: what the pack's listings come to, and the way into them. */
export function GameinfoPackVerifyButton({ packName, listings, onOpen }) {
  const summary = summarizeGameinfoPackListings(listings);
  const Icon = BADGE_ICON[summary.tone];
  return (
    <button type="button" className={`gd-vbtn ${summary.tone}`} onClick={onOpen} aria-label={`ตรวจสอบสินค้า ${packName}: ${summary.label}`}>
      <Icon size={15} aria-hidden="true" />
      <span>{summary.label}</span>
    </button>
  );
}

/**
 * One pack's listings, a tab per sales channel: the link, who listed it at
 * what price, who checked it and what they found. Listing and checking are
 * separate permissions, so each form shows only to those who may use it.
 */
export function GameinfoPackVerifyDialog({
  open,
  onOpenChange,
  gameId,
  dataMode,
  pack,
  channels,
  listings,
  referencePrices = {},
  cost = null,
  product = false,
  canList = false,
  canReview = false,
  viewer = "",
  onListingsChange,
  className = "",
}) {
  const byChannel = new Map(listings.map((listing) => [listing.channel, listing]));
  const firstToLook = channels.find((channel) => byChannel.get(channel.key)?.status === "wrong")
    || channels.find((channel) => byChannel.get(channel.key)?.status === "pending")
    || channels[0];
  const [tab, setTab] = useState(firstToLook?.key);
  const channel = channels.find((item) => item.key === tab) || channels[0];
  const listing = channel ? byChannel.get(channel.key) || null : null;
  const reference = channel && GAMEINFO_LISTING_PRICE_CHANNEL[channel.key] ? referencePrices[GAMEINFO_LISTING_PRICE_CHANNEL[channel.key]] ?? null : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className={`gd gd-modal sm:max-w-[680px] ${className}`}>
        <div className="gd-mhead">
          <span className="gd-micon"><ShieldCheck size={24} aria-hidden="true" /></span>
          <div className="min-w-0">
            <DialogTitle className="text-xl leading-tight font-semibold text-white">ตรวจสอบสินค้า</DialogTitle>
            <DialogDescription className="truncate text-[13px] text-white/90">{pack.name}{pack.amountReceived ? ` (${pack.amountReceived})` : ""}</DialogDescription>
          </div>
          <button type="button" className="ml-auto grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/20 text-white" aria-label="ปิด" onClick={() => onOpenChange(false)}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="gd-mbody">
          <div className="gd-tabs" role="tablist" aria-label="ช่องทางขาย">
            {channels.map((item) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                className="gd-tab"
                aria-selected={item.key === channel?.key}
                onClick={() => setTab(item.key)}
              >
                <i className={`gd-td ${byChannel.get(item.key)?.status || ""}`} aria-hidden="true" />
                {item.label}
              </button>
            ))}
          </div>
          {channel ? (
            <ChannelListing
              key={`${channel.key}-${listing?.listedAt || ""}-${listing?.reviewedAt || ""}`}
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
              onListingsChange={onListingsChange}
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ChannelListing({ gameId, dataMode, pack, channel, listing, reference, cost, product, canList, canReview, viewer, onListingsChange }) {
  const [url, setUrl] = useState(listing?.url || "");
  const [price, setPrice] = useState(listing?.listedPrice ?? reference ?? "");
  const [checkedPrice, setCheckedPrice] = useState(listing?.checkedPrice ?? listing?.listedPrice ?? "");
  const [note, setNote] = useState(listing?.note || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const endpoint = `/api/gameinfo/gamelist/${gameId}/listings${dataMode === "idpass" ? "?mode=idpass" : ""}`;

  async function send(method, body, fallbackError) {
    setBusy(true);
    setError("");
    try {
      const data = await apiJson(endpoint, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), fallbackError });
      onListingsChange(data.listings);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : fallbackError);
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

  const status = listing?.status || "";
  const banner = !listing
    ? { tone: "", Icon: ShieldCheck, title: "ยังไม่ได้ลงสินค้าในช่องทางนี้", detail: canList ? "ใส่ลิงก์และราคาที่ลงด้านล่าง" : "ยังไม่มีข้อมูลการลงสินค้า" }
    : status === "wrong"
      ? { tone: "wrong", Icon: CircleAlert, title: "ราคาผิด", detail: `ลงไว้ ${baht(listing.checkedPrice ?? listing.listedPrice)}${reference !== null ? ` แต่ควรเป็น ${baht(reference)}` : ""}${listing.note ? ` · ${listing.note}` : ""}` }
      : status === "ok"
        ? { tone: "ok", Icon: ShieldCheck, title: "ตรวจแล้ว ราคาตรงกัน", detail: `โดย ${listing.reviewedBy || "—"} · ${when(listing.reviewedAt)}` }
        : listing.stale
          ? { tone: "pending", Icon: Clock, title: "ต้องตรวจใหม่", detail: `ราคาในระบบเปลี่ยนเป็น ${baht(reference)} หลัง ${listing.reviewedBy || "—"} ตรวจไว้ที่ ${baht(listing.checkedReference)}` }
          : { tone: "pending", Icon: Clock, title: "รอตรวจสอบ", detail: "ลงหรือแก้แล้ว ต้องให้ admin คนอื่นตรวจ" };
  // The one who listed it never checks it, so the check is always a second pair of eyes.
  const ownListing = Boolean(listing && viewer && listing.listedBy === viewer);
  const profit = reference !== null && cost !== null ? reference - cost : null;

  return (
    <>
      {listing?.url ? (
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

      {listing ? (
        <>
          <div className="gd-vsec">
            <h4>ผู้ลงสินค้า</h4>
            <div className="gd-kvl"><span>ชื่อ</span><span>{listing.listedBy || "—"}</span></div>
            <div className="gd-kvl"><span>วันที่ลง / อัปเดตล่าสุด</span><span>{when(listing.listedAt)}</span></div>
            <div className="gd-kvl"><span>ราคาที่ลง</span><span className={status === "wrong" ? "neg" : status === "ok" ? "pos" : ""}>{listing.listedPrice === null ? "ยังไม่มีราคา" : baht(listing.listedPrice)}</span></div>
            {reference !== null ? <div className="gd-kvl"><span>ราคาที่ถูกต้อง</span><span className="pos">{baht(reference)}</span></div> : null}
          </div>
          <div className="gd-vsec">
            <h4>ผู้ตรวจสอบ <span className={`gd-pill ${STATUS_PILL[status]}`}>{STATUS_WORD[status]}</span></h4>
            <div className="gd-kvl"><span>ชื่อ</span><span>{listing.reviewedBy || "—"}</span></div>
            <div className="gd-kvl"><span>วันที่ตรวจ</span><span>{listing.reviewedAt ? when(listing.reviewedAt) : "ยังไม่ได้ตรวจ"}</span></div>
            <div className="gd-kvl"><span>ราคาที่ตรวจ</span><span className={status === "wrong" ? "neg" : ""}>{status === "pending" && !listing.stale ? "—" : `${baht(listing.checkedPrice)} · ${status === "wrong" ? "ไม่ตรง" : "ตรงกัน"}`}</span></div>
            {listing.note ? <div className="gd-kvl"><span>หมายเหตุ</span><span>{listing.note}</span></div> : null}
          </div>
        </>
      ) : null}

      {product && reference !== null ? (
        <div className="gd-sum">
          <div className="gd-sbox"><small>ราคาขาย</small><b>{baht(reference)}</b><span>{channel.label}</span></div>
          <div className="gd-sbox"><small>ต้นทุน</small><b>{baht(cost)}</b><span>ต่อแพ็ค</span></div>
          <div className="gd-sbox"><small>กำไร</small><b className={profit === null ? "" : profit >= 0 ? "pos" : "neg"}>{profit === null || !reference ? "—" : `${num((profit / reference) * 100)}%`}</b><span>{baht(profit)}</span></div>
        </div>
      ) : null}

      {listing && ownListing && canReview ? (
        <p className="gd-note m-0">คุณเป็นผู้ลงสินค้านี้ ต้องให้ admin คนอื่นตรวจ</p>
      ) : null}
      {canReview && listing && !ownListing ? (
        <form
          className="gd-vsec"
          onSubmit={(event) => {
            event.preventDefault();
            const result = event.nativeEvent.submitter?.value;
            send("POST", { packId: pack.id, channel: channel.key, status: result, checkedPrice, referencePrice: reference, note }, "บันทึกผลตรวจไม่สำเร็จ");
          }}
        >
          <h4>บันทึกผลการตรวจ</h4>
          <div className="grid gap-2 sm:grid-cols-[160px_minmax(0,1fr)]">
            <label className="gd-field">ราคาที่เห็นบนช่องทาง<input className="gd-input" inputMode="decimal" value={checkedPrice} onChange={(event) => setCheckedPrice(event.target.value)} /></label>
            <label className="gd-field">หมายเหตุ<input className="gd-input" value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} placeholder="เช่น ลงผิดแพ็ค ราคาเก่า" /></label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" value="ok" disabled={busy} className="gd-btn sm bg-[color:var(--gd-green)]! text-white!">ราคาตรง ตรวจแล้ว</button>
            <button type="submit" value="wrong" disabled={busy} className="gd-btn sm red">ราคาผิด</button>
          </div>
        </form>
      ) : null}

      {canList ? (
        <form
          className="gd-vsec"
          onSubmit={(event) => {
            event.preventDefault();
            send("PUT", { packId: pack.id, channel: channel.key, url, listedPrice: price }, "บันทึกการลงสินค้าไม่สำเร็จ");
          }}
        >
          <h4>{listing ? "แก้ลิงก์หรือราคาที่ลง" : "ลงสินค้าในช่องทางนี้"}</h4>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_160px]">
            <label className="gd-field">ลิงก์สินค้า<input className="gd-input" type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://" /></label>
            <label className="gd-field">ราคาที่ลง<input className="gd-input" inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} /></label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" disabled={busy} className="gd-btn sm red">{busy ? "กำลังบันทึก…" : "บันทึก"}</button>
            {listing ? (
              <button type="button" disabled={busy} className="gd-btn sm" onClick={() => send("PUT", { packId: pack.id, channel: channel.key, url: "", listedPrice: "" }, "ลบการลงสินค้าไม่สำเร็จ")}>ลบการลงสินค้านี้</button>
            ) : null}
            <span className="gd-note">บันทึกแล้วจะกลับเป็น “รอตรวจ” จนกว่าจะมีคนตรวจใหม่</span>
          </div>
        </form>
      ) : null}

      {error ? <p role="alert" className="neg m-0 text-[13px]">{error}</p> : null}
    </>
  );
}
