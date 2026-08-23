"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronRight, Image as ImageIcon, Search } from "lucide-react";
import { apiJson } from "@/lib/api-json";

const TABS = [
  ["all", "ทั้งหมด"],
  ["claim", "รับ–คืน"],
  ["amount", "เปลี่ยนยอด"],
  ["issue", "ปัญหา–Reject"],
  ["entry", "ข้อมูลเมล"],
  ["system", "คิว–ระบบ"],
  ["admin", "แอดมิน"],
];
const CATEGORIES = new Set(TABS.map(([key]) => key));
const TAB_DESCRIPTIONS = {
  all: "รวมประวัติการรับ–คืน เปลี่ยนยอด ปัญหา ข้อมูลเมล คิว ระบบ และกิจกรรมแอดมิน",
  claim: "เก็บการรับและคืนเมล พร้อมยอดเริ่มต้น ยอดสุดท้าย ผลลัพธ์ ผู้ใช้งาน และเวลา",
  amount: "เก็บการเปลี่ยนยอดเดิมเป็นยอดใหม่ พร้อมผู้ดำเนินการ เวลา และรูปหลักฐาน",
  issue: "เก็บการแจ้งปัญหาและขั้นตอน Reject ตั้งแต่ส่งคำขอจนยืนยัน ปฏิเสธ หรือยกเลิก",
  entry: "เก็บการเพิ่ม แก้ไข ลบ และลบหลายเมล พร้อมรายละเอียดค่าที่เปลี่ยนแปลง",
  system: "เก็บการจัดลำดับคิว Pin, Hold, เมลถาวร และการเปลี่ยนค่าระบบ",
  admin: "เก็บกิจกรรมสำคัญ เช่น ลบหลายเมล ยกเลิก Reject และล้างประวัติ",
};

const ACTION_LABELS = {
  claim: "รับเมล",
  release: "คืนเมล",
  amount_update: "เปลี่ยนยอด",
  issue_report: "แจ้งปัญหา",
  reject: "ขอ Reject",
  reject_confirm: "ยืนยัน Reject",
  reject_decline: "ปฏิเสธ Reject",
  cancel_reject: "ยกเลิก Reject",
  create: "เพิ่มเมล",
  update: "แก้ไขเมล",
  delete: "ลบเมล",
  bulk_delete: "ลบเมลจำนวนมาก",
  priority_reorder: "เปลี่ยนลำดับ Priority",
  priority_pin: "ตั้ง Priority",
  priority_unpin: "ยกเลิก Priority",
  claim_hold: "Hold เมล",
  claim_unhold: "ยกเลิก Hold",
  permanent_enable: "ตั้งเมลถาวร",
  permanent_disable: "ยกเลิกเมลถาวร",
  claim_pause: "หยุดระบบรับเมล",
  claim_resume: "เปิดระบบรับเมล",
  settings_update: "เปลี่ยนค่าระบบ",
  history_clear: "ล้างประวัติ",
};

const FIELD_LABELS = {
  email: "Email",
  password: "Password",
  currency: "สกุลเงิน",
  supplier: "Supplier",
  amount: "ยอด",
  amountConfirmImage: "รูปยืนยัน",
  linkSms: "Link_SMS",
  qna: "QNA",
  startAmount: "ยอดเริ่มต้น",
  endAmount: "ยอดสุดท้าย",
  priorityOrder: "ลำดับ Priority",
  claimHold: "Hold",
  isPermanent: "เมลถาวร",
  maxAmount: "เกณฑ์ใช้หมด",
  claimPaused: "หยุดรับเมล",
  priorityAmountThreshold: "Priority threshold",
  targetHours: "เวลาเป้าหมาย",
  burnRateUsdPerHour: "Burn rate",
  expectedIdleHours: "เวลารอ",
  claimWarningHours: "เวลาเตือน",
  orderedIds: "ลำดับ ID",
};

const OUTCOME_LABELS = {
  depleted: "ใช้หมด",
  partial_release: "คืนบางส่วน",
  unusable: "ใช้งานไม่ได้",
};

function formatTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
}

function displayValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "เปิด" : "ปิด";
  if (Array.isArray(value)) return value.join(" → ") || "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function eventSummary(event) {
  if (event.action === "release") {
    const outcome = OUTCOME_LABELS[event.details.outcome] || event.details.outcome || "คืนเมล";
    return `${outcome} · ใช้ไป ${displayValue(event.details.amountUsed)}`;
  }
  if (event.action === "issue_report") {
    return `${event.details.note || "ไม่ระบุเหตุผล"} · ${event.details.status === "resolved" ? "แก้ไขแล้ว" : "ยังไม่แก้"}`;
  }
  if (event.details?.reason) return event.details.reason;
  const changed = Object.keys({ ...event.oldValues, ...event.newValues });
  return changed.map((key) => FIELD_LABELS[key] || key).join(", ") || "—";
}

function ChangeDetails({ event }) {
  const fields = Object.keys({ ...event.oldValues, ...event.newValues });
  return (
    <div className="space-y-2">
      {fields.length > 0 && (
        <div className="overflow-hidden rounded-md border border-ll-hairline">
          {fields.map((field) => (
            <div key={field} className="grid grid-cols-[150px_1fr] border-t border-ll-hairline px-3 py-2 first:border-t-0">
              <span className="text-ll-ink-subtle">{FIELD_LABELS[field] || field}</span>
              <span className="break-all text-ll-ink">
                {displayValue(event.oldValues[field])} → {displayValue(event.newValues[field])}
              </span>
            </div>
          ))}
        </div>
      )}
      {event.details.note && <p className="whitespace-pre-wrap"><span className="text-ll-ink-subtle">เหตุผล: </span>{event.details.note}</p>}
      {event.details.outcome && <p><span className="text-ll-ink-subtle">ผลลัพธ์: </span>{OUTCOME_LABELS[event.details.outcome] || event.details.outcome}</p>}
      {event.details.amountUsed !== undefined && <p><span className="text-ll-ink-subtle">ยอดที่ใช้: </span>{displayValue(event.details.amountUsed)}</p>}
      {event.details.resolvedAt && <p><span className="text-ll-ink-subtle">สิ้นสุด: </span>{event.details.resolvedByUsername || "—"} · {formatTime(event.details.resolvedAt)}</p>}
      {event.details.reason && <p><span className="text-ll-ink-subtle">เหตุผล: </span>{event.details.reason}</p>}
      {event.details.count !== undefined && <p><span className="text-ll-ink-subtle">จำนวน: </span>{event.details.count}</p>}
      {event.details.counts && <p><span className="text-ll-ink-subtle">รายการที่ล้าง: </span>{Object.entries(event.details.counts).map(([key, value]) => `${key} ${value}`).join(", ")}</p>}
      {event.details.rejectTimeline?.length > 0 && (
        <div className="rounded-md border border-ll-hairline bg-ll-surface-1 p-3">
          <p className="mb-2 font-medium">Reject timeline</p>
          <ol className="space-y-2 border-l border-ll-hairline-strong pl-3">
            {event.details.rejectTimeline.map((item, index) => (
              <li key={`${item.action}-${item.occurredAt}-${index}`}>
                <span className="font-medium">{ACTION_LABELS[item.action] || item.action}</span>
                <span className="block text-ll-ink-subtle">
                  {item.actorUsername || "—"} · {formatTime(item.occurredAt)}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

export default function ItuneHistory() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedCategory = searchParams.get("category") || "all";
  const category = CATEGORIES.has(requestedCategory) ? requestedCategory : "all";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const [search, setSearch] = useState(searchParams.get("q") || "");
  const [events, setEvents] = useState(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [actingId, setActingId] = useState(null);
  const [images, setImages] = useState({});
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    apiJson(`/api/projectm/itune/history?${searchParams.toString()}`, {
      fallbackError: "โหลดประวัติไม่สำเร็จ",
    })
      .then((data) => {
        if (!cancelled) {
          setEvents(data.events || []);
          setTotal(data.total || 0);
        }
      })
      .catch((err) => !cancelled && setError(err.message));
    return () => { cancelled = true; };
  }, [searchParams, reload]);

  function updateParams(changes) {
    setEvents(null);
    setError("");
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (!Object.prototype.hasOwnProperty.call(changes, "page")) next.delete("page");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  async function runRejectAction(event, endpoint, message) {
    if (!window.confirm(message)) return;
    setActingId(event.id);
    try {
      await apiJson(`/api/projectm/itune/claim-log/${event.claimLogId}/${endpoint}`, {
        method: "POST",
        fallbackError: "ดำเนินการ Reject ไม่สำเร็จ",
      });
      setEvents(null);
      setReload((value) => value + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setActingId(null);
    }
  }

  async function loadImage(event) {
    if (images[event.id]) return;
    try {
      const data = await apiJson(event.imageUrl, { fallbackError: "โหลดรูปหลักฐานไม่สำเร็จ" });
      setImages((current) => ({ ...current, [event.id]: data.image }));
    } catch (err) {
      setError(err.message);
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / 50));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 overflow-x-auto pb-1">
        {TABS.map(([key, label]) => (
          <button key={key} type="button" onClick={() => updateParams({ category: key === "all" ? "" : key })}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-medium ${category === key ? "bg-ll-primary text-ll-on-primary" : "text-ll-ink-subtle hover:bg-ll-surface-2"}`}>
            {label}
          </button>
        ))}
      </div>
      <p className="text-[12px] leading-5 text-ll-ink-subtle">
        {TAB_DESCRIPTIONS[category]}
      </p>

      <form onSubmit={(event) => { event.preventDefault(); updateParams({ q: search.trim() }); }} className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_150px_150px_auto]">
        <label className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-3 text-ll-ink-tertiary" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหา Email, ID หรือผู้ใช้งาน"
            className="h-10 w-full rounded-md border border-ll-hairline-strong bg-ll-surface-1 pl-9 pr-3 text-[13px] text-ll-ink outline-none focus:border-ll-primary" />
        </label>
        <input type="date" value={searchParams.get("from") || ""} onChange={(event) => updateParams({ from: event.target.value })}
          aria-label="ตั้งแต่วันที่" className="h-10 rounded-md border border-ll-hairline-strong bg-ll-surface-1 px-3 text-[12px] text-ll-ink" />
        <input type="date" value={searchParams.get("to") || ""} onChange={(event) => updateParams({ to: event.target.value })}
          aria-label="ถึงวันที่" className="h-10 rounded-md border border-ll-hairline-strong bg-ll-surface-1 px-3 text-[12px] text-ll-ink" />
        <button type="submit" className="h-10 rounded-md bg-ll-primary px-4 text-[12px] font-medium text-ll-on-primary hover:bg-ll-primary-hover">ค้นหา</button>
      </form>

      <div className="overflow-hidden rounded-lg border border-ll-hairline bg-ll-surface-1 shadow-[var(--ll-shadow-card)]">
        {error && <p className="p-4 text-[13px] text-ll-primary-subtle-text">{error}</p>}
        {!error && events === null && <p className="p-5 text-center text-[13px] text-ll-ink-tertiary">กำลังโหลด...</p>}
        {!error && events?.length === 0 && <p className="p-5 text-center text-[13px] text-ll-ink-tertiary">ไม่พบประวัติ</p>}
        {!error && events?.map((event) => {
          const open = expanded === event.id;
          return (
            <div key={event.id} className="border-t border-ll-hairline first:border-t-0">
              <button type="button" onClick={() => setExpanded(open ? null : event.id)} className="grid w-full grid-cols-[22px_120px_minmax(140px,1fr)] items-center gap-2 px-3 py-3 text-left text-[12px] hover:bg-ll-surface-2 sm:grid-cols-[22px_135px_minmax(120px,1fr)_minmax(160px,1.5fr)_140px]">
                {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span className="whitespace-nowrap text-ll-ink-subtle">{formatTime(event.occurredAt)}</span>
                <span className="font-medium text-ll-ink">{ACTION_LABELS[event.action] || event.action}</span>
                <span className="hidden truncate text-ll-ink sm:block" title={event.entryEmail}>{event.entryEmail || (event.entryId ? `ID ${event.entryId}` : eventSummary(event))}</span>
                <span className="hidden truncate text-ll-ink-subtle sm:block">{event.actorUsername || "—"}</span>
              </button>
              {open && (
                <div className="border-t border-ll-hairline bg-ll-surface-2/40 px-4 py-4 text-[12px] text-ll-ink sm:px-10">
                  <p className="mb-3 text-ll-ink-subtle">{eventSummary(event)}</p>
                  <ChangeDetails event={event} />
                  <div className="mt-3 flex flex-wrap gap-2">
                    {event.imageUrl && <button type="button" onClick={() => loadImage(event)} className="flex items-center gap-1.5 rounded-md border border-ll-hairline-strong px-3 py-1.5 font-medium hover:bg-ll-surface-2"><ImageIcon size={13} /> ดูรูปหลักฐาน</button>}
                    {event.canConfirm && <button type="button" disabled={actingId === event.id} onClick={() => runRejectAction(event, "confirm-reject", `ยืนยัน Reject ของ ${event.entryEmail || `ID ${event.entryId}`}?`)} className="rounded-md bg-ll-primary px-3 py-1.5 font-medium text-ll-on-primary disabled:opacity-50">ยืนยัน Reject</button>}
                    {event.canDecline && <button type="button" disabled={actingId === event.id} onClick={() => runRejectAction(event, "decline-reject", `ปฏิเสธคำขอ Reject ของ ${event.entryEmail || `ID ${event.entryId}`}?`)} className="rounded-md border border-ll-hairline-strong px-3 py-1.5 font-medium disabled:opacity-50">ปฏิเสธคำขอ</button>}
                    {event.canCancel && <button type="button" disabled={actingId === event.id} onClick={() => runRejectAction(event, "cancel-reject", `ยกเลิก Reject ของ ${event.entryEmail || `ID ${event.entryId}`}?`)} className="rounded-md border border-ll-hairline-strong px-3 py-1.5 font-medium disabled:opacity-50">ยกเลิก Reject</button>}
                  </div>
                  {images[event.id] && <Image src={images[event.id]} alt="รูปหลักฐาน" width={900} height={600} unoptimized className="mt-3 max-h-80 max-w-full rounded-md border border-ll-hairline object-contain" />}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {total > 0 && <div className="flex items-center justify-between text-[12px] text-ll-ink-subtle">
        <span>{total} รายการ · หน้า {page}/{pageCount}</span>
        <div className="flex gap-2">
          <button type="button" disabled={page <= 1} onClick={() => updateParams({ page: String(page - 1) })} className="rounded-md border border-ll-hairline-strong px-3 py-1.5 disabled:opacity-40">ก่อนหน้า</button>
          <button type="button" disabled={page >= pageCount} onClick={() => updateParams({ page: String(page + 1) })} className="rounded-md border border-ll-hairline-strong px-3 py-1.5 disabled:opacity-40">ถัดไป</button>
        </div>
      </div>}
    </div>
  );
}
