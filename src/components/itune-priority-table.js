"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Loader2, Pause, Pin, PinOff, Play } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { computeEffectiveItuneStatus, ITUNE_DEPLETED_STATUS } from "@/lib/itune-status";
import { useMinuteTicker } from "@/lib/itune-ticker";
import ItuneCountdownCell from "@/components/itune-countdown-cell";
import ItuneImagePreview from "@/components/itune-image-preview";
import ItunePasswordValue from "@/components/itune-password-value";

// Same tone→class mapping as itune-admin-table.js's StatusBadge — a small
// local copy per call site is this app's convention (see that file and
// itune-issue-history.js) rather than a shared import.
const STATUS_TONE_CLASS = {
  subtle: "bg-ll-surface-2 text-ll-ink-subtle",
  warning: "bg-ll-warning-bg text-ll-warning",
  success: "bg-ll-success-bg text-ll-success",
  danger: "bg-ll-primary-subtle-bg text-ll-primary-subtle-text",
};

// Mirrors itune-admin-table.js's GRID_COLS minus the "รับไปโดย" and row-menu
// columns (nothing here is claimed, and the actions differ), plus a leading
// drag-handle/queue-number column.
const GRID_COLS =
  "grid-cols-[86px_50px_170px_minmax(170px,1fr)_minmax(160px,0.8fr)_110px_100px_90px_140px_110px_90px_minmax(120px,1fr)_minmax(150px,1fr)_96px]";
const GRID_MIN_WIDTH = 1720;

function StatusBadge({ row }) {
  const { label, tone } = computeEffectiveItuneStatus(row);
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE_CLASS[tone]}`}
    >
      {label}
    </span>
  );
}

// The 12 shared data cells, rendered identically in both zones so a row
// reads the same wherever it currently sits. `threshold` only colours the
// Amount — an entry at or above it is in the "ด่วน" tier and jumps the
// ordinary queue, so the number that earned it that place is worth
// spotting without reading the divider first.
function EntryCells({ entry, now, threshold }) {
  const isUrgent = Number(entry.amount) >= Number(threshold);
  return (
    <>
      <div className="min-w-0 truncate px-3 py-2 text-center font-mono text-xs text-ll-ink-subtle">
        {entry.id}
      </div>
      <div className="min-w-0 truncate px-3 py-2 text-[13px]">
        <ItuneCountdownCell
          addedAt={entry.addedAt}
          now={now}
          frozen={computeEffectiveItuneStatus(entry).label === ITUNE_DEPLETED_STATUS}
          permanent={entry.isPermanent}
        />
      </div>
      <div className="min-w-0 truncate px-3 py-2 text-[13px] text-ll-ink">{entry.email}</div>
      <div className="min-w-0 truncate px-3 py-2 text-[13px] text-ll-ink-subtle">
        <ItunePasswordValue value={entry.password} />
      </div>
      <div className="min-w-0 px-3 py-2">
        <StatusBadge row={entry} />
      </div>
      <div className="min-w-0 truncate px-3 py-2 text-[13px] text-ll-ink-subtle">
        {entry.createdByUsername || "—"}
      </div>
      <div className="min-w-0 truncate px-3 py-2 text-[13px] text-ll-ink-subtle">
        {entry.currency || "—"}
      </div>
      <div className="min-w-0 truncate px-3 py-2 text-[13px] text-ll-ink-subtle">
        {entry.supplier || "—"}
      </div>
      <div
        className={`min-w-0 truncate px-3 py-2 text-right text-[13px] ${
          isUrgent ? "font-semibold text-ll-primary" : "font-medium text-ll-ink"
        }`}
        title={isUrgent ? `ยอดถึงเกณฑ์ด่วน (≥ ${Number(threshold).toLocaleString("th-TH")})` : undefined}
      >
        {Number(entry.amount).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
      </div>
      <div className="min-w-0 px-3 py-2 text-center">
        {entry.amountConfirmImage ? (
          <ItuneImagePreview src={entry.amountConfirmImage}>
            <div className="mx-auto flex h-10 w-10 items-center justify-center overflow-hidden rounded-md border border-ll-hairline-strong bg-ll-surface-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={entry.amountConfirmImage} alt="" className="h-full w-full object-cover" />
            </div>
          </ItuneImagePreview>
        ) : (
          <span className="text-[12px] text-ll-ink-tertiary">—</span>
        )}
      </div>
      <div className="min-w-0 truncate px-3 py-2 text-[13px] text-ll-ink-subtle">
        {entry.linkSms || "—"}
      </div>
      <div className="min-w-0 truncate px-3 py-2 text-[13px] text-ll-ink-subtle">
        {entry.qna || "—"}
      </div>
    </>
  );
}

// Per-row hold/pin buttons — shared by both zones, so the only thing that
// differs between a pinned and an automatic row is the leading cell.
function RowActions({ entry, busy, onTogglePin, onToggleHold }) {
  return (
    <div className="flex items-center justify-end gap-1 px-2 py-2">
      <button
        type="button"
        onClick={() => onToggleHold(entry)}
        disabled={busy}
        title={entry.claimHold ? "เปิดให้รับเมลนี้" : "หยุดไม่ให้รับเมลนี้"}
        aria-label={entry.claimHold ? "เปิดให้รับเมลนี้" : "หยุดไม่ให้รับเมลนี้"}
        className={`flex h-7 w-7 items-center justify-center rounded-md border transition disabled:opacity-40 ${
          entry.claimHold
            ? "border-ll-success/40 bg-ll-success-bg text-ll-success hover:bg-ll-success-bg/70"
            : "border-ll-hairline-strong text-ll-ink-subtle hover:bg-ll-surface-2"
        }`}
      >
        {entry.claimHold ? <Play size={13} /> : <Pause size={13} />}
      </button>
      <button
        type="button"
        onClick={() => onTogglePin(entry)}
        disabled={busy}
        title={entry.priorityOrder !== null ? "ถอนหมุด — กลับไปคิวอัตโนมัติ" : "ปักหมุดขึ้นบน"}
        aria-label={entry.priorityOrder !== null ? "ถอนหมุด" : "ปักหมุดขึ้นบน"}
        className="flex h-7 w-7 items-center justify-center rounded-md border border-ll-hairline-strong text-ll-ink-subtle transition hover:bg-ll-surface-2 disabled:opacity-40"
      >
        {entry.priorityOrder !== null ? <PinOff size={13} /> : <Pin size={13} />}
      </button>
    </div>
  );
}

function SortableRow({ entry, now, threshold, queueNumber, busy, onTogglePin, onToggleHold }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`grid ${GRID_COLS} items-center border-b border-ll-hairline last:border-0 ${
        isDragging ? "relative z-10 bg-ll-surface-2 shadow-lg" : "hover:bg-ll-surface-2/50"
      } ${entry.claimHold ? "opacity-45" : ""}`}
    >
      <div className="flex items-center gap-1 px-2 py-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          title="ลากเพื่อจัดลำดับ"
          aria-label="ลากเพื่อจัดลำดับ"
          className="flex h-7 w-6 shrink-0 cursor-grab items-center justify-center rounded text-ll-ink-tertiary hover:bg-ll-surface-2 active:cursor-grabbing"
        >
          <GripVertical size={14} />
        </button>
        <QueueNumber value={queueNumber} held={entry.claimHold} />
      </div>
      <EntryCells entry={entry} now={now} threshold={threshold} />
      <RowActions entry={entry} busy={busy} onTogglePin={onTogglePin} onToggleHold={onToggleHold} />
    </div>
  );
}

function StaticRow({ entry, now, threshold, queueNumber, busy, onTogglePin, onToggleHold }) {
  return (
    <div
      className={`grid ${GRID_COLS} items-center border-b border-ll-hairline last:border-0 hover:bg-ll-surface-2/50 ${
        entry.claimHold ? "opacity-45" : ""
      }`}
    >
      <div className="flex items-center gap-1 px-2 py-2">
        <span className="h-7 w-6 shrink-0" />
        <QueueNumber value={queueNumber} held={entry.claimHold} />
      </div>
      <EntryCells entry={entry} now={now} threshold={threshold} />
      <RowActions entry={entry} busy={busy} onTogglePin={onTogglePin} onToggleHold={onToggleHold} />
    </div>
  );
}

// A held row has no queue number at all — it isn't in line, and giving it
// one would make the numbers below it read as further back than they are.
function QueueNumber({ value, held }) {
  if (held) {
    return (
      <span className="inline-flex items-center rounded-full bg-ll-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-ll-ink-tertiary">
        หยุด
      </span>
    );
  }
  return (
    <span
      className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold ${
        value === 1
          ? "bg-ll-primary text-ll-on-primary"
          : "bg-ll-surface-2 text-ll-ink-subtle"
      }`}
    >
      {value}
    </span>
  );
}

function HeaderRow() {
  return (
    <div
      className={`grid ${GRID_COLS} items-center border-b border-ll-hairline bg-ll-surface-2 text-[12px] font-medium text-ll-ink-subtle`}
    >
      <div className="truncate px-3 py-2">คิว</div>
      <div className="truncate px-3 py-2 text-center">ID</div>
      <div className="truncate px-3 py-2">Date_time</div>
      <div className="truncate px-3 py-2">Email</div>
      <div className="truncate px-3 py-2">Password</div>
      <div className="truncate px-3 py-2">Status</div>
      <div className="truncate px-3 py-2">เพิ่มโดย</div>
      <div className="truncate px-3 py-2">สกุลเงิน</div>
      <div className="truncate px-3 py-2">Supplier</div>
      <div className="truncate px-3 py-2 text-right">Amount</div>
      <div className="truncate px-3 py-2 text-center">รูปยืนยัน</div>
      <div className="truncate px-3 py-2">Link_SMS</div>
      <div className="truncate px-3 py-2">QNA</div>
      <div className="px-3 py-2" />
    </div>
  );
}

// Admin view of the "รับเมล" claim queue. The list is the queue: whatever
// sits at #1 is what the next person to press รับเมล gets. Split in two
// zones deliberately — pinned rows keep a hand-picked order forever, while
// everything below them stays on the automatic rule (highest-value tier
// first, oldest first within a tier). One flat draggable list would have to
// pin every row the moment anything moved, which would retire the automatic
// rule entirely.
export default function ItunePriorityTable({ initialEntries, initialSettings }) {
  const [entries, setEntries] = useState(initialEntries || []);
  const [settings, setSettings] = useState(initialSettings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [thresholdDraft, setThresholdDraft] = useState(
    String(initialSettings?.priorityAmountThreshold ?? "")
  );
  const thresholdRef = useRef(null);
  const now = useMinuteTicker();

  // Background polling (and another admin's edit) can bring back a
  // different threshold — mirror it into the input, but never while it has
  // focus, or a poll landing mid-keystroke would overwrite what's being
  // typed.
  const savedThreshold = settings?.priorityAmountThreshold;
  useEffect(() => {
    if (thresholdRef.current === document.activeElement) return;
    setThresholdDraft(String(savedThreshold ?? ""));
  }, [savedThreshold]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const pinned = useMemo(
    () => entries.filter((e) => e.priorityOrder !== null),
    [entries]
  );
  const automatic = useMemo(
    () => entries.filter((e) => e.priorityOrder === null),
    [entries]
  );

  // Queue position ignores held rows, so #1 is genuinely the next one out.
  const queueNumbers = useMemo(() => {
    const map = new Map();
    let n = 0;
    for (const entry of entries) {
      if (entry.claimHold) continue;
      n += 1;
      map.set(entry.id, n);
    }
    return map;
  }, [entries]);

  const refresh = useCallback(async () => {
    try {
      const data = await apiJson("/api/projectm/itune/priority", {
        fallbackError: "โหลดคิวไม่สำเร็จ",
      });
      setEntries(data.entries || []);
      setSettings(data.settings);
    } catch {
      // Best-effort background refresh — the next action will surface any
      // real problem with its own error message.
    }
  }, []);

  // Another admin reordering, or a topup user claiming the top of the queue,
  // both change what this page is showing without anything happening here.
  useEffect(() => {
    const id = setInterval(refresh, 15_000);
    return () => clearInterval(id);
  }, [refresh]);

  async function onDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = pinned.findIndex((e) => e.id === active.id);
    const newIndex = pinned.findIndex((e) => e.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const nextPinned = arrayMove(pinned, oldIndex, newIndex);
    // Optimistic — the drop should feel instant; the server round trip
    // below replaces this with the authoritative order either way.
    setEntries([...nextPinned, ...automatic]);
    setBusy(true);
    setError("");
    try {
      const data = await apiJson("/api/projectm/itune/priority", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: nextPinned.map((e) => e.id) }),
        fallbackError: "บันทึกลำดับไม่สำเร็จ",
      });
      setEntries(data.entries || []);
    } catch (err) {
      setError(err.message);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function patchEntry(entry, body, fallbackError) {
    setBusy(true);
    setError("");
    try {
      const data = await apiJson(`/api/projectm/itune/priority/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        fallbackError,
      });
      setEntries(data.entries || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const togglePin = (entry) =>
    patchEntry(entry, { pinned: entry.priorityOrder === null }, "ปักหมุดไม่สำเร็จ");

  const toggleHold = (entry) =>
    patchEntry(entry, { claimHold: !entry.claimHold }, "อัปเดตสถานะหยุดรับไม่สำเร็จ");

  async function saveSettings(fields, fallbackError) {
    setBusy(true);
    setError("");
    try {
      const data = await apiJson("/api/projectm/itune/release-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
        fallbackError,
      });
      setSettings(data);
      // The ด่วน threshold reorders the automatic zone, so the list has to
      // come back from the server rather than being re-sorted here.
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const paused = Boolean(settings?.claimPaused);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ll-hairline bg-ll-surface-1 px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() =>
              saveSettings({ claimPaused: !paused }, "เปลี่ยนสถานะรับเมลไม่สำเร็จ")
            }
            disabled={busy}
            className={`flex items-center gap-2 rounded-md px-3 py-2 text-[13px] font-medium transition disabled:opacity-50 ${
              paused
                ? "bg-ll-success text-ll-on-primary hover:opacity-90"
                : "border border-ll-hairline-strong text-ll-ink hover:bg-ll-surface-2"
            }`}
          >
            {paused ? <Play size={14} /> : <Pause size={14} />}
            {paused ? "เปิดให้รับเมล" : "หยุดรับเมลทั้งระบบ"}
          </button>

        </div>

        <p className="text-[12px] text-ll-ink-tertiary">
          รอให้รับ {queueNumbers.size} เมล
          {entries.length - queueNumbers.size > 0
            ? ` · หยุดไว้ ${entries.length - queueNumbers.size}`
            : ""}
          {busy && <Loader2 size={12} className="ml-2 inline animate-spin" />}
        </p>
      </div>

      {paused && (
        <div className="rounded-lg border border-ll-primary/30 bg-ll-primary-subtle-bg px-4 py-3 text-[13px] font-medium text-ll-primary-subtle-text">
          ตอนนี้หยุดรับเมลทั้งระบบอยู่ — ผู้ใช้กด &quot;รับเมล&quot; ไม่ได้จนกว่าจะกดเปิด
        </div>
      )}

      {error && (
        <div className="rounded-md border border-ll-primary/20 bg-ll-primary-subtle-bg px-3 py-2 text-[13px] text-ll-primary-subtle-text">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-1 text-[12px] text-ll-ink-tertiary">
        <p>
          หน้านี้แสดงเฉพาะเมลที่ยังไม่มีคนถือ และยอดยังไม่ต่ำกว่าเกณฑ์คืนเมล{" "}
          <span className="font-medium text-ll-ink-subtle">
            ({Number(settings?.maxAmount ?? 0).toLocaleString("th-TH", {
              minimumFractionDigits: 2,
            })})
          </span>{" "}
          — เมลที่ยอดต่ำกว่านี้ถือว่าใช้หมดแล้ว จะไม่ถูกแจกอีก ตั้งค่าได้ที่ &quot;ตั้งค่าการคืนเมล&quot;
          ในหน้า Admin
        </p>
        <p>
          ลำดับนี้เป็นของผู้ใช้ที่ไม่เคยถูก reject เมลในคิว — ผู้ใช้ที่เคยถูก reject เมลใดเมลหนึ่ง
          จะข้ามเมลนั้นไปรับตัวถัดไปแทน
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-ll-hairline bg-ll-surface-1">
        <div style={{ minWidth: GRID_MIN_WIDTH }}>
          <HeaderRow />

          <div className="border-b border-ll-hairline bg-ll-surface-2/60 px-3 py-1.5 text-[11px] font-medium text-ll-ink-subtle">
            คิวที่ปักหมุด — ลากเพื่อจัดลำดับ ({pinned.length})
          </div>
          {pinned.length === 0 ? (
            <p className="border-b border-ll-hairline px-3 py-4 text-center text-[12px] text-ll-ink-tertiary">
              ยังไม่มีเมลที่ปักหมุด — กดไอคอนหมุดในคิวอัตโนมัติเพื่อดึงขึ้นมาจัดเอง
            </p>
          ) : (
            <DndContext
              id="itune-priority-dnd"
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={onDragEnd}
            >
              <SortableContext
                items={pinned.map((e) => e.id)}
                strategy={verticalListSortingStrategy}
              >
                {pinned.map((entry) => (
                  <SortableRow
                    key={entry.id}
                    entry={entry}
                    now={now}
                    threshold={settings?.priorityAmountThreshold}
                    queueNumber={queueNumbers.get(entry.id)}
                    busy={busy}
                    onTogglePin={togglePin}
                    onToggleHold={toggleHold}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}

          {/* The threshold lives here rather than up in the settings bar so
              it sits on the divider it actually draws — everything above
              this line outranks everything below it because of this number. */}
          <div className="flex flex-wrap items-center gap-1.5 border-b border-ll-hairline bg-ll-surface-2/60 px-3 py-1.5 text-[11px] font-medium text-ll-ink-subtle">
            <span>คิวอัตโนมัติ — ยอด ≥</span>
            <input
              ref={thresholdRef}
              type="number"
              min={0}
              step={1}
              value={thresholdDraft}
              onChange={(e) => setThresholdDraft(e.target.value)}
              onBlur={() => {
                const numeric = Number(thresholdDraft);
                if (!Number.isFinite(numeric) || numeric < 0) {
                  setThresholdDraft(String(settings?.priorityAmountThreshold ?? ""));
                  return;
                }
                if (numeric === Number(settings?.priorityAmountThreshold)) return;
                saveSettings(
                  { priorityAmountThreshold: numeric },
                  "บันทึกเกณฑ์ยอดด่วนไม่สำเร็จ"
                );
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              disabled={busy}
              title="เกณฑ์ยอดด่วน — เมลที่ยอดถึงเกณฑ์นี้จะถูกแจกก่อน"
              aria-label="เกณฑ์ยอดด่วน"
              className="h-7 w-24 rounded-md border border-ll-hairline-strong bg-ll-surface-1 px-2 text-[11px] font-semibold text-ll-ink outline-none focus:border-ll-primary disabled:opacity-50"
            />
            <span>มาก่อน จากนั้นเก่าก่อน ({automatic.length})</span>
          </div>
          {automatic.length === 0 ? (
            <p className="px-3 py-6 text-center text-[12px] text-ll-ink-tertiary">
              ไม่มีเมลรอให้รับ — เมลที่ยอดต่ำกว่าเกณฑ์คืนเมลจะไม่ขึ้นที่นี่
            </p>
          ) : (
            automatic.map((entry) => (
              <StaticRow
                key={entry.id}
                entry={entry}
                now={now}
                threshold={settings?.priorityAmountThreshold}
                queueNumber={queueNumbers.get(entry.id)}
                busy={busy}
                onTogglePin={togglePin}
                onToggleHold={toggleHold}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
