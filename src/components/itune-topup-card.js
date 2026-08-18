"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Image as ImageIcon, Loader2, X } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import {
  computeEffectiveItuneStatus,
  DEFAULT_ITUNE_RELEASE_THRESHOLD,
  ITUNE_DEPLETED_STATUS,
} from "@/lib/itune-status";
import ItuneCountdownCell from "@/components/itune-countdown-cell";
import ItuneImagePickerModal from "@/components/itune-image-picker-modal";
import ItuneImagePreview from "@/components/itune-image-preview";

// Same tone→class mapping as itune-admin-table.js's StatusBadge — kept as a
// small local copy (see itune-issue-history.js for the same convention)
// rather than a shared import.
const STATUS_TONE_CLASS = {
  subtle: "bg-ll-surface-2 text-ll-ink-subtle",
  warning: "bg-ll-warning-bg text-ll-warning",
  success: "bg-ll-success-bg text-ll-success",
  danger: "bg-ll-primary-subtle-bg text-ll-primary-subtle-text",
};

function formatDateTime(value) {
  if (!value) return "-";
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return "-";
  return new Date(ms).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
}

function DetailField({ label, children }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-wide text-ll-ink-tertiary">{label}</p>
      <div className="mt-0.5 text-sm text-ll-ink">{children}</div>
    </div>
  );
}

// Own popup for the "Reject" request (see rejectItuneEntry in
// itune-entries-repository.js) — same shape as ItuneReportIssueModal in
// itune-admin-table.js, but this app's convention is a local copy per call
// site rather than a shared component (see STATUS_TONE_CLASS's comment
// above for the same reasoning). Requires a reason so admin has something
// to go on when deciding whether to confirm or decline the request.
function ItuneRejectRequestModal({ onConfirm, onClose, submitting, error }) {
  const [reason, setReason] = useState("");

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
          <h2 className="text-sm font-semibold text-ll-ink">ขอ Reject</h2>
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
            เหตุผลที่ขอ Reject
            <textarea
              autoFocus
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="อธิบายว่าทำไมถึงขอ Reject เมลนี้..."
              className="mt-1.5 w-full resize-none rounded-md border border-ll-hairline-strong bg-ll-surface-2 px-3 py-2 text-sm text-ll-ink outline-none focus:border-ll-primary"
            />
          </label>
          <p className="mt-1.5 text-[11px] text-ll-ink-subtle">
            เมลนี้จะยังอยู่กับคุณจนกว่าแอดมินจะยืนยัน — เมื่อยืนยันแล้วคุณจะไม่ได้รับเมลนี้อีก
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
              onClick={() => onConfirm(reason.trim())}
              disabled={submitting || !reason.trim()}
              className="rounded-md bg-ll-primary px-3 py-1.5 text-[13px] font-medium text-ll-on-primary hover:bg-ll-primary-hover disabled:opacity-50"
            >
              {submitting ? "กำลังส่งคำขอ..." : "ส่งคำขอ"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// One claimed itune entry, rendered as a collapsible card — collapsed shows
// just email/password/countdown (the 3 things someone glancing at their held
// cards needs), expanded adds everything else as label/value fields (not
// table rows, unlike the admin table) plus the "อัปเดตยอดคงเหลือ" balance-
// update form, its adjustment history, and the "คืนเมล" release action.
export default function ItuneTopupCard({ entry, now, releaseThreshold, onReleased, onUpdated }) {
  const [expanded, setExpanded] = useState(false);
  const [amountLog, setAmountLog] = useState(null);
  const [loadingLog, setLoadingLog] = useState(false);
  const [amountInput, setAmountInput] = useState(String(entry.amount));
  // Deliberately its own state, separate from entry.amountConfirmImage (the
  // read-only "current" image shown below) — always starts blank and resets
  // to blank after every save, so each บันทึกยอด only ever carries the image
  // attached for THAT specific round, not whatever was left over visually
  // from last time.
  const [adjustmentImage, setAdjustmentImage] = useState("");
  const [adjustmentPickerOpen, setAdjustmentPickerOpen] = useState(false);
  const [savingAmount, setSavingAmount] = useState(false);
  const [amountError, setAmountError] = useState("");
  const [releasing, setReleasing] = useState(false);
  const [releaseError, setReleaseError] = useState("");
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectError, setRejectError] = useState("");

  const { label: statusLabel, tone: statusTone } = computeEffectiveItuneStatus(entry);
  // Server also enforces both of these (see releaseItuneEntry) — checked
  // here too just to save a doomed round trip and tell the user why up
  // front, instead of them finding out only after clicking "คืนเมล".
  const threshold = releaseThreshold ?? DEFAULT_ITUNE_RELEASE_THRESHOLD;
  const belowReleaseThreshold = Number(entry.amount) < threshold;
  const hasConfirmImage = Boolean(entry.amountConfirmImage);
  const canRelease = belowReleaseThreshold && hasConfirmImage;

  function toggleExpanded() {
    const next = !expanded;
    setExpanded(next);
    if (next && amountLog === null) {
      setLoadingLog(true);
      apiJson(`/api/projectm/itune/${entry.id}/amount-log`, {
        fallbackError: "โหลดประวัติยอดไม่สำเร็จ",
      })
        .then((data) => setAmountLog(data.logs || []))
        .catch(() => setAmountLog([]))
        .finally(() => setLoadingLog(false));
    }
  }

  async function saveAmount() {
    const amount = Number(amountInput);
    if (!Number.isFinite(amount) || amount < 0) {
      setAmountError("Amount ต้องเป็นตัวเลขไม่ติดลบ");
      return;
    }
    // Server enforces this too (see updateItuneEntryAmount) — checked here
    // first so it fails fast without a round trip.
    if (amount !== Number(entry.amount) && !adjustmentImage) {
      setAmountError("ยอดมีการเปลี่ยนแปลง กรุณาแนบรูปยืนยันยอดใหม่");
      return;
    }
    setSavingAmount(true);
    setAmountError("");
    try {
      // image only included when something new was actually attached this
      // round — undefined here means the key is dropped entirely by
      // JSON.stringify, and updateItuneEntryAmount leaves the live confirm
      // image untouched when the field is absent (see that function).
      const data = await apiJson(`/api/projectm/itune/${entry.id}/amount`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, image: adjustmentImage || undefined }),
        fallbackError: "บันทึกยอดคงเหลือไม่สำเร็จ",
      });
      onUpdated(data.entry);
      setAmountInput(String(data.entry.amount));
      setAmountLog((prev) => [
        {
          id: `local-${Date.now()}`,
          oldAmount: entry.amount,
          newAmount: data.entry.amount,
          image: adjustmentImage,
          changedByUsername: "",
          changedAt: new Date().toISOString(),
        },
        ...(prev || []),
      ]);
      setAdjustmentImage("");
    } catch (err) {
      setAmountError(err.message);
    } finally {
      setSavingAmount(false);
    }
  }

  async function release() {
    if (!window.confirm(`คืนเมล ${entry.email || `ID ${entry.id}`} กลับเข้าพูล?`)) return;
    setReleasing(true);
    setReleaseError("");
    try {
      await apiJson(`/api/projectm/itune/${entry.id}/claim`, {
        method: "DELETE",
        fallbackError: "คืนเมลไม่สำเร็จ",
      });
      onReleased();
    } catch (err) {
      setReleaseError(err.message);
      setReleasing(false);
    }
  }

  // "Reject" — no Amount/image requirement (unlike "คืนเมล"), but doesn't
  // release the entry itself: it just files a request (see rejectItuneEntry,
  // ItuneRejectRequestModal above) that sits pending until an admin confirms
  // or declines it. The entry stays claimed by this user the whole time
  // it's pending (still counts against the 2-claim cap), so this only
  // updates the card in place — no onReleased() here, unlike release().
  async function reject(reason) {
    setRejecting(true);
    setRejectError("");
    try {
      const data = await apiJson(`/api/projectm/itune/${entry.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
        fallbackError: "ส่งคำขอ Reject ไม่สำเร็จ",
      });
      onUpdated(data.entry);
      setRejectModalOpen(false);
    } catch (err) {
      setRejectError(err.message);
    } finally {
      setRejecting(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-ll-hairline bg-ll-surface-1 shadow-[var(--ll-shadow-card)]">
      <button
        type="button"
        onClick={toggleExpanded}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-ll-surface-2/50"
      >
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm font-medium text-ll-ink">{entry.email || "-"}</span>
          <span className="truncate text-xs text-ll-ink-subtle">{entry.password || "-"}</span>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-xs">
          <ItuneCountdownCell
            addedAt={entry.addedAt}
            now={now}
            frozen={statusLabel === ITUNE_DEPLETED_STATUS}
            permanent={entry.isPermanent}
          />
          <ChevronDown
            size={16}
            className={`text-ll-ink-tertiary transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </div>
      </button>

      {expanded && (
        <div className="flex flex-col gap-5 border-t border-ll-hairline p-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <DetailField label="สถานะ">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE_CLASS[statusTone]}`}
              >
                {statusLabel}
              </span>
              {statusTone === "danger" && entry.otherNotes && (
                <p className="mt-1 text-[11px] text-ll-ink-subtle">{entry.otherNotes}</p>
              )}
            </DetailField>
            <DetailField label="สกุลเงิน">{entry.currency || "-"}</DetailField>
            <DetailField label="Supplier">{entry.supplier || "-"}</DetailField>
            <DetailField label="Amount ปัจจุบัน">{Number(entry.amount).toFixed(2)}</DetailField>
            <DetailField label="Link_SMS">
              <span className="break-all">{entry.linkSms || "-"}</span>
            </DetailField>
            <DetailField label="QNA">
              <span className="break-all">{entry.qna || "-"}</span>
            </DetailField>
            <DetailField label="เพิ่มโดย">{entry.createdByUsername || "-"}</DetailField>
            <DetailField label="รับเมื่อ">{formatDateTime(entry.claimedAt)}</DetailField>
          </div>

          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-ll-ink-tertiary">
              รูปยืนยันปัจจุบัน
            </p>
            <div className="mt-1">
              {entry.amountConfirmImage ? (
                <ItuneImagePreview src={entry.amountConfirmImage}>
                  <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-md border border-ll-hairline-strong bg-ll-surface-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={entry.amountConfirmImage}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </div>
                </ItuneImagePreview>
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-md border border-dashed border-ll-hairline-strong text-ll-ink-tertiary">
                  <ImageIcon size={18} />
                </div>
              )}
            </div>
          </div>

          <div className="rounded-md border border-ll-hairline-strong bg-ll-surface-2 p-3">
            <p className="text-[12px] font-semibold text-ll-ink">อัปเดตยอดคงเหลือ</p>
            <p className="mt-0.5 text-[11px] text-ll-ink-subtle">
              ใช้ไปเท่าไหร่แล้วก็กรอกยอดที่เหลือล่าสุด แนบรูปยืนยันถ้ามี แล้วกดบันทึก — ระบบจะเก็บ log
              การปรับยอดแต่ละครั้งไว้ด้านล่าง พร้อมรูปของรอบนั้นๆ
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                type="number"
                step="0.01"
                min="0"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                className="h-9 w-32 rounded-md border border-ll-hairline-strong bg-ll-surface-1 px-2 text-sm text-ll-ink outline-none focus:border-ll-primary"
              />
              {/* Always-empty picker for this round's confirm image — never
                  pre-filled from the "current" box above (see adjustmentImage's
                  own comment). */}
              {adjustmentImage ? (
                <ItuneImagePreview src={adjustmentImage} onClick={() => setAdjustmentPickerOpen(true)}>
                  <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-md border border-ll-hairline-strong bg-ll-surface-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={adjustmentImage} alt="" className="h-full w-full object-cover" />
                  </div>
                </ItuneImagePreview>
              ) : (
                <button
                  type="button"
                  onClick={() => setAdjustmentPickerOpen(true)}
                  title="แนบรูปยืนยันสำหรับยอดรอบนี้"
                  className="flex h-9 w-9 items-center justify-center rounded-md border border-dashed border-ll-hairline-strong text-ll-ink-tertiary hover:bg-ll-surface-1"
                >
                  <ImageIcon size={16} />
                </button>
              )}
              <button
                type="button"
                onClick={saveAmount}
                disabled={savingAmount}
                className="flex h-9 items-center gap-1.5 rounded-md bg-ll-primary px-3 text-xs font-medium text-ll-on-primary hover:bg-ll-primary-hover disabled:opacity-50"
              >
                {savingAmount && <Loader2 size={13} className="animate-spin" />}
                บันทึกยอด
              </button>
            </div>
            {adjustmentPickerOpen && (
              <ItuneImagePickerModal
                value={adjustmentImage}
                onChange={setAdjustmentImage}
                onClose={() => setAdjustmentPickerOpen(false)}
              />
            )}
            {amountError && <p className="mt-1.5 text-[11px] text-ll-primary">{amountError}</p>}

            <div className="mt-3 border-t border-ll-hairline pt-2">
              <p className="text-[11px] font-medium text-ll-ink-subtle">
                ประวัติยอด (ตั้งแต่รับเมล)
              </p>
              {loadingLog && (
                <p className="mt-1 text-[11px] text-ll-ink-tertiary">กำลังโหลด...</p>
              )}
              {!loadingLog && amountLog && amountLog.length === 0 && (
                <p className="mt-1 text-[11px] text-ll-ink-tertiary">ยังไม่มีประวัติ</p>
              )}
              {!loadingLog && amountLog && amountLog.length > 0 && (
                <ul className="mt-1 flex flex-col gap-1.5">
                  {amountLog.map((log) => (
                    <li key={log.id} className="flex items-center gap-2 text-[11px] text-ll-ink-subtle">
                      {log.image ? (
                        <ItuneImagePreview src={log.image}>
                          <div className="h-6 w-6 shrink-0 overflow-hidden rounded border border-ll-hairline-strong">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={log.image} alt="" className="h-full w-full object-cover" />
                          </div>
                        </ItuneImagePreview>
                      ) : (
                        <span className="h-6 w-6 shrink-0 rounded border border-dashed border-ll-hairline-strong" />
                      )}
                      <span>
                        {Number(log.oldAmount) === Number(log.newAmount)
                          ? `ยอดเริ่มต้น: ${Number(log.newAmount).toFixed(2)}`
                          : `${Number(log.oldAmount).toFixed(2)} → ${Number(log.newAmount).toFixed(2)}`}
                        {log.changedByUsername ? ` · ${log.changedByUsername}` : ""} ·{" "}
                        {formatDateTime(log.changedAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-start gap-2">
            <div>
              <button
                type="button"
                onClick={release}
                disabled={releasing || rejecting || !canRelease}
                className="rounded-md border border-ll-hairline-strong px-3 py-2 text-xs font-medium text-ll-ink-subtle hover:bg-ll-surface-2 disabled:opacity-50"
              >
                {releasing ? "กำลังคืน..." : "คืนเมล"}
              </button>
              {!canRelease && (
                <p className="mt-1.5 text-[11px] text-ll-ink-tertiary">
                  {!belowReleaseThreshold &&
                    `ยอดคงเหลือต้องต่ำกว่า ${threshold} ก่อนถึงจะคืนเมลได้ (ตอนนี้เหลือ ${Number(
                      entry.amount
                    ).toFixed(2)})`}
                  {!belowReleaseThreshold && !hasConfirmImage && " และ"}
                  {!hasConfirmImage && "ต้องแนบรูปยืนยันยอดก่อนถึงจะคืนเมลได้"}
                </p>
              )}
              {releaseError && <p className="mt-1.5 text-[11px] text-ll-primary">{releaseError}</p>}
            </div>

            <div>
              <button
                type="button"
                onClick={() => setRejectModalOpen(true)}
                disabled={releasing || rejecting || entry.hasPendingReject}
                title="ส่งคำขอ Reject โดยไม่ต้องรอยอด/รูป — เมลยังอยู่กับคุณจนกว่าแอดมินจะยืนยัน แล้วคุณจะไม่ได้รับเมลนี้อีก"
                className="rounded-md border border-ll-hairline-strong px-3 py-2 text-xs font-medium text-ll-primary-subtle-text hover:bg-ll-primary-subtle-bg disabled:opacity-50"
              >
                {rejecting
                  ? "กำลังส่งคำขอ..."
                  : entry.hasPendingReject
                    ? "รอแอดมินยืนยัน Reject"
                    : "Reject"}
              </button>
              {rejectError && <p className="mt-1.5 text-[11px] text-ll-primary">{rejectError}</p>}
              {rejectModalOpen && (
                <ItuneRejectRequestModal
                  submitting={rejecting}
                  error={rejectError}
                  onConfirm={reject}
                  onClose={() => {
                    if (rejecting) return;
                    setRejectModalOpen(false);
                    setRejectError("");
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
