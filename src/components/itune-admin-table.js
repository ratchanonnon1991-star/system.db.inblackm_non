"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Image as ImageIcon, MoreVertical, Plus, Search, Settings } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { computeItuneStatus } from "@/lib/itune-status";
import { useItuneSettings } from "@/lib/itune-settings";
import { useMinuteTicker } from "@/lib/itune-ticker";
import { readImageFileAsDataUrl } from "@/lib/itune-image";
import ItuneComboInput from "@/components/itune-combo-input";
import ItuneCountdownCell from "@/components/itune-countdown-cell";
import ItuneImagePickerModal from "@/components/itune-image-picker-modal";
import ItuneImagePreview from "@/components/itune-image-preview";

function uniq(arr) {
  return Array.from(new Set(arr.filter(Boolean))).sort((a, b) => a.localeCompare(b, "th"));
}

function isTempId(id) {
  return typeof id === "string" && id.startsWith("temp-");
}

const EDITABLE_FIELDS = [
  "support",
  "email",
  "password",
  "currency",
  "supplier",
  "amount",
  "linkSms",
  "qna",
];

function makeEmptyEntry(tempId) {
  return {
    id: tempId,
    // Captured the moment the row is added, not when it's saved — the
    // countdown (col 2) starts ticking immediately, even on an unsaved draft.
    addedAt: new Date().toISOString(),
    support: "",
    email: "",
    password: "",
    createdByUserId: null,
    createdByUsername: null,
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
};

function StatusBadge({ amount }) {
  const { label, tone } = computeItuneStatus(amount);
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE_CLASS[tone]}`}
    >
      {label}
    </span>
  );
}

// Static display <-> input toggle, single active cell at a time app-wide
// (tracked by the table via `editing`) — same click-to-edit shape as
// gameinfo-gamelist-table.js's cell components.
function EditableCell({ editing, display, onStartEdit, onContextMenu, children }) {
  if (!editing) {
    return (
      <span
        role="button"
        tabIndex={0}
        onClick={onStartEdit}
        onKeyDown={(e) => e.key === "Enter" && onStartEdit()}
        onContextMenu={onContextMenu}
        className="block min-h-[28px] cursor-text truncate rounded px-1.5 py-1 text-sm text-ll-ink hover:bg-ll-surface-2"
      >
        {display || <span className="text-ll-ink-tertiary">—</span>}
      </span>
    );
  }
  return (
    <div className="min-w-0" data-editing-cell="true" onContextMenu={onContextMenu}>
      {children}
    </div>
  );
}

// "⋮" row menu, same shape as gameinfo-gamelist-table.js's RowActionsMenu —
// portal-rendered from the trigger's own bounding rect (the table's rounded
// outer box uses overflow-x-auto, which would clip an inline dropdown for
// any row near the bottom or right edge).
function RowActionsMenu({ row, onDelete }) {
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
        className="flex h-7 w-7 items-center justify-center rounded text-ll-ink-tertiary hover:bg-ll-surface-2 hover:text-ll-ink"
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
            className="fixed z-50 w-28 overflow-hidden rounded-md border border-ll-hairline bg-ll-surface-1 py-1 shadow-[var(--ll-shadow-modal)]"
          >
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
// leaves the rest of the table looking sparsely spaced.
// The px-only columns are expressed in vw, calibrated so a 1080px-wide
// viewport renders the exact same pixel widths as before (vw = px / 1080 *
// 100) — e.g. 42px -> 3.8889vw. Note these scale with the full browser
// viewport, not the table's own max-w-[1700px] wrapper (see itune/admin's
// page.js), so on screens meaningfully wider than 1080px these columns will
// end up wider than their 1080px-calibrated pixel equivalents.
const GRID_COLS =
  "grid-cols-[50px_190px_100px_220px_minmax(100px,1.4fr)_1fr_1fr_1fr_1fr_1fr_1fr_1fr_1fr_44px]";

// ยกเลิก and บันทึก's collapsible slots in the floating pill share this exact
// width — see the pill's render comment below.
const SIDE_SLOT_WIDTH = "w-[104px]";

export default function ItuneAdminTable({ initialEntries }) {
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [imagePickerFor, setImagePickerFor] = useState(null);
  const [imageError, setImageError] = useState({});
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
      support: uniq(savedRows.map((r) => r.support)),
      email: uniq(savedRows.map((r) => r.email)),
      password: uniq(savedRows.map((r) => r.password)),
      currency: uniq(savedRows.map((r) => r.currency)),
      supplier: uniq(savedRows.map((r) => r.supplier)),
      linkSms: uniq(savedRows.map((r) => r.linkSms)),
      qna: uniq(savedRows.map((r) => r.qna)),
    }),
    [savedRows]
  );

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      [row.support, row.email, row.currency, row.supplier, row.linkSms, row.qna]
        .filter(Boolean)
        .some((v) => v.toLowerCase().includes(q))
    );
  }, [rows, search]);

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
    } catch (err) {
      window.alert(err.message);
    }
  }

  async function saveImage(row, dataUrl) {
    if (isTempId(row.id)) {
      window.alert("บันทึกแถวนี้ก่อน ถึงจะใส่รูปยืนยันได้");
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

  function comboCell(row, field, label) {
    const value = row[field] || "";
    const isEditing = editing?.id === row.id && editing?.field === field;
    return (
      <EditableCell
        editing={isEditing}
        display={value}
        onStartEdit={() => setEditing({ id: row.id, field })}
        onContextMenu={(e) => handleCellRightClickPaste(e, row.id, field)}
      >
        <ItuneComboInput
          value={value}
          onChange={(v) => updateField(row.id, field, v)}
          suggestions={suggestions[field] || []}
          placeholder={label}
          autoFocus
          onEnter={() => focusNextField(row.id, field)}
          className="w-full rounded-md border border-ll-primary bg-ll-surface-1 px-2 py-1 text-sm text-ll-ink outline-none"
        />
      </EditableCell>
    );
  }

  return (
    <div className="flex flex-col gap-3 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ll-ink-tertiary"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหา..."
            className="h-9 w-56 rounded-md border border-ll-hairline-strong bg-ll-surface-1 pl-8 pr-3 text-sm text-ll-ink outline-none focus:border-ll-primary"
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setSettingsOpen((v) => !v)}
              className="flex h-9 w-9 items-center justify-center rounded-md border border-ll-hairline-strong text-ll-ink-subtle hover:bg-ll-surface-2"
              title="ตั้งค่า"
              aria-label="ตั้งค่า"
            >
              <Settings size={15} />
            </button>
            {settingsOpen && (
              <div className="absolute right-0 top-11 z-30 w-72 rounded-lg border border-ll-hairline bg-ll-surface-1 p-3 shadow-[var(--ll-shadow-modal)]">
                <label className="flex items-start gap-2 text-[13px] text-ll-ink">
                  <input
                    type="checkbox"
                    checked={settings.rightClickPaste}
                    onChange={(e) => setSetting("rightClickPaste", e.target.checked)}
                    className="mt-0.5 h-3.5 w-3.5 accent-ll-primary"
                  />
                  <span>
                    วางข้อมูลด้วยคลิกขวา
                    <span className="mt-0.5 block text-[11px] text-ll-ink-subtle">
                      คลิกขวาแล้ววางจากคลิปบอร์ดได้ทันที ใช้ได้ทั้งรูป (คอลัมน์รูปทุกคอลัมน์) และช่องกรอกข้อมูลทุกช่อง — เปิดเป็นค่าเริ่มต้น
                    </span>
                  </span>
                </label>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-ll-hairline bg-ll-surface-1 shadow-[var(--ll-shadow-card)]">
        <div className="w-full text-sm">
          <div
            className={`grid ${GRID_COLS} border-b border-ll-hairline bg-ll-surface-2 text-left text-[11px] font-medium uppercase tracking-wide text-ll-ink-subtle`}
          >
            <div className="truncate px-3 py-2 text-center">ID</div>
            <div className="truncate px-3 py-2">Date_time</div>
            <div className="truncate px-3 py-2">Support</div>
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

          {filteredRows.map((row) => (
            <div
              key={row.id}
              className={`grid ${GRID_COLS} items-center border-b border-ll-hairline last:border-0 hover:bg-ll-surface-2/50`}
            >
              <div className="min-w-0 truncate px-3 py-2 text-center font-mono text-xs text-ll-ink-subtle">
                {isTempId(row.id) ? "ใหม่" : row.id}
              </div>
              <div className="min-w-0 truncate px-3 py-2">
                <ItuneCountdownCell addedAt={row.addedAt} now={now} />
              </div>
              <div className="min-w-0 px-3 py-2">{comboCell(row, "support", "Support")}</div>
              <div className="min-w-0 px-3 py-2">{comboCell(row, "email", "Email")}</div>
              <div className="min-w-0 px-3 py-2">{comboCell(row, "password", "Password")}</div>
              <div className="min-w-0 px-3 py-2">
                <StatusBadge amount={row.amount} />
              </div>
              <div className="min-w-0 truncate px-3 py-2 text-xs text-ll-ink-subtle">
                {row.createdByUsername || "-"}
              </div>
              <div className="min-w-0 px-3 py-2">{comboCell(row, "currency", "สกุลเงิน")}</div>
              <div className="min-w-0 px-3 py-2">{comboCell(row, "supplier", "Supplier")}</div>
              <div
                className="min-w-0 px-3 py-2 text-right"
                data-editing-cell={
                  editing?.id === row.id && editing?.field === "amount" ? "true" : undefined
                }
                onContextMenu={(e) => handleCellRightClickPaste(e, row.id, "amount")}
              >
                {editing?.id === row.id && editing?.field === "amount" ? (
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
              <div className="flex min-w-0 items-center justify-center px-3 py-2">
                <RowActionsMenu row={row} onDelete={deleteRow} />
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
          gameinfo-gamelist-table.js): ยกเลิก/บันทึก are plain text living
          inside the pill and collapse to width 0 when nothing is dirty;
          "เพิ่มรายการ" is a solid capsule that stays put as the pill's
          permanent center anchor. The outer pill sizes off its own padding
          (p-1) rather than a fixed height, so the frame around the capsule
          stays even on all four sides — with no edits yet, that's the only
          thing visible. Both side slots share the exact same fixed width
          (SIDE_SLOT_WIDTH) so the pill — and the capsule sitting in its
          middle — never drifts off-center regardless of which side is
          currently collapsed. Error/saved messages stack above the pill in
          the same wrapper, same layout as gameinfo's floating bar. */}
      <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 flex-col items-center gap-2 px-4">
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
            className={`flex flex-none min-w-0 items-center justify-center overflow-hidden transition-all duration-200 ${
              dirty ? `${SIDE_SLOT_WIDTH} opacity-100` : "w-0 opacity-0"
            }`}
          >
            <button
              type="button"
              onClick={cancelAll}
              disabled={saving}
              className="whitespace-nowrap px-3 text-[13px] font-medium text-ll-ink-subtle hover:text-ll-ink disabled:opacity-50"
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
            className={`flex flex-none min-w-0 items-center justify-center overflow-hidden transition-all duration-200 ${
              dirty ? `${SIDE_SLOT_WIDTH} opacity-100` : "w-0 opacity-0"
            }`}
          >
            <button
              type="button"
              onClick={saveAll}
              disabled={saving}
              className="whitespace-nowrap px-3 text-[13px] font-medium text-ll-primary hover:text-ll-primary-hover disabled:opacity-50"
            >
              {saving ? "กำลังบันทึก..." : "บันทึก"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
