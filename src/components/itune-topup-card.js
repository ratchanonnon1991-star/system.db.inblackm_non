"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Image as ImageIcon, Loader2, X } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { computeItuneQueueMetrics } from "@/lib/itune-queue";
import {
  computeEffectiveItuneStatus,
  DEFAULT_ITUNE_RELEASE_THRESHOLD,
  ITUNE_DEPLETED_STATUS,
} from "@/lib/itune-status";
import ItuneCountdownCell from "@/components/itune-countdown-cell";
import ItuneImagePickerModal from "@/components/itune-image-picker-modal";
import ItuneImagePreview from "@/components/itune-image-preview";
import ItuneAmountLogImage from "@/components/itune-amount-log-image";
import ItunePasswordValue from "@/components/itune-password-value";
import ItuneOrderHistory from "@/components/itune-order-history";
import { ItuneBalancePhotos, ItuneSheetOrderList } from "@/components/itune-entry-sheet-panel";
import { isOrderAmountLog } from "@/lib/itune-sheet-orders";

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

// Final balance and proof are submitted together so the entry update,
// session close and queue transition can be one transaction.
function ItuneFinishClaimModal({ entry, threshold, onConfirm, onClose, submitting, error }) {
  const [outcome, setOutcome] = useState(
    Number(entry.amount) < threshold ? "depleted" : "partial_release"
  );
  const [amountInput, setAmountInput] = useState(String(entry.amount));
  const [image, setImage] = useState("");
  const [note, setNote] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape" && !pickerOpen) onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, pickerOpen]);

  const amount = Number(amountInput);
  const amountValid = amountInput.trim() !== "" && Number.isFinite(amount) && amount >= 0;
  const stillUsable = amountValid && amount >= threshold;
  const outcomeMismatch =
    (outcome === "depleted" && stillUsable) ||
    (outcome === "partial_release" && amountValid && !stillUsable);
  const valid =
    amountValid &&
    Boolean(image) &&
    !outcomeMismatch &&
    (outcome !== "unusable" || Boolean(note.trim()));

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-lg border border-ll-hairline bg-ll-surface-1 shadow-[var(--ll-shadow-modal)]">
        <div className="flex items-center justify-between border-b border-ll-hairline px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-ll-ink">บันทึกผลและคืนเมล</h2>
            <p className="mt-0.5 truncate text-[11px] text-ll-ink-subtle">{entry.email}</p>
          </div>
          <button type="button" onClick={onClose} disabled={submitting} aria-label="ปิด" className="flex h-10 w-10 items-center justify-center rounded text-ll-ink-tertiary hover:bg-ll-surface-2">
            <X size={14} />
          </button>
        </div>

        <div className="space-y-4 p-4">
          <fieldset>
            <legend className="text-[12px] font-medium text-ll-ink">ผลการใช้งาน</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {[
                ["depleted", "ใช้หมดแล้ว"],
                ["partial_release", "คืนเข้าคิว"],
                ["unusable", "เมลใช้ไม่ได้"],
              ].map(([value, label]) => (
                <label key={value} className={`cursor-pointer rounded-md border px-3 py-2 text-[12px] ${outcome === value ? "border-ll-primary bg-ll-primary-subtle-bg text-ll-primary-subtle-text" : "border-ll-hairline-strong text-ll-ink-subtle"}`}>
                  <input type="radio" name="claim-outcome" value={value} checked={outcome === value} onChange={() => setOutcome(value)} className="sr-only" />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="block text-[12px] font-medium text-ll-ink">
            ยอดคงเหลือล่าสุด
            <input type="number" min="0" step="0.01" value={amountInput} onChange={(e) => setAmountInput(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-ll-hairline-strong bg-ll-surface-2 px-3 text-sm text-ll-ink outline-none focus:border-ll-primary" />
          </label>

          {outcome === "depleted" && stillUsable && (
            <p className="rounded-md border border-ll-warning/35 bg-ll-warning-bg px-3 py-2 text-[12px] text-ll-warning">
              ยอดยังไม่ต่ำกว่า {threshold.toFixed(2)} จึงถือว่ายังใช้ต่อได้ กรุณาเลือก “คืนเข้าคิว”
            </p>
          )}
          {outcome === "partial_release" && amountValid && !stillUsable && (
            <p className="rounded-md border border-ll-warning/35 bg-ll-warning-bg px-3 py-2 text-[12px] text-ll-warning">
              ยอดต่ำกว่า {threshold.toFixed(2)} แล้ว กรุณาเลือก “ใช้หมดแล้ว”
            </p>
          )}

          <div>
            <p className="text-[12px] font-medium text-ll-ink">รูปหลักฐานยอดล่าสุด</p>
            <button type="button" onClick={() => setPickerOpen(true)} className="mt-1 flex h-20 w-20 items-center justify-center overflow-hidden rounded-md border border-dashed border-ll-hairline-strong bg-ll-surface-2 text-ll-ink-tertiary">
              {image ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={image} alt="หลักฐานยอดล่าสุด" className="h-full w-full object-cover" />
                </>
              ) : <ImageIcon size={18} />}
            </button>
          </div>

          {outcome === "unusable" && (
            <label className="block text-[12px] font-medium text-ll-ink">
              ปัญหาที่พบ
              <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 w-full resize-none rounded-md border border-ll-hairline-strong bg-ll-surface-2 px-3 py-2 text-sm text-ll-ink outline-none focus:border-ll-primary" />
            </label>
          )}

          {error && <p className="text-[12px] text-ll-primary-subtle-text">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} disabled={submitting} className="rounded-md px-3 py-2 text-[12px] text-ll-ink-subtle hover:bg-ll-surface-2">ยกเลิก</button>
            <button type="button" disabled={submitting || !valid} onClick={() => onConfirm({ outcome, amount, image, note: note.trim() })} className="rounded-md bg-ll-primary px-3 py-2 text-[12px] font-medium text-ll-on-primary disabled:opacity-40">
              {submitting ? "กำลังบันทึก..." : "ยืนยันและคืนเมล"}
            </button>
          </div>
        </div>
        {pickerOpen && <ItuneImagePickerModal value={image} onChange={setImage} onClose={() => setPickerOpen(false)} />}
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
export default function ItuneTopupCard({ entry, now, releaseThreshold, onReleased, onUpdated, usagePriority, queueSettings }) {
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
  const [finishModalOpen, setFinishModalOpen] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState("");

  const threshold = releaseThreshold ?? DEFAULT_ITUNE_RELEASE_THRESHOLD;
  const { label: statusLabel, tone: statusTone } = computeEffectiveItuneStatus(entry, threshold);
  const usageMetrics = computeItuneQueueMetrics(entry, queueSettings, now);

  function toggleExpanded() {
    const next = !expanded;
    setExpanded(next);
    if (next && amountLog === null) {
      setLoadingLog(true);
      apiJson(`/api/projectm/itune/${entry.id}/amount-log`, {
        fallbackError: "โหลดประวัติยอดไม่สำเร็จ",
      })
        .then((data) => setAmountLog((data.logs || []).filter((log) => !isOrderAmountLog(log))))
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
          hasImage: Boolean(adjustmentImage),
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

  async function finishClaim(details) {
    setFinishing(true);
    setFinishError("");
    try {
      await apiJson(`/api/projectm/itune/${entry.id}/claim`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(details),
        fallbackError: "บันทึกผลและคืนเมลไม่สำเร็จ",
      });
      setFinishModalOpen(false);
      onReleased();
    } catch (err) {
      setFinishError(err.message);
    } finally {
      setFinishing(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-ll-hairline bg-ll-surface-1 shadow-[var(--ll-shadow-card)]">
      <div
        onClick={toggleExpanded}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-ll-surface-2/50"
      >
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 truncate text-sm font-medium text-ll-ink">{entry.email || "-"}</span>
            <span className="shrink-0 rounded-md bg-ll-surface-2 px-2 py-0.5 text-[12px] font-medium text-ll-ink-subtle">
              {entry.currency?.trim() || "ยังไม่ระบุสกุลเงิน"}
            </span>
            {usagePriority && (
              <span className={`rounded-md px-2 py-0.5 text-[12px] font-medium ${usagePriority === 1 ? "bg-ll-warning-bg text-ll-warning" : "bg-ll-surface-2 text-ll-ink-subtle"}`}>
                {usagePriority === 1 ? "ควรใช้ก่อนในเมลที่ถืออยู่" : `ลำดับใช้งาน ${usagePriority}`}
              </span>
            )}
          </div>
          <p className="text-xs text-ll-ink-subtle">
            ยอด {Number(entry.amount || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 })} {entry.currency || ""}
            {entry.addedAt && Number.isFinite(new Date(entry.addedAt).getTime())
              ? ` · สร้างมาแล้ว ${usageMetrics.knownAgeHours.toLocaleString("th-TH", { maximumFractionDigits: 1 })} ชม.`
              : " · ยังไม่ระบุเวลาที่สร้าง"}
          </p>
          <ItunePasswordValue value={entry.password} className="text-xs text-ll-ink-subtle" />
        </div>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            toggleExpanded();
          }}
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse details" : "Expand details"}
          className="flex shrink-0 items-center gap-3 rounded text-xs"
        >
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
        </button>
      </div>

      {expanded && (
        <div className="flex flex-col gap-5 border-t border-ll-hairline p-4">
          <ItuneOrderHistory entryId={entry.id} />
          <ItuneSheetOrderList entryId={entry.id} currency={entry.currency} />
          <ItuneBalancePhotos entryId={entry.id} />
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
                  <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-md border border-ll-hairline-strong bg-ll-surface-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={adjustmentImage} alt="" className="h-full w-full object-cover" />
                  </div>
                </ItuneImagePreview>
              ) : (
                <button
                  type="button"
                  onClick={() => setAdjustmentPickerOpen(true)}
                  title="แนบรูปยืนยันสำหรับยอดรอบนี้"
                  className="flex h-10 w-10 items-center justify-center rounded-md border border-dashed border-ll-hairline-strong text-ll-ink-tertiary hover:bg-ll-surface-1"
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
                      <ItuneAmountLogImage
                        logId={log.id}
                        hasImage={log.hasImage}
                        src={log.image}
                        sizeClassName="h-6 w-6"
                      />
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

          <div>
            <button
              type="button"
              onClick={() => {
                setFinishError("");
                setFinishModalOpen(true);
              }}
              disabled={finishing}
              className="rounded-md bg-ll-primary px-3 py-2 text-xs font-medium text-ll-on-primary hover:bg-ll-primary-hover disabled:opacity-50"
            >
              บันทึกผลและคืนเมล
            </button>
            <p className="mt-1.5 text-[11px] text-ll-ink-tertiary">
              ต้องกรอกยอดล่าสุดและแนบรูปทุกครั้ง · ยอดตั้งแต่ {threshold.toFixed(2)} ขึ้นไปจะกลับเข้าคิว
            </p>
            {finishError && <p className="mt-1.5 text-[11px] text-ll-primary">{finishError}</p>}
            {finishModalOpen && (
              <ItuneFinishClaimModal
                entry={entry}
                threshold={threshold}
                submitting={finishing}
                error={finishError}
                onConfirm={finishClaim}
                onClose={() => {
                  if (finishing) return;
                  setFinishModalOpen(false);
                  setFinishError("");
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
