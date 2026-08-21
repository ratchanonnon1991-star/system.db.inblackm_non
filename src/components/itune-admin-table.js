"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  BookmarkPlus,
  CalendarDays,
  Check,
  ChevronsLeft,
  ChevronsRight,
  Copy,
  Filter,
  History,
  Image as ImageIcon,
  MoreVertical,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { apiJson } from "@/lib/api-json";
import {
  computeEffectiveItuneStatus,
  ITUNE_DEPLETED_STATUS,
  ITUNE_UNAVAILABLE_STATUS,
} from "@/lib/itune-status";
import { useItuneSettings } from "@/lib/itune-settings";
import { useMinuteTicker } from "@/lib/itune-ticker";
import { readImageFileAsDataUrl } from "@/lib/itune-image";
import { nextItuneTableSort, sortItuneTableRows } from "@/lib/itune-table-sort";
import ItuneComboInput from "@/components/itune-combo-input";
import ItuneCountdownCell from "@/components/itune-countdown-cell";
import ItuneImagePickerModal from "@/components/itune-image-picker-modal";
import ItuneImagePreview from "@/components/itune-image-preview";
import ItunePasswordValue, { ItunePasswordInput } from "@/components/itune-password-value";

function uniq(arr) {
  return Array.from(new Set(arr.filter(Boolean))).sort((a, b) => a.localeCompare(b, "th"));
}

function isTempId(id) {
  return typeof id === "string" && id.startsWith("temp-");
}

const EDITABLE_FIELDS = [
  "email",
  "password",
  "currency",
  "supplier",
  "amount",
  "linkSms",
  "qna",
];

// Every column the table renders, in header order — the single source of
// truth for both what the search box searches and what the filter popup
// lists to turn on/off. Keys line up with the row shape (see
// makeEmptyEntry), except "status" (derived from amount, see StatusBadge)
// which has no column of its own on the row.
const SEARCH_COLUMNS = [
  { key: "id", label: "ID" },
  { key: "addedAt", label: "Date_time" },
  { key: "email", label: "Email" },
  { key: "password", label: "Password" },
  { key: "status", label: "Status" },
  { key: "createdByUsername", label: "เพิ่มโดย" },
  { key: "claimedByUsername", label: "รับไปโดย" },
  { key: "currency", label: "สกุลเงิน" },
  { key: "supplier", label: "Supplier" },
  { key: "amount", label: "Amount" },
  { key: "amountConfirmImage", label: "รูปยืนยัน" },
  { key: "linkSms", label: "Link_SMS" },
  { key: "qna", label: "QNA" },
];

const PAGE_SIZES = [10, 25, 50, 100, 200];

function bangkokDate(offsetDays = 0) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date())
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  return new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + offsetDays))
    .toISOString()
    .slice(0, 10);
}

function defaultDateRange() {
  return { from: bangkokDate(-1), to: bangkokDate() };
}

// Text to match a column's value against — mirrors what the cell actually
// displays (formatted date, derived status label, 2-decimal amount) rather
// than the raw stored value, so a search for what's on screen finds it.
function searchValueFor(row, key) {
  if (key === "id") return isTempId(row.id) ? "" : String(row.id);
  if (key === "addedAt") {
    const ms = row.addedAt ? new Date(row.addedAt).getTime() : NaN;
    return Number.isFinite(ms) ? new Date(ms).toLocaleDateString("th-TH") : "";
  }
  if (key === "status") return computeEffectiveItuneStatus(row).label;
  if (key === "amount") {
    const num = Number(row.amount);
    return Number.isFinite(num) ? num.toFixed(2) : "";
  }
  const value = row[key];
  return value == null ? "" : String(value);
}

function makeEmptyEntry(tempId) {
  return {
    id: tempId,
    // Captured the moment the row is added, not when it's saved — the
    // countdown (col 2) starts ticking immediately, even on an unsaved draft.
    addedAt: new Date().toISOString(),
    email: "",
    password: "",
    createdByUserId: null,
    createdByUsername: null,
    claimedByUserId: null,
    claimedByUsername: null,
    currency: "",
    supplier: "",
    amount: 0,
    amountConfirmImage: "",
    linkSms: "",
    qna: "",
  };
}

const STATUS_TONE_CLASS = {
  subtle: "bg-ll-surface-2 text-ll-ink-subtle",
  warning: "bg-ll-warning-bg text-ll-warning",
  success: "bg-ll-success-bg text-ll-success",
  danger: "bg-ll-primary-subtle-bg text-ll-primary-subtle-text",
};

function SortHeader({ column, sort, onSort, className = "" }) {
  const direction = sort?.key === column.key ? sort.direction : null;
  return (
    <button
      type="button"
      onClick={() => onSort(column.key)}
      title="คลิกเพื่อเรียง: น้อยไปมาก → มากไปน้อย → ลำดับเดิม"
      className={`flex min-w-0 items-center gap-1 truncate px-3 py-2 text-left hover:text-ll-ink ${className}`}
    >
      <span className="truncate">{column.label}</span>
      {direction === "asc" ? (
        <ArrowUp size={11} className="shrink-0" />
      ) : direction === "desc" ? (
        <ArrowDown size={11} className="shrink-0" />
      ) : (
        <ArrowUpDown size={11} className="shrink-0 opacity-40" />
      )}
    </button>
  );
}

// Portal-rendered tooltip, positioned off the trigger's own bounding rect —
// same technique RowActionsMenu uses for its dropdown. A native `title`
// tooltip has a browser hover delay before it appears; this shows the
// moment the pointer enters, which is what the reported-problem text on the
// status badge needs.
function ItuneTooltip({ text, anchorRef }) {
  const [pos, setPos] = useState(null);

  useEffect(() => {
    const r = anchorRef.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ bottom: window.innerHeight - r.top + 6, left: r.left });
  }, [anchorRef]);

  if (!pos || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="tooltip"
      style={{ bottom: pos.bottom, left: pos.left }}
      className="pointer-events-none fixed z-[80] max-w-xs whitespace-pre-wrap rounded-md bg-ll-ink px-2.5 py-1.5 text-[12px] leading-snug text-ll-surface-1 shadow-[var(--ll-shadow-modal)]"
    >
      {text}
    </div>,
    document.body
  );
}

function StatusBadge({ row }) {
  const { label, tone } = computeEffectiveItuneStatus(row);
  const badgeRef = useRef(null);
  const [hovering, setHovering] = useState(false);
  // The reported problem text (see ItuneReportIssueModal) rides along on the
  // badge as a custom tooltip (see ItuneTooltip) rather than a floating tag
  // dropped directly in the cell — this table also scrolls, and anything
  // positioned outside a row's own box risks being clipped by the table's
  // scroll container or overlapping the row below it.
  const tooltipText = tone === "danger" && row?.otherNotes ? row.otherNotes : null;
  return (
    <span
      ref={badgeRef}
      onMouseEnter={() => tooltipText && setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE_CLASS[tone]} ${
        tooltipText ? "cursor-help" : ""
      }`}
    >
      {label}
      {hovering && tooltipText && <ItuneTooltip text={tooltipText} anchorRef={badgeRef} />}
    </span>
  );
}

// Popup for reporting a problem with a row — same overlay/portal shape as
// Confirming this dialog sets the row's status to
// ITUNE_UNAVAILABLE_STATUS server-side (see reportItuneEntryIssue) — this is
// a persisted override, not the amount-derived status.
function ItuneReportIssueModal({ onConfirm, onClose, submitting, error }) {
  const [note, setNote] = useState("");

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm overflow-hidden rounded-lg border border-ll-hairline bg-ll-surface-1 shadow-[var(--ll-shadow-modal)]">
        <div className="flex items-center justify-between border-b border-ll-hairline px-4 py-2.5">
          <h2 className="text-sm font-semibold text-ll-ink">แจ้งปัญหา</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded text-ll-ink-tertiary hover:bg-ll-surface-2 hover:text-ll-ink"
            aria-label="ปิด"
          >
            <X size={14} />
          </button>
        </div>

        <div className="p-4">
          <label className="block text-[13px] font-medium text-ll-ink">
            ปัญหาที่พบ
            <textarea
              autoFocus
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="อธิบายปัญหาที่พบ..."
              className="mt-1.5 w-full resize-none rounded-md border border-ll-hairline-strong bg-ll-surface-2 px-3 py-2 text-sm text-ll-ink outline-none focus:border-ll-primary"
            />
          </label>
          <p className="mt-1.5 text-[11px] text-ll-ink-subtle">
            ยืนยันแล้วสถานะของรายการนี้จะเปลี่ยนเป็น &quot;{ITUNE_UNAVAILABLE_STATUS}&quot;
          </p>
          {error && <p className="mt-2 text-[12px] text-ll-primary">{error}</p>}

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-md px-3 py-1.5 text-[13px] font-medium text-ll-ink-subtle hover:bg-ll-surface-2 disabled:opacity-50"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={() => onConfirm(note.trim())}
              disabled={submitting || !note.trim()}
              className="rounded-md bg-ll-primary px-3 py-1.5 text-[13px] font-medium text-ll-on-primary hover:bg-ll-primary-hover disabled:opacity-50"
            >
              {submitting ? "กำลังบันทึก..." : "ยืนยัน"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// "แก้ไขยอด" popup for an existing (already-saved) row — unlike every other
// EDITABLE_FIELDS cell, an amount change goes straight to the server (see
// saveAmount/updateItuneEntryAmount) instead of riding along with the
// generic bulk-save button, since it needs its own history-log entry. If
// the new number differs from the row's last-saved amount, a fresh confirm
// image is required — the row's existing image only ever confirmed the OLD
// balance, so it's deliberately not shown here as a starting point (the
// user picks a brand new one, never reusing/editing the old one).
function ItuneAmountEditModal({ row, saving, error, onSave, onClose }) {
  const [amountInput, setAmountInput] = useState(String(row.amount));
  const [image, setImage] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const amount = Number(amountInput);
  const amountValid = amountInput.trim() !== "" && Number.isFinite(amount) && amount >= 0;
  const amountChanged = amountValid && amount !== Number(row.amount);
  const needsImage = amountChanged && !image;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm overflow-hidden rounded-lg border border-ll-hairline bg-ll-surface-1 shadow-[var(--ll-shadow-modal)]">
        <div className="flex items-center justify-between border-b border-ll-hairline px-4 py-2.5">
          <h2 className="text-sm font-semibold text-ll-ink">แก้ไขยอด</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded text-ll-ink-tertiary hover:bg-ll-surface-2 hover:text-ll-ink"
            aria-label="ปิด"
          >
            <X size={14} />
          </button>
        </div>

        <div className="p-4">
          <p className="text-[12px] text-ll-ink-subtle">
            ยอดปัจจุบัน: {Number(row.amount).toFixed(2)}
          </p>
          <label className="mt-2 block text-[13px] font-medium text-ll-ink">
            ยอดใหม่
            <input
              autoFocus
              type="number"
              step="0.01"
              min="0"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              className="mt-1.5 h-9 w-full rounded-md border border-ll-hairline-strong bg-ll-surface-2 px-2 text-sm text-ll-ink outline-none focus:border-ll-primary"
            />
          </label>

          {amountChanged && (
            <div className="mt-3">
              <p className="text-[12px] font-medium text-ll-ink">รูปยืนยันยอดใหม่</p>
              <p className="mt-0.5 text-[11px] text-ll-ink-subtle">
                ยอดมีการเปลี่ยนแปลง — ต้องแนบรูปยืนยันยอดใหม่ (รูปเดิมใช้ยืนยันยอดเก่าไปแล้ว)
              </p>
              <div className="mt-1.5">
                {image ? (
                  <ItuneImagePreview src={image} onClick={() => setPickerOpen(true)}>
                    <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-md border border-ll-hairline-strong bg-ll-surface-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={image} alt="" className="h-full w-full object-cover" />
                    </div>
                  </ItuneImagePreview>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    className="flex h-16 w-16 items-center justify-center rounded-md border border-dashed border-ll-hairline-strong text-ll-ink-tertiary hover:bg-ll-surface-2"
                  >
                    <ImageIcon size={18} />
                  </button>
                )}
              </div>
              {pickerOpen && (
                <ItuneImagePickerModal
                  value={image}
                  onChange={setImage}
                  onClose={() => setPickerOpen(false)}
                />
              )}
            </div>
          )}

          {!amountValid && (
            <p className="mt-2 flex items-center gap-1.5 text-[12px] text-ll-primary-subtle-text">
              <AlertTriangle size={13} /> กรอกยอดเป็นตัวเลขไม่ติดลบ
            </p>
          )}
          {error && (
            <p className="mt-2 flex items-center gap-1.5 text-[12px] text-ll-primary-subtle-text">
              <AlertTriangle size={13} /> {error}
            </p>
          )}

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-md px-3 py-1.5 text-[13px] font-medium text-ll-ink-subtle hover:bg-ll-surface-2 disabled:opacity-50"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={() => onSave(amount, image || undefined)}
              disabled={saving || !amountValid || needsImage || !amountChanged}
              className="rounded-md bg-ll-primary px-3 py-1.5 text-[13px] font-medium text-ll-on-primary hover:bg-ll-primary-hover disabled:opacity-50"
            >
              {saving ? "กำลังบันทึก..." : "บันทึก"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Static display <-> input toggle, single active cell at a time app-wide
// (tracked by the table via `editing`) — same click-to-edit shape as
// gameinfo-gamelist-table.js's cell components.
function EditableCell({ editing, display, onStartEdit, onContextMenu, copyText, children }) {
  if (!editing) {
    return (
      <div className="flex min-w-0 items-center">
        <span
          role="button"
          tabIndex={0}
          onClick={onStartEdit}
          onKeyDown={(e) => e.key === "Enter" && onStartEdit()}
          onContextMenu={onContextMenu}
          className="block min-h-[28px] min-w-0 flex-1 cursor-text truncate rounded px-1.5 py-1 text-sm text-ll-ink hover:bg-ll-surface-2"
        >
          {display || <span className="text-ll-ink-tertiary">—</span>}
        </span>
        <CopyButton text={copyText} />
      </div>
    );
  }
  return (
    <div className="min-w-0" data-editing-cell="true" onContextMenu={onContextMenu}>
      {children}
    </div>
  );
}

// Trailing copy-icon, revealed on hovering the row (`group/row` on the row's
// outer div). Same writeText + transient "copied" flash idiom as
// panel-table.js's CopyCell. Renders nothing for an empty value so blank
// cells don't grow a dead button.
function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), 1200);
    return () => clearTimeout(timer);
  }, [copied]);

  if (!text) return null;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard?.writeText(text).then(() => setCopied(true), () => {});
      }}
      className="ml-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-ll-ink-tertiary opacity-0 transition hover:bg-ll-surface-3 hover:text-ll-ink group-hover/row:opacity-100"
      title="คัดลอก"
      aria-label="คัดลอก"
    >
      {copied ? <Check size={12} className="text-ll-success" /> : <Copy size={12} />}
    </button>
  );
}

// "⋮" row menu, same shape as gameinfo-gamelist-table.js's RowActionsMenu —
// portal-rendered from the trigger's own bounding rect (the table's rounded
// outer box uses overflow-x-auto, which would clip an inline dropdown for
// any row near the bottom or right edge).
function RowActionsMenu({
  row,
  onDelete,
  onCopyRow,
  onReportIssue,
  onResolveIssue,
  amountHistoryHref,
  onTogglePermanent,
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e) {
      if (menuRef.current?.contains(e.target) || triggerRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    function onKeyDown(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function toggleOpen() {
    if (!open) {
      const r = triggerRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    }
    setOpen((o) => !o);
  }

  return (
    <span className="relative flex justify-center">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggleOpen}
        className="flex h-7 w-7 items-center justify-center rounded-full text-ll-ink-tertiary hover:bg-ll-surface-2 hover:text-ll-ink"
        aria-label="เมนู"
        title="เมนู"
      >
        <MoreVertical size={16} />
      </button>
      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            style={{ top: pos.top, right: pos.right }}
            className="fixed z-50 w-40 overflow-hidden rounded-md border border-ll-hairline bg-ll-surface-1 py-1 shadow-[var(--ll-shadow-modal)]"
          >
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onCopyRow(row);
              }}
              className="block w-full px-3 py-2 text-left text-xs text-ll-ink hover:bg-ll-surface-2"
            >
              คัดลอกทั้งแถว
            </button>
            {amountHistoryHref && (
              <Link
                href={amountHistoryHref}
                onClick={() => setOpen(false)}
                className="block w-full px-3 py-2 text-left text-xs text-ll-ink hover:bg-ll-surface-2"
              >
                ประวัติยอด
              </Link>
            )}
            {onTogglePermanent && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onTogglePermanent(row);
                }}
                className="block w-full px-3 py-2 text-left text-xs text-ll-ink hover:bg-ll-surface-2"
              >
                {row.isPermanent ? "ตั้งกลับเป็นเมลปกติ" : "ตั้งเป็นเมลถาวร"}
              </button>
            )}
            {onReportIssue && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onReportIssue(row);
                }}
                className="block w-full px-3 py-2 text-left text-xs text-ll-ink hover:bg-ll-surface-2"
              >
                แจ้งปัญหา
              </button>
            )}
            {onResolveIssue && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onResolveIssue(row);
                }}
                className="block w-full px-3 py-2 text-left text-xs text-ll-ink hover:bg-ll-surface-2"
              >
                เปลี่ยนเป็น &quot;ใช้งานได้ปกติ&quot;
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onDelete(row);
              }}
              className="block w-full px-3 py-2 text-left text-xs text-ll-primary hover:bg-ll-primary-subtle-bg"
            >
              ลบ
            </button>
          </div>,
          document.body
        )}
    </span>
  );
}

// Same technique gameinfo-gamelist-table.js uses (its own GRID_COLS) — a
// plain HTML <table> auto-sizes columns to fit whatever is in them, so
// swapping a cell's static text for an <input> on edit grows that column and
// reflows the whole table. CSS Grid tracks declared with a fixed length
// never resize for their content; an edit-mode input just fills the track
// it's already been given. Columns with genuinely unpredictable content
// (Email, Link_SMS, QNA) use gameinfo's minmax(px,fr) pattern instead of a
// fixed px so they can actually grow into extra space — a flat px width on
// those either truncates real values or, on any column with short values,
// leaves the rest of the table looking sparsely spaced. The trailing action
// column (the "⋮" row menu) stays a small fixed px on purpose: it's the last
// track, so pinning it keeps the menu glued to the table's true right edge
// at any viewport width instead of one of the flexible columns swallowing
// the leftover space before it.
const GRID_COLS =
  "grid-cols-[40px_50px_180px_minmax(180px,1fr)_minmax(180px,0.8fr)_120px_100px_100px_80px_150px_120px_100px_minmax(130px,1fr)_minmax(180px,1fr)_44px]";

// The table's minimum width, derived straight from GRID_COLS's own track
// list (every `Npx` — bare tracks and the min side of `minmax(Npx, fr)`
// tracks both match once) rather than a hand-typed number that can drift
// out of sync with GRID_COLS. Forced explicitly on the scroll wrapper below
// because a CSS grid row's own box (used to paint its background/border)
// doesn't automatically grow to fit tracks wider than its container — on a
// narrow viewport the row's content would render past its own painted
// background/divider line otherwise (visible overflow paints the cells at
// their track position regardless of how wide the row's own box is).
const GRID_MIN_WIDTH = (GRID_COLS.match(/\d+px/g) || []).reduce(
  (sum, px) => sum + parseInt(px, 10),
  0
);

// ยกเลิก and บันทึก's collapsible slots in the floating pill share this exact
// width — see the pill's render comment below.
const SIDE_SLOT_WIDTH = "w-[104px]";

// Popup window that picks which columns the
// search box matches against. `excluded` is the list of column keys to skip;
// checked in the list below means "included in search" (unchecking a column
// adds it to `excluded`), so the default empty list reads as "search
// everything" without needing to enumerate all the keys up front.
function ItuneAdminFilterModal({ excluded, onChangeExcluded, onClose }) {
  const [query, setQuery] = useState("");
  const excludedSet = useMemo(() => new Set(excluded), [excluded]);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const visibleColumns = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SEARCH_COLUMNS;
    return SEARCH_COLUMNS.filter((c) => c.label.toLowerCase().includes(q));
  }, [query]);

  function toggleColumn(key, checked) {
    const next = new Set(excludedSet);
    if (checked) next.delete(key);
    else next.add(key);
    onChangeExcluded(Array.from(next));
  }

  // Press-and-drag multi-toggle: holding the mouse down on one column and
  // dragging over others applies whatever state the FIRST one landed on
  // (check or uncheck) to every column the cursor passes over, same gesture
  // spreadsheets use for dragging a checkbox column. dragValueRef holds that
  // target state for the whole gesture; draggingRef just tracks whether one
  // is in progress. Refs, not state, since neither needs to trigger a
  // re-render — only the excluded list (already state, via onChangeExcluded)
  // does.
  const draggingRef = useRef(false);
  const dragValueRef = useRef(true);

  useEffect(() => {
    function stopDragging() {
      draggingRef.current = false;
    }
    document.addEventListener("mouseup", stopDragging);
    return () => document.removeEventListener("mouseup", stopDragging);
  }, []);

  function startDrag(key) {
    const nextChecked = excludedSet.has(key);
    dragValueRef.current = nextChecked;
    draggingRef.current = true;
    toggleColumn(key, nextChecked);
  }

  function continueDrag(key) {
    if (!draggingRef.current) return;
    toggleColumn(key, dragValueRef.current);
  }

  function selectAll() {
    // "Select all" only affects columns currently in view, in case the list
    // is filtered by the column-search box — the rest keep whatever state
    // they already had.
    const next = new Set(excludedSet);
    for (const c of visibleColumns) next.delete(c.key);
    onChangeExcluded(Array.from(next));
  }

  function clearAll() {
    const next = new Set(excludedSet);
    for (const c of visibleColumns) next.add(c.key);
    onChangeExcluded(Array.from(next));
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[80vh] w-full max-w-sm flex-col overflow-hidden rounded-lg border border-ll-hairline bg-ll-surface-1 shadow-[var(--ll-shadow-modal)]">
        <div className="flex items-center justify-between border-b border-ll-hairline px-4 py-2.5">
          <h2 className="text-sm font-semibold text-ll-ink">คอลัมน์ที่จะค้นหา</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded text-ll-ink-tertiary hover:bg-ll-surface-2 hover:text-ll-ink"
            aria-label="ปิด"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex flex-col gap-2 border-b border-ll-hairline p-3">
          <div className="relative">
            <Search
              size={13}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ll-ink-tertiary"
            />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="หาคอลัมน์..."
              className="h-8 w-full rounded-md border border-ll-hairline-strong bg-ll-surface-2 pl-7 pr-7 text-[13px] text-ll-ink outline-none focus:border-ll-primary"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-ll-ink-tertiary hover:bg-ll-surface-3 hover:text-ll-ink"
                aria-label="ล้างคำค้นหา"
                title="ล้างคำค้นหา"
              >
                <X size={12} />
              </button>
            )}
          </div>
          <div className="flex items-center gap-3 text-[12px] font-medium">
            <button
              type="button"
              onClick={selectAll}
              className="text-ll-primary hover:text-ll-primary-hover"
            >
              เลือกทั้งหมด
            </button>
            <button
              type="button"
              onClick={clearAll}
              className="text-ll-ink-subtle hover:text-ll-ink"
            >
              ล้างทั้งหมด
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {visibleColumns.length === 0 ? (
            <p className="px-2 py-4 text-center text-[12px] text-ll-ink-tertiary">
              ไม่พบคอลัมน์ที่ตรงกับการค้นหา
            </p>
          ) : (
            visibleColumns.map((c) => (
              <label
                key={c.key}
                onMouseDown={(e) => {
                  // Own the whole gesture here instead of the checkbox's
                  // onChange — preventDefault stops the native label click
                  // from also toggling it a second time, and skips a second
                  // React re-render fighting the one startDrag already did.
                  e.preventDefault();
                  startDrag(c.key);
                }}
                onMouseEnter={() => continueDrag(c.key)}
                className="flex select-none items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-ll-ink hover:bg-ll-surface-2"
              >
                <input
                  type="checkbox"
                  checked={!excludedSet.has(c.key)}
                  readOnly
                  className="pointer-events-none h-3.5 w-3.5 accent-ll-primary"
                />
                {c.label}
              </label>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function ItuneDateFilterModal({ value, loading, error, onApply, onClose }) {
  const [from, setFrom] = useState(value.from || "");
  const [to, setTo] = useState(value.to || "");
  const empty = !from && !to;
  const invalid = !empty && (!from || !to || from > to);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === "Escape" && !loading) onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [loading, onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-lg border border-ll-hairline bg-ll-surface-1 p-4 shadow-[var(--ll-shadow-modal)]">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ll-ink">กรองตามวันที่เพิ่มเมล</h2>
          <button type="button" onClick={onClose} disabled={loading} aria-label="ปิด" className="flex h-7 w-7 items-center justify-center rounded text-ll-ink-tertiary hover:bg-ll-surface-2">
            <X size={14} />
          </button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="text-xs font-medium text-ll-ink-subtle">
            จากวันที่
            <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-ll-hairline-strong bg-ll-surface-1 px-2 text-sm text-ll-ink outline-none focus:border-ll-primary" />
          </label>
          <label className="text-xs font-medium text-ll-ink-subtle">
            ถึงวันที่
            <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-ll-hairline-strong bg-ll-surface-1 px-2 text-sm text-ll-ink outline-none focus:border-ll-primary" />
          </label>
        </div>
        {invalid && <p className="mt-2 text-xs text-ll-primary-subtle-text">กรุณาเลือกช่วงวันที่ให้ถูกต้อง</p>}
        {error && <p className="mt-2 text-xs text-ll-primary-subtle-text">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" disabled={loading} onClick={() => onApply({ all: "1" })} className="rounded-md px-3 py-2 text-xs text-ll-ink-subtle hover:bg-ll-surface-2">
            แสดงทั้งหมด
          </button>
          <button type="button" disabled={loading} onClick={() => onApply(defaultDateRange())} className="rounded-md px-3 py-2 text-xs text-ll-ink-subtle hover:bg-ll-surface-2">
            วันนี้และเมื่อวาน
          </button>
          <button type="button" disabled={loading || empty || invalid} onClick={() => onApply({ from, to })} className="rounded-md bg-ll-emphasis-bg px-3 py-2 text-xs font-medium text-ll-emphasis-text disabled:opacity-40">
            {loading ? "กำลังโหลด..." : "โหลดรายการ"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function ItuneAdminTable({ initialEntries }) {
  const pathname = usePathname();
  const [rows, setRows] = useState(initialEntries);
  const [savedRows, setSavedRows] = useState(initialEntries);
  const [dirtyIds, setDirtyIds] = useState(new Set());
  const [editing, setEditing] = useState(null); // { id, field }
  // Enter commits the current cell and jumps straight into the next one in
  // EDITABLE_FIELDS order — same row, next column to the right. Falls off
  // the end of the row silently (no wraparound into the next row).
  function focusNextField(rowId, field) {
    const index = EDITABLE_FIELDS.indexOf(field);
    const next = index >= 0 ? EDITABLE_FIELDS[index + 1] : undefined;
    setEditing(next ? { id: rowId, field: next } : null);
  }
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedFilterId, setSelectedFilterId] = useState("");
  // The table keeps only its search-column filter locally.
  const [openPanel, setOpenPanel] = useState(null); // null | "filter" | "date"
  const [dateRange, setDateRange] = useState(defaultDateRange);
  const [loadingDates, setLoadingDates] = useState(false);
  const [dateError, setDateError] = useState("");
  const [imagePickerFor, setImagePickerFor] = useState(null);
  const [imageError, setImageError] = useState({});
  const [reportFor, setReportFor] = useState(null);
  const [reporting, setReporting] = useState(false);
  const [reportError, setReportError] = useState("");
  const [amountEditFor, setAmountEditFor] = useState(null);
  const [savingAmount, setSavingAmount] = useState(false);
  const [amountEditError, setAmountEditError] = useState("");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deletingSelected, setDeletingSelected] = useState(false);
  const tempCounter = useRef(0);
  const now = useMinuteTicker();
  const [settings, setSetting] = useItuneSettings();

  // "บันทึกแล้ว" toast auto-collapses 3s after each save — same pattern as
  // gameinfo-gamelist-table.js. Re-triggers every save since savedAt gets a
  // fresh timestamp each time.
  const [savedAt, setSavedAt] = useState(null);
  const [savedVisible, setSavedVisible] = useState(false);
  useEffect(() => {
    if (!savedAt) return;
    setSavedVisible(true);
    const hideTimer = setTimeout(() => setSavedVisible(false), 3000);
    return () => clearTimeout(hideTimer);
  }, [savedAt]);

  // Clicking anywhere outside the actively-edited cell closes it back to
  // display mode — the cell itself is marked data-editing-cell="true" while
  // open (see EditableCell / the amount cell), and a combobox's own
  // portal-rendered suggestion list is marked data-ll-combo-dropdown so
  // picking a suggestion doesn't get treated as "outside" and close the
  // cell out from under the click.
  useEffect(() => {
    if (!editing) return;
    function onDocMouseDown(e) {
      if (e.target.closest?.('[data-editing-cell="true"]')) return;
      if (e.target.closest?.('[data-ll-combo-dropdown="true"]')) return;
      setEditing(null);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [editing]);

  const dirty = dirtyIds.size > 0;

  const suggestions = useMemo(
    () => ({
      email: uniq(savedRows.map((r) => r.email)),
      password: uniq(savedRows.map((r) => r.password)),
      currency: uniq(savedRows.map((r) => r.currency)),
      supplier: uniq(savedRows.map((r) => r.supplier)),
      linkSms: uniq(savedRows.map((r) => r.linkSms)),
      qna: uniq(savedRows.map((r) => r.qna)),
    }),
    [savedRows]
  );

  // Which row id(s) currently hold each non-empty Link_SMS value, off the
  // live working set (`rows`, not `savedRows`) so an in-progress edit on
  // another row shows up here too — not just already-saved conflicts. Same
  // "warn at the combobox, block the save button" shape as
  // gameinfo-gamelist-table.js's GameinfoNameInput/duplicateIds pair, just
  // derived here instead of tracked via an onDuplicateChange callback per
  // input — a plain value→owners map is all a uniqueness check needs, no
  // per-field fuzzy-match state to accumulate.
  const linkSmsOwnersByValue = useMemo(() => {
    const map = new Map();
    for (const row of rows) {
      const value = String(row.linkSms || "").trim();
      if (!value) continue;
      const ids = map.get(value) || [];
      ids.push(row.id);
      map.set(value, ids);
    }
    return map;
  }, [rows]);

  // Every row id currently sharing its Link_SMS value with at least one
  // other row — feeds both the combobox's duplicate banner (comboCell below)
  // and the "บันทึก" button's disabled state/banner, same role
  // gameinfo-gamelist-table.js's duplicateIds plays for game names.
  const duplicateLinkSmsRowIds = useMemo(() => {
    const ids = new Set();
    for (const owners of linkSmsOwnersByValue.values()) {
      if (owners.length > 1) owners.forEach((id) => ids.add(id));
    }
    return ids;
  }, [linkSmsOwnersByValue]);

  // Always an array — useItuneSettings seeds it from DEFAULT_SETTINGS before
  // localStorage is even read (see itune-settings.js), so this is never undefined.
  const searchExcludedColumns = settings.searchExcludedColumns;
  const savedFilters = Array.isArray(settings.savedFilters) ? settings.savedFilters : [];
  const dateTimeMode = settings.dateTimeMode === "dateTime" ? "dateTime" : "remaining";
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    const excluded = new Set(searchExcludedColumns);
    const activeColumns = SEARCH_COLUMNS.filter((c) => !excluded.has(c.key));
    return rows.filter((row) =>
      activeColumns.some((c) => searchValueFor(row, c.key).toLowerCase().includes(q))
    );
  }, [rows, search, searchExcludedColumns]);
  const sortedRows = useMemo(() => sortItuneTableRows(filteredRows, sort), [filteredRows, sort]);
  const pageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * pageSize;
  const visibleRows = sortedRows.slice(pageStart, pageStart + pageSize);
  const selectableFilteredIds = visibleRows.filter((row) => !isTempId(row.id)).map((row) => row.id);
  const allFilteredSelected =
    selectableFilteredIds.length > 0 && selectableFilteredIds.every((id) => selectedIds.has(id));

  function saveFilter() {
    const name = window.prompt("ตั้งชื่อชุดตัวกรองนี้", search.trim() || "ตัวกรองใหม่");
    if (!name?.trim()) return;
    const filter = {
      id: String(Date.now()),
      name: name.trim(),
      search,
      excludedColumns: searchExcludedColumns,
    };
    setSetting("savedFilters", [...savedFilters, filter]);
    setSelectedFilterId(filter.id);
  }

  function applyFilter(filterId) {
    setSelectedFilterId(filterId);
    const filter = savedFilters.find((item) => item.id === filterId);
    if (!filter) return;
    setSearch(filter.search || "");
    setSetting("searchExcludedColumns", filter.excludedColumns || []);
    setPage(1);
  }

  function deleteSelectedFilter() {
    if (!selectedFilterId || !window.confirm("ลบชุดตัวกรองนี้?")) return;
    setSetting("savedFilters", savedFilters.filter((item) => item.id !== selectedFilterId));
    setSelectedFilterId("");
  }

  // A trailing/leading space typed mid-edit shouldn't flip a row to dirty —
  // trim before comparing, same as gameinfo-gamelist-table.js's updateField.
  function fieldsEqual(a, b) {
    const sa = String(a ?? "");
    const sb = String(b ?? "");
    return sa.trim() === sb.trim();
  }

  function updateField(rowId, field, value) {
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, [field]: value } : r)));
    const saved = savedRows.find((r) => r.id === rowId);
    setDirtyIds((prev) => {
      const next = new Set(prev);
      if (isTempId(rowId) || !saved || !fieldsEqual(saved[field], value)) {
        next.add(rowId);
      } else {
        // Only drop the dirty flag once every field on this row matches saved again.
        const current = rows.find((r) => r.id === rowId);
        const merged = current ? { ...current, [field]: value } : null;
        const stillDirty =
          merged && EDITABLE_FIELDS.some((f) => !fieldsEqual(saved[f], merged[f]));
        if (!stillDirty) next.delete(rowId);
      }
      return next;
    });
  }

  function addRow() {
    tempCounter.current += 1;
    const tempId = `temp-${tempCounter.current}`;
    const entry = makeEmptyEntry(tempId);
    setRows((prev) => [...prev, entry]);
    setDirtyIds((prev) => new Set(prev).add(tempId));
    setSearch("");
    setSort(null);
    setPage(Math.ceil((rows.length + 1) / pageSize));
    setEditing({ id: tempId, field: EDITABLE_FIELDS[0] });
  }

  function cancelAll() {
    if (!window.confirm("ยกเลิกการแก้ไขทั้งหมด?")) return;
    setRows(savedRows);
    setDirtyIds(new Set());
    setEditing(null);
    setSaveError("");
  }

  async function saveAll() {
    // Belt-and-suspenders — the button is already disabled while
    // duplicateLinkSmsRowIds is non-empty (same guard shape as
    // gameinfo-gamelist-table.js's saveAll/duplicateIds). Mirrored
    // server-side in insertItuneEntry/updateItuneEntry as the authoritative
    // check either way.
    if (duplicateLinkSmsRowIds.size > 0) return;
    const missingInitialProof = rows.some(
      (row) => isTempId(row.id) && dirtyIds.has(row.id) && !row.amountConfirmImage
    );
    if (missingInitialProof) {
      setSaveError("เมลใหม่ทุกแถวต้องแนบรูปยืนยันยอดเริ่มต้นก่อนบันทึก");
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      const idMap = {};
      const creates = rows.filter((r) => isTempId(r.id) && dirtyIds.has(r.id));
      const updates = rows.filter((r) => !isTempId(r.id) && dirtyIds.has(r.id));

      await Promise.all(
        creates.map(async (row) => {
          const payload = {
            ...Object.fromEntries(EDITABLE_FIELDS.map((f) => [f, row[f]])),
            addedAt: row.addedAt,
            amountConfirmImage: row.amountConfirmImage,
          };
          const data = await apiJson("/api/projectm/itune", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            fallbackError: "เพิ่มรายการไม่สำเร็จ",
          });
          idMap[row.id] = data.entry;
        })
      );

      await Promise.all(
        updates.map(async (row) => {
          const payload = Object.fromEntries(EDITABLE_FIELDS.map((f) => [f, row[f]]));
          await apiJson(`/api/projectm/itune/${row.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            fallbackError: "บันทึกรายการไม่สำเร็จ",
          });
        })
      );

      setRows((prev) => prev.map((r) => (idMap[r.id] ? idMap[r.id] : r)));
      setSavedRows((prev) => {
        const withoutTemp = prev.filter((r) => !isTempId(r.id));
        const merged = [...withoutTemp];
        for (const row of rows) {
          const resolved = idMap[row.id] || row;
          const i = merged.findIndex((r) => r.id === resolved.id);
          if (i >= 0) merged[i] = resolved;
          else merged.push(resolved);
        }
        return merged;
      });
      setDirtyIds(new Set());
      setEditing(null);
      setSavedAt(Date.now());
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function loadDateRange(nextRange) {
    if (dirty && !window.confirm("มีรายการที่ยังไม่ได้บันทึก ต้องการละทิ้งและเปลี่ยนช่วงวันที่หรือไม่?")) return;
    setLoadingDates(true);
    setDateError("");
    try {
      const params = new URLSearchParams(nextRange);
      const data = await apiJson(`/api/projectm/itune?${params}`, {
        fallbackError: "โหลดรายการตามวันที่ไม่สำเร็จ",
      });
      setRows(data.entries || []);
      setSavedRows(data.entries || []);
      setDirtyIds(new Set());
      setSelectedIds(new Set());
      setEditing(null);
      setDateRange(nextRange.all ? {} : nextRange);
      setPage(1);
      setOpenPanel(null);
    } catch (err) {
      setDateError(err.message);
    } finally {
      setLoadingDates(false);
    }
  }

  async function deleteRow(row) {
    if (isTempId(row.id)) {
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setDirtyIds((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
      return;
    }
    if (!window.confirm(`ลบรายการ ID ${row.id}?`)) return;
    try {
      await apiJson(`/api/projectm/itune/${row.id}`, {
        method: "DELETE",
        fallbackError: "ลบรายการไม่สำเร็จ",
      });
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setSavedRows((prev) => prev.filter((r) => r.id !== row.id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
    } catch (err) {
      window.alert(err.message);
    }
  }

  function toggleSelected(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllFiltered() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) selectableFilteredIds.forEach((id) => next.delete(id));
      else selectableFilteredIds.forEach((id) => next.add(id));
      return next;
    });
  }

  async function deleteSelected() {
    const ids = [...selectedIds];
    if (!ids.length || !window.confirm(`ลบ ${ids.length} รายการที่เลือก? การลบนี้ย้อนกลับไม่ได้`)) return;
    setDeletingSelected(true);
    try {
      await apiJson("/api/projectm/itune", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
        fallbackError: "ลบหลายรายการไม่สำเร็จ",
      });
      const deleted = new Set(ids);
      setRows((prev) => prev.filter((row) => !deleted.has(row.id)));
      setSavedRows((prev) => prev.filter((row) => !deleted.has(row.id)));
      setDirtyIds((prev) => new Set([...prev].filter((id) => !deleted.has(id))));
      setSelectedIds(new Set());
    } catch (err) {
      window.alert(err.message);
    } finally {
      setDeletingSelected(false);
    }
  }

  async function saveImage(row, dataUrl) {
    if (isTempId(row.id)) {
      updateField(row.id, "amountConfirmImage", dataUrl);
      return;
    }
    const previous = row.amountConfirmImage;
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, amountConfirmImage: dataUrl } : r)));
    setImageError((prev) => ({ ...prev, [row.id]: "" }));
    try {
      await apiJson(`/api/projectm/itune/${row.id}/image`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: dataUrl }),
        fallbackError: "บันทึกรูปไม่สำเร็จ",
      });
      setSavedRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, amountConfirmImage: dataUrl } : r))
      );
    } catch (err) {
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, amountConfirmImage: previous } : r))
      );
      setImageError((prev) => ({ ...prev, [row.id]: err.message }));
    }
  }

  // "แก้ไขยอด" — goes through the same endpoint/history log the topup
  // self-service "อัปเดตยอดคงเหลือ" flow uses (see updateItuneEntryAmount),
  // unlike every other EDITABLE_FIELDS cell which just bulk-saves via the
  // top "บันทึกที่แก้ไข" button — an amount change needs its own log entry
  // (and, when the number actually moves, a fresh confirm image), so it
  // can't ride along with the generic per-row PUT.
  async function saveAmount(row, amount, image) {
    setSavingAmount(true);
    setAmountEditError("");
    try {
      const data = await apiJson(`/api/projectm/itune/${row.id}/amount`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, image }),
        fallbackError: "บันทึกยอดไม่สำเร็จ",
      });
      setRows((prev) => prev.map((r) => (r.id === row.id ? data.entry : r)));
      setSavedRows((prev) => prev.map((r) => (r.id === row.id ? data.entry : r)));
      setAmountEditFor(null);
    } catch (err) {
      setAmountEditError(err.message);
    } finally {
      setSavingAmount(false);
    }
  }

  async function reportIssue(row, note) {
    setReporting(true);
    setReportError("");
    try {
      const data = await apiJson(`/api/projectm/itune/${row.id}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
        fallbackError: "แจ้งปัญหาไม่สำเร็จ",
      });
      setRows((prev) => prev.map((r) => (r.id === row.id ? data.entry : r)));
      setSavedRows((prev) => prev.map((r) => (r.id === row.id ? data.entry : r)));
      setReportFor(null);
    } catch (err) {
      setReportError(err.message);
    } finally {
      setReporting(false);
    }
  }

  async function resolveIssue(row) {
    if (!window.confirm(`เปลี่ยนสถานะรายการ ID ${row.id} เป็น "ใช้งานได้ปกติ"?`)) return;
    try {
      const data = await apiJson(`/api/projectm/itune/${row.id}/report`, {
        method: "DELETE",
        fallbackError: "เปลี่ยนสถานะไม่สำเร็จ",
      });
      setRows((prev) => prev.map((r) => (r.id === row.id ? data.entry : r)));
      setSavedRows((prev) => prev.map((r) => (r.id === row.id ? data.entry : r)));
    } catch (err) {
      window.alert(err.message);
    }
  }

  // "ตั้งเป็นเมลถาวร" / "ตั้งกลับเป็นเมลปกติ" — toggles isPermanent, which
  // exempts the row's countdown from counting at all (see
  // ItuneCountdownCell's `frozen` prop below).
  async function togglePermanent(row) {
    try {
      const data = await apiJson(`/api/projectm/itune/${row.id}/permanent`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPermanent: !row.isPermanent }),
        fallbackError: "เปลี่ยนสถานะไม่สำเร็จ",
      });
      setRows((prev) => prev.map((r) => (r.id === row.id ? data.entry : r)));
      setSavedRows((prev) => prev.map((r) => (r.id === row.id ? data.entry : r)));
    } catch (err) {
      window.alert(err.message);
    }
  }

  async function handleThumbRightClick(event, row) {
    if (!settings.rightClickPaste) return; // let the browser's native menu show
    event.preventDefault();
    if (isTempId(row.id)) return;
    try {
      if (!navigator.clipboard?.read) return;
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((t) => t.startsWith("image/"));
        if (!imageType) continue;
        const blob = await item.getType(imageType);
        const dataUrl = await readImageFileAsDataUrl(blob);
        await saveImage(row, dataUrl);
        return;
      }
      // No image on the clipboard — leave the field untouched; Ctrl+V/upload remain available.
    } catch {
      // Clipboard-read permission denied or unsupported in this browser —
      // best-effort feature, silently fall back to Ctrl+V / upload.
    }
  }

  // Same right-click-to-paste gesture as the image column, applied to every
  // editable text/date/number cell: right-click drops in whatever's on the
  // clipboard and jumps straight into edit mode, whether or not the cell was
  // already being edited — no need to open the field first.
  async function handleCellRightClickPaste(event, rowId, field) {
    if (!settings.rightClickPaste) return; // let the browser's native menu show
    event.preventDefault();
    try {
      if (!navigator.clipboard?.readText) return;
      const text = await navigator.clipboard.readText();
      if (!text) return;
      updateField(rowId, field, text);
      setEditing({ id: rowId, field });
    } catch {
      // Clipboard-read permission denied or unsupported in this browser —
      // best-effort feature, silently fall back to Ctrl+V inside the input.
    }
  }

  // Same 10 fields the per-cell copy buttons cover, in table-column order —
  // joined with tabs so pasting into Excel/Sheets lands as one row.
  const COPY_ROW_FIELDS = ["id", "addedAt", "email", "password", "createdByUsername", "currency", "supplier", "amount", "linkSms", "qna"];
  function copyRow(row) {
    const line = COPY_ROW_FIELDS.map((key) => searchValueFor(row, key)).join("\t");
    navigator.clipboard?.writeText(line);
  }

  // Only Link_SMS has a uniqueness rule — for every other field this stays
  // undefined and ItuneComboInput just skips rendering the duplicate banner.
  // Same "มีเกมชื่อนี้อยู่แล้วในระบบ" banner shape as GameinfoNameInput, with
  // the row ids it collides with named instead of a generic message since
  // there's no free-text match to describe here, just an exact one.
  function linkSmsDuplicateMessage(row) {
    const value = String(row.linkSms || "").trim();
    const owners = (linkSmsOwnersByValue.get(value) || []).filter((id) => id !== row.id);
    if (!owners.length) return null;
    const label = owners.map((id) => (isTempId(id) ? "แถวใหม่" : `ID ${id}`)).join(", ");
    return `Link_SMS นี้ถูกใช้แล้วที่ ${label}`;
  }

  function comboCell(row, field, label) {
    const value = row[field] || "";
    const isEditing = editing?.id === row.id && editing?.field === field;
    const duplicateMessage = field === "linkSms" ? linkSmsDuplicateMessage(row) : null;
    const display = field === "password" ? <ItunePasswordValue value={value} /> : value;
    return (
      <EditableCell
        editing={isEditing}
        display={display}
        onStartEdit={() => setEditing({ id: row.id, field })}
        onContextMenu={(e) => handleCellRightClickPaste(e, row.id, field)}
        copyText={settings.copyButtonsEnabled ? value : ""}
      >
        {field === "password" ? (
          <ItunePasswordInput
            value={value}
            onChange={(v) => updateField(row.id, field, v)}
            onEnter={() => focusNextField(row.id, field)}
            className="w-full rounded-md border border-ll-primary bg-ll-surface-1 px-2 py-1 text-sm text-ll-ink outline-none"
          />
        ) : (
          <ItuneComboInput
            value={value}
            onChange={(v) => updateField(row.id, field, v)}
            suggestions={suggestions[field] || []}
            placeholder={label}
            autoFocus
            onEnter={() => focusNextField(row.id, field)}
            className="w-full rounded-md border border-ll-primary bg-ll-surface-1 px-2 py-1 text-sm text-ll-ink outline-none"
            isDuplicate={Boolean(duplicateMessage)}
            duplicateMessage={duplicateMessage}
          />
        )}
      </EditableCell>
    );
  }

  const rangeStart = filteredRows.length === 0 ? 0 : pageStart + 1;
  const rangeEnd = Math.min(filteredRows.length, pageStart + pageSize);
  const paginationBar = filteredRows.length > 0 && (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <label className="flex items-center gap-2 text-xs font-medium text-ll-ink-muted">
        แสดงต่อหน้า
        <select
          value={pageSize}
          onChange={(event) => {
            setPageSize(Number(event.target.value));
            setPage(1);
          }}
          className="h-8 rounded-lg border border-ll-hairline-strong bg-ll-surface-1 px-2.5 text-xs text-ll-ink outline-none"
        >
          {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
      </label>
      <div className="flex items-center gap-3">
        <span className="text-xs text-ll-ink-tertiary">{rangeStart}-{rangeEnd} จาก {filteredRows.length}</span>
        <div className="flex items-center gap-1">
          {[
            ["หน้าแรก", () => setPage(1), currentPage === 1, ChevronsLeft],
            ["ก่อนหน้า", () => setPage(Math.max(1, currentPage - 1)), currentPage === 1, ArrowLeft],
            ["ถัดไป", () => setPage(Math.min(pageCount, currentPage + 1)), currentPage >= pageCount, ArrowRight],
            ["หน้าสุดท้าย", () => setPage(pageCount), currentPage >= pageCount, ChevronsRight],
          ].map(([label, onClick, disabled, Icon]) => (
            <button key={label} type="button" onClick={onClick} disabled={disabled} title={label} aria-label={label} className="flex h-8 w-8 items-center justify-center rounded-lg border border-ll-hairline-strong text-ll-ink-muted hover:bg-ll-surface-2 disabled:opacity-40">
              <Icon size={14} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-3 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ll-ink-tertiary"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="ค้นหา..."
              className="h-9 w-56 rounded-md border border-ll-hairline-strong bg-ll-surface-1 pl-8 pr-8 text-sm text-ll-ink outline-none focus:border-ll-primary"
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setPage(1);
                }}
                className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-ll-ink-tertiary hover:bg-ll-surface-2 hover:text-ll-ink"
                aria-label="ล้างคำค้นหา"
                title="ล้างคำค้นหา"
              >
                <X size={13} />
              </button>
            )}
            </div>
            <button
              type="button"
              onClick={() => setOpenPanel("filter")}
              className="relative flex h-9 items-center gap-1.5 rounded-md border border-ll-hairline-strong px-3 text-xs font-medium text-ll-ink-subtle hover:bg-ll-surface-2"
              title="เลือกคอลัมน์ที่จะค้นหา"
            >
              <Filter size={14} /> คอลัมน์
              {searchExcludedColumns.length > 0 && (
                <span className="h-1.5 w-1.5 rounded-full bg-ll-primary" />
              )}
            </button>
            <button
              type="button"
              onClick={saveFilter}
              className="flex h-9 items-center gap-1.5 rounded-md border border-ll-hairline-strong px-3 text-xs font-medium text-ll-ink-subtle hover:bg-ll-surface-2"
              title="บันทึกคำค้นหาและคอลัมน์ที่เลือก"
            >
              <BookmarkPlus size={14} /> บันทึกชุดกรอง
            </button>
            <button
              type="button"
              onClick={() => {
                setDateError("");
                setOpenPanel("date");
              }}
              className="flex h-9 items-center gap-2 rounded-md border border-ll-hairline-strong px-2.5 text-xs text-ll-ink-subtle hover:bg-ll-surface-2"
              title="โหลดรายการตามวันที่"
            >
              <CalendarDays size={15} /> {dateRange.from ? `${dateRange.from} – ${dateRange.to}` : "ทั้งหมด"}
            </button>
            {openPanel === "filter" && (
              <ItuneAdminFilterModal
                excluded={searchExcludedColumns}
                onChangeExcluded={(next) => setSetting("searchExcludedColumns", next)}
                onClose={() => setOpenPanel(null)}
              />
            )}
            {openPanel === "date" && (
              <ItuneDateFilterModal
                value={dateRange}
                loading={loadingDates}
                error={dateError}
                onApply={loadDateRange}
                onClose={() => setOpenPanel(null)}
              />
            )}
          </div>
          {savedFilters.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-ll-ink-tertiary">ชุดที่บันทึก</span>
              <select
                value={selectedFilterId}
                onChange={(event) => applyFilter(event.target.value)}
                className="h-8 max-w-52 rounded-md border border-ll-hairline bg-ll-surface-2 px-2 text-xs text-ll-ink outline-none focus:border-ll-primary"
                aria-label="เลือกชุดตัวกรองที่บันทึกไว้"
              >
                <option value="">เลือกชุดกรอง...</option>
                {savedFilters.map((filter) => (
                  <option key={filter.id} value={filter.id}>{filter.name}</option>
                ))}
              </select>
              {selectedFilterId && (
                <button
                  type="button"
                  onClick={deleteSelectedFilter}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-ll-ink-tertiary hover:bg-ll-primary-subtle-bg hover:text-ll-primary"
                  title="ลบชุดตัวกรองที่เลือก"
                  aria-label="ลบชุดตัวกรองที่เลือก"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`${pathname}/history?category=entry`}
            className="flex h-9 items-center gap-1.5 rounded-md border border-ll-hairline-strong px-3 text-xs font-medium text-ll-ink-subtle hover:bg-ll-surface-2"
          >
            <History size={14} /> ประวัติข้อมูล
          </Link>
          {selectedIds.size > 0 && (
            <button
              type="button"
              onClick={deleteSelected}
              disabled={deletingSelected}
              className="flex h-9 items-center gap-1.5 rounded-md border border-ll-primary/30 px-3 text-xs font-medium text-ll-primary hover:bg-ll-primary-subtle-bg disabled:opacity-50"
            >
              <Trash2 size={14} /> {deletingSelected ? "กำลังลบ..." : `ลบที่เลือก (${selectedIds.size})`}
            </button>
          )}
        </div>
      </div>

      {paginationBar}

      <div className="overflow-x-auto rounded-lg border border-ll-hairline bg-ll-surface-1 shadow-[var(--ll-shadow-card)]">
        <div className="w-full text-sm" style={{ minWidth: GRID_MIN_WIDTH }}>
          <div
            className={`grid ${GRID_COLS} border-b border-ll-hairline bg-ll-surface-2 text-left text-[11px] font-medium uppercase tracking-wide text-ll-ink-subtle`}
          >
            {/* Only the trailing "⋮" column is frozen (sticky right-0, own
                opaque background) — the header row's bg-ll-surface-2 only
                paints the row's own content box, which scrolls with
                everything else, so a sticky child needs to repaint itself
                or the columns scrolling underneath show through it. ID went
                back to scrolling with the rest of the row (not frozen). */}
            <div className="flex items-center justify-center px-2 py-2">
              <input
                type="checkbox"
                checked={allFilteredSelected}
                onChange={toggleAllFiltered}
                disabled={selectableFilteredIds.length === 0}
                aria-label="เลือกทุกรายการที่แสดง"
              />
            </div>
            <SortHeader column={SEARCH_COLUMNS[0]} sort={sort} onSort={(key) => { setSort((current) => nextItuneTableSort(current, key)); setPage(1); }} className="justify-center" />
            <div className="flex items-center justify-between gap-1">
              <SortHeader column={SEARCH_COLUMNS[1]} sort={sort} onSort={(key) => { setSort((current) => nextItuneTableSort(current, key)); setPage(1); }} />
              <span className="flex rounded-full border border-ll-hairline bg-ll-surface-1 p-0.5 normal-case tracking-normal">
                {[["remaining", "คงเหลือ"], ["dateTime", "วันเวลา"]].map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setSetting("dateTimeMode", mode)}
                    aria-pressed={dateTimeMode === mode}
                    className={`rounded-full px-2 py-1 text-[10px] font-medium ${
                      dateTimeMode === mode
                        ? "bg-ll-emphasis-bg text-ll-emphasis-text"
                        : "text-ll-ink-tertiary hover:text-ll-ink"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </span>
            </div>
            {SEARCH_COLUMNS.slice(2).map((column) => (
              <SortHeader
                key={column.key}
                column={column}
                sort={sort}
                onSort={(key) => {
                  setSort((current) => nextItuneTableSort(current, key));
                  setPage(1);
                }}
                className={column.key === "amount" ? "justify-end" : column.key === "amountConfirmImage" ? "justify-center" : ""}
              />
            ))}
            <div className="sticky right-0 z-10 bg-ll-surface-2 px-3 py-2" />
          </div>

          {visibleRows.map((row) => (
            <div
              key={row.id}
              className={`group/row grid ${GRID_COLS} items-center border-b border-ll-hairline last:border-0 hover:bg-ll-surface-2/50`}
            >
              <div className="flex items-center justify-center px-2 py-2">
                {!isTempId(row.id) && (
                  <input
                    type="checkbox"
                    checked={selectedIds.has(row.id)}
                    onChange={() => toggleSelected(row.id)}
                    aria-label={`เลือก ID ${row.id}`}
                  />
                )}
              </div>
              <div className="min-w-0 truncate px-3 py-2 text-center font-mono text-xs text-ll-ink-subtle">
                {isTempId(row.id) ? (
                  "ใหม่"
                ) : (
                  <span className="flex items-center justify-center">
                    {row.id}
                    <CopyButton text={settings.copyButtonsEnabled ? String(row.id) : ""} />
                  </span>
                )}
              </div>
              <div className="flex min-w-0 items-center truncate px-3 py-2">
                <ItuneCountdownCell
                  addedAt={row.addedAt}
                  now={now}
                  frozen={computeEffectiveItuneStatus(row).label === ITUNE_DEPLETED_STATUS}
                  permanent={row.isPermanent}
                  mode={dateTimeMode}
                />
                <CopyButton text={settings.copyButtonsEnabled ? searchValueFor(row, "addedAt") : ""} />
              </div>
              <div className="min-w-0 px-3 py-2">{comboCell(row, "email", "Email")}</div>
              <div className="min-w-0 px-3 py-2">{comboCell(row, "password", "Password")}</div>
              <div className="min-w-0 px-3 py-2">
                <StatusBadge row={row} />
                {reportFor === row.id && (
                  <ItuneReportIssueModal
                    submitting={reporting}
                    error={reportError}
                    onConfirm={(note) => reportIssue(row, note)}
                    onClose={() => {
                      if (reporting) return;
                      setReportFor(null);
                      setReportError("");
                    }}
                  />
                )}
              </div>
              <div className="flex min-w-0 items-center truncate px-3 py-2 text-xs text-ll-ink-subtle">
                {row.createdByUsername || "-"}
                <CopyButton
                  text={settings.copyButtonsEnabled ? row.createdByUsername || "" : ""}
                />
              </div>
              {/* Set/cleared by the topup self-service "รับเมล"/"คืนเมล" flow
                  (see itune-topup-view.js) — independent of createdByUsername
                  above (who originally entered the row as admin). */}
              <div className="flex min-w-0 items-center truncate px-3 py-2 text-xs text-ll-ink-subtle">
                {row.claimedByUsername || "-"}
                <CopyButton
                  text={settings.copyButtonsEnabled ? row.claimedByUsername || "" : ""}
                />
              </div>
              <div className="min-w-0 px-3 py-2">{comboCell(row, "currency", "สกุลเงิน")}</div>
              <div className="min-w-0 px-3 py-2">{comboCell(row, "supplier", "Supplier")}</div>
              <div
                className="min-w-0 px-3 py-2 text-right"
                data-editing-cell={
                  editing?.id === row.id && editing?.field === "amount" ? "true" : undefined
                }
                onContextMenu={(e) => {
                  // Existing rows go through ItuneAmountEditModal (its own
                  // history log + image requirement) — the inline
                  // right-click-paste shortcut would bypass that entirely,
                  // so it's only wired up for brand-new, not-yet-saved rows.
                  if (isTempId(row.id)) handleCellRightClickPaste(e, row.id, "amount");
                }}
              >
                {isTempId(row.id) ? (
                  editing?.id === row.id && editing?.field === "amount" ? (
                    <input
                      autoFocus
                      type="number"
                      step="0.01"
                      min="0"
                      value={row.amount}
                      onChange={(e) => updateField(row.id, "amount", e.target.value)}
                      onBlur={() => setEditing(null)}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        e.preventDefault();
                        focusNextField(row.id, "amount");
                      }}
                      className="w-full min-w-0 rounded-md border border-ll-primary bg-ll-surface-1 px-2 py-1 text-sm text-ll-ink outline-none"
                    />
                  ) : (
                    <EditableCell
                      editing={false}
                      display={Number(row.amount).toFixed(2)}
                      onStartEdit={() => setEditing({ id: row.id, field: "amount" })}
                      copyText={settings.copyButtonsEnabled ? Number(row.amount).toFixed(2) : ""}
                    />
                  )
                ) : (
                  <EditableCell
                    editing={false}
                    display={Number(row.amount).toFixed(2)}
                    onStartEdit={() => {
                      setAmountEditError("");
                      setAmountEditFor(row.id);
                    }}
                    copyText={settings.copyButtonsEnabled ? Number(row.amount).toFixed(2) : ""}
                  />
                )}
                {amountEditFor === row.id && (
                  <ItuneAmountEditModal
                    row={row}
                    saving={savingAmount}
                    error={amountEditError}
                    onSave={(amount, image) => saveAmount(row, amount, image)}
                    onClose={() => {
                      if (savingAmount) return;
                      setAmountEditFor(null);
                      setAmountEditError("");
                    }}
                  />
                )}
              </div>
              <div className="flex min-w-0 flex-col items-center px-3 py-2">
                {(() => {
                  const thumb = (
                    <div
                      onContextMenu={(e) => handleThumbRightClick(e, row)}
                      className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-md border border-ll-hairline-strong bg-ll-surface-2 text-ll-ink-tertiary hover:bg-ll-surface-3"
                      title={
                        isTempId(row.id)
                          ? "บันทึกแถวก่อนถึงจะใส่รูปได้"
                          : "คลิกเพื่อใส่รูป, คลิกขวาเพื่อวางจากคลิปบอร์ด"
                      }
                    >
                      {row.amountConfirmImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={row.amountConfirmImage} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <ImageIcon size={16} />
                      )}
                    </div>
                  );
                  // ItuneImagePreview bails out to a plain, un-clickable
                  // `children` when `src` is empty (see itune-image-preview.js)
                  // — so an empty cell needs its own plain trigger button,
                  // same split gameinfo's RowThumb uses (see
                  // gameinfo-gamelist-table.js:1196-1209).
                  return row.amountConfirmImage ? (
                    <ItuneImagePreview
                      src={row.amountConfirmImage}
                      onClick={() => setImagePickerFor(row.id)}
                    >
                      {thumb}
                    </ItuneImagePreview>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setImagePickerFor(row.id)}
                      className="shrink-0"
                    >
                      {thumb}
                    </button>
                  );
                })()}
                {imageError[row.id] && (
                  <p className="mt-1 truncate text-[10px] text-ll-primary">{imageError[row.id]}</p>
                )}
                {imagePickerFor === row.id && (
                  <ItuneImagePickerModal
                    value={row.amountConfirmImage}
                    onChange={(dataUrl) => saveImage(row, dataUrl)}
                    onClose={() => setImagePickerFor(null)}
                  />
                )}
              </div>
              <div className="min-w-0 px-3 py-2">{comboCell(row, "linkSms", "Link_SMS")}</div>
              <div className="min-w-0 px-3 py-2">{comboCell(row, "qna", "QNA")}</div>
              <div className="sticky right-0 z-10 flex min-w-0 items-center justify-end bg-ll-surface-1 py-2 pr-1 group-hover/row:bg-ll-surface-2/50">
                <RowActionsMenu
                  row={row}
                  onDelete={deleteRow}
                  onCopyRow={copyRow}
                  onReportIssue={
                    isTempId(row.id) || row.status === ITUNE_UNAVAILABLE_STATUS
                      ? undefined
                      : (r) => {
                          setReportError("");
                          setReportFor(r.id);
                        }
                  }
                  onResolveIssue={
                    !isTempId(row.id) && row.status === ITUNE_UNAVAILABLE_STATUS
                      ? resolveIssue
                      : undefined
                  }
                  amountHistoryHref={isTempId(row.id)
                    ? undefined
                    : `${pathname}/history?category=amount&q=${encodeURIComponent(row.email || String(row.id))}`}
                  onTogglePermanent={isTempId(row.id) ? undefined : togglePermanent}
                />
              </div>
            </div>
          ))}
          {filteredRows.length === 0 && (
            <div className="px-3 py-8 text-center text-sm text-ll-ink-tertiary">
              {rows.length === 0 ? "ยังไม่มีรายการ" : "ไม่พบรายการที่ตรงกับการค้นหา"}
            </div>
          )}
        </div>
      </div>

      {/* Same one-continuous-pill shape as gameinfo's "เพิ่มเกม" bar (see
          gameinfo-gamelist-table.js): ยกเลิก/บันทึก are plain-text buttons
          living inside the pill and collapse to width 0 when nothing is
          dirty; "เพิ่มรายการ" is a solid capsule that stays put as the pill's
          permanent center anchor. The outer pill sizes off its own padding
          (p-1) rather than a fixed height, so the frame around the capsule
          stays even on all four sides — with no edits yet, that's the only
          thing visible. Both side slots share the exact same fixed
          width+height (SIDE_SLOT_WIDTH, h-10 matching the capsule) so the
          pill — and the capsule sitting in its middle — never drifts
          off-center regardless of which side is currently collapsed; each
          button itself is h-full w-full inside its slot so the whole slot's
          background is clickable, not just the text glyphs. Error/saved
          messages stack above the pill in the same wrapper, same layout as
          gameinfo's floating bar. */}
      <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 flex-col items-center gap-2 px-4">
        {duplicateLinkSmsRowIds.size > 0 && (
          <span className="flex items-center gap-1 whitespace-nowrap rounded-full border border-ll-primary/20 bg-ll-primary-subtle-bg px-3 py-1 text-xs font-medium text-ll-primary-subtle-text shadow-[var(--ll-shadow-card)]">
            <AlertTriangle size={13} /> Link_SMS ซ้ำกัน {duplicateLinkSmsRowIds.size} แถว — แก้ก่อนถึงจะบันทึกได้
          </span>
        )}
        {saveError && (
          <span className="whitespace-nowrap rounded-full border border-ll-primary/20 bg-ll-primary-subtle-bg px-3 py-1 text-xs text-ll-primary-subtle-text shadow-[var(--ll-shadow-card)]">
            {saveError}
          </span>
        )}
        {savedAt && !saving && (
          <div
            className={`overflow-hidden transition-all duration-300 ease-out ${
              savedVisible ? "max-h-8 opacity-100" : "max-h-0 opacity-0"
            }`}
          >
            <span className="text-xs text-ll-ink-subtle">บันทึกแล้ว</span>
          </div>
        )}
        <div className="flex items-center rounded-full border border-ll-hairline bg-ll-surface-1 p-1 shadow-[var(--ll-shadow-modal)]">
          <div
            className={`flex h-10 flex-none min-w-0 items-center justify-center overflow-hidden transition-all duration-200 ${
              dirty ? `${SIDE_SLOT_WIDTH} opacity-100` : "w-0 opacity-0"
            }`}
          >
            <button
              type="button"
              onClick={cancelAll}
              disabled={saving}
              className="flex h-full w-full items-center justify-center whitespace-nowrap px-3 text-[13px] font-medium text-ll-ink-subtle hover:text-ll-ink disabled:opacity-50"
            >
              ยกเลิก
            </button>
          </div>

          <button
            type="button"
            onClick={addRow}
            className="flex h-10 items-center gap-2 whitespace-nowrap rounded-full bg-ll-primary px-4 text-sm font-medium text-ll-on-primary shadow-md hover:bg-ll-primary-hover"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full border border-white/40">
              <Plus size={14} />
            </span>
            เพิ่มรายการ
          </button>

          <div
            className={`flex h-10 flex-none min-w-0 items-center justify-center overflow-hidden transition-all duration-200 ${
              dirty ? `${SIDE_SLOT_WIDTH} opacity-100` : "w-0 opacity-0"
            }`}
          >
            <button
              type="button"
              onClick={saveAll}
              disabled={saving || duplicateLinkSmsRowIds.size > 0}
              title={duplicateLinkSmsRowIds.size > 0 ? "แก้ Link_SMS ที่ซ้ำก่อนถึงจะบันทึกได้" : undefined}
              className="flex h-full w-full items-center justify-center whitespace-nowrap px-3 text-[13px] font-medium text-ll-primary hover:text-ll-primary-hover disabled:opacity-50"
            >
              {saving ? "กำลังบันทึก..." : "บันทึก"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
