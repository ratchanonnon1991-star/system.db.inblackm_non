"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ChevronsLeft,
  ChevronsRight,
  ExternalLink,
  GripVertical,
  Image as ImageIcon,
  MoreVertical,
  Plus,
} from "lucide-react";
import { apiJson } from "@/lib/api-json";
import GameinfoMemoryInput from "./gameinfo-memory-input";
import GameinfoNameInput from "./gameinfo-name-input";
import GameinfoTutorialButton from "./gameinfo-tutorial-modal";

// Rank, ทำซ้ำได้ (isRepeatable), หมายเหตุ (remark) are hidden per request —
// the fields/backend still exist (game_list columns, API fields), this only
// removes them from the table UI. Channel is back, but no longer game_list's
// own `channel` field — it's read-only, aggregated from that game's packs
// (gamelist_packs.channelsMain/channelsSecondary), same as the old
// games-admin table's mainChannels/secondaryChannels columns did.
// ดู/แพ็ก/ลบ live together behind one "⋮" menu instead of separate cells.
// Tutorial is its own always-visible column (not folded into the "⋮" menu)
// since role "user" needs to open it too, read-only — see
// gameinfo-tutorial-modal.js.
// รูป is a plain placeholder icon (see RowThumb) and pack count is shown
// inline next to the game name (not its own column) — both ported from the
// old admin games-table, see listGamelistPackCountByGame().
const GRID_COLS =
  "grid-cols-[28px_60px_50px_44px_minmax(160px,1.4fr)_110px_110px_110px_130px_minmax(140px,1fr)_130px_minmax(140px,1fr)_110px_44px]";

function uniq(arr) {
  return Array.from(new Set(arr.filter(Boolean))).sort((a, b) => a.localeCompare(b, "th"));
}

// Draft rows created by "เพิ่มเกม" get a client-only temp-* id and are never
// added to savedRows/POSTed until "บันทึก" — so an add the user abandons
// (navigates away, or hits "ยกเลิก") never touches game_list at all.
function isTempId(id) {
  return typeof id === "string" && id.startsWith("temp-");
}

// Direct edit table over Topup Panel's `game_list` — one page serves both the
// read-only view (role=user, `editable=false`) and the inline edit UI
// (staff/admin). game_list itself has no order column (shared with Topup
// Panel, not ours to ALTER) — drag order is persisted in a small side table,
// gamelist_order, via src/server/gameinfo-gamelist.js's reorderGameListRows().
export default function GameinfoGamelistTable({ initial, editable, lang }) {
  const [rows, setRows] = useState(initial);
  // Last-known-persisted values (including order) — field edits, drag
  // reordering, and adding a new row all only touch `rows` (the draft) until
  // "บันทึก" is pressed; "ยกเลิก" reverts `rows` back to this, which also
  // discards any not-yet-saved new row since it was never added here. Delete
  // stays immediate — it already has its own confirm() gate (except for a
  // still-unsaved draft row, which just disappears).
  const [savedRows, setSavedRows] = useState(initial);
  const [dirtyIds, setDirtyIds] = useState(new Set());
  const [orderDirty, setOrderDirty] = useState(false);
  // Row ids whose name field currently exactly matches another game's name
  // (see GameinfoNameInput) — blocks "บันทึก" until resolved.
  const [duplicateIds, setDuplicateIds] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);
  const [, startTransition] = useTransition();
  const draftIdRef = useRef(0);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Search/filter — purely a display-level narrowing of `rows`, same idea as
  // pagination below. Never mutates `rows` itself, so it can't interfere with
  // drag order, dirty tracking, or save/cancel.
  const [search, setSearch] = useState("");
  const [filterRegion, setFilterRegion] = useState("");
  const [filterPlatform, setFilterPlatform] = useState("");
  const [filterServer, setFilterServer] = useState("");
  const [filterVpn, setFilterVpn] = useState("");
  const filtersActive = Boolean(search.trim() || filterRegion || filterPlatform || filterServer || filterVpn);

  function clearFilters() {
    setSearch("");
    setFilterRegion("");
    setFilterPlatform("");
    setFilterServer("");
    setFilterVpn("");
  }

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !(r.game || "").toLowerCase().includes(q)) return false;
      if (filterRegion && r.region !== filterRegion) return false;
      if (filterPlatform && r.platform !== filterPlatform) return false;
      if (filterServer && r.server !== filterServer) return false;
      if (filterVpn && (r.vpnComputed || "NO") !== filterVpn) return false;
      return true;
    });
  }, [rows, search, filterRegion, filterPlatform, filterServer, filterVpn]);

  // Pagination is purely a display window over `filteredRows` — dragging,
  // saving, duplicate-checking etc. all still operate on the complete `rows`
  // list. Reordering only works within the current page (dnd-kit's
  // SortableContext only knows about the rows actually rendered); dragging
  // across a page boundary isn't supported, and with a filter active,
  // dragging only reorders relative to other currently-visible rows.
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const clampedPage = Math.min(page, pageCount - 1);
  const pageRows = filteredRows.slice(clampedPage * pageSize, clampedPage * pageSize + pageSize);

  // Jump back to page 1 whenever the filter narrows/widens the result set —
  // otherwise the current page number can point past the new, shorter list.
  // addNewRow sets this ref before clearing filters itself, so it can send
  // the page straight to wherever the new row landed instead of having this
  // effect immediately snap it back to page 1.
  const skipFilterPageResetRef = useRef(false);
  useEffect(() => {
    if (skipFilterPageResetRef.current) {
      skipFilterPageResetRef.current = false;
      return;
    }
    setPage(0);
  }, [search, filterRegion, filterPlatform, filterServer, filterVpn]);

  // Derived from savedRows (last-persisted state), not the live `rows` draft
  // — savedRows only changes on save/cancel/add/delete, not on every
  // keystroke, so typing in one cell doesn't re-run five uniq()+sort() passes
  // over every row on every character. Autocomplete lagging one field behind
  // an in-progress, unsaved edit is fine (arguably more correct — it's
  // "values that exist in the system", not "values I'm mid-typing").
  const suggestions = useMemo(
    () => ({
      regions: uniq(savedRows.map((r) => r.region)),
      platforms: uniq(savedRows.map((r) => r.platform)),
      servers: uniq(savedRows.map((r) => r.server)),
      // vpns: not used — VPN is now a read-only column computed from packs.
      // channels: not used — Channel column is hidden from the table.
      botManuals: uniq(savedRows.map((r) => r.botManual)),
      links: uniq(savedRows.map((r) => r.link)),
    }),
    [savedRows]
  );

  // Dragging only reorders the local draft — persisted by reorderGameListRows
  // only when "บันทึก" is pressed, same as field edits.
  function onDragEnd(e) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = rows.findIndex((r) => r.id === active.id);
    const newIndex = rows.findIndex((r) => r.id === over.id);
    setRows(arrayMove(rows, oldIndex, newIndex));
    setOrderDirty(true);
  }

  // Typing a target position in "ลำดับ" inserts the row there — arrayMove
  // pulls it out of its current spot and slots it in at the target index,
  // shifting everything in between along the way, same as a drag would.
  // It's never a swap with whoever currently holds that number.
  function onReorderByNumber(rowId, targetPosition) {
    const currentIndex = rows.findIndex((r) => r.id === rowId);
    if (currentIndex === -1) return;
    const targetIndex = Math.min(Math.max(0, targetPosition - 1), rows.length - 1);
    if (targetIndex === currentIndex) return;
    setRows(arrayMove(rows, currentIndex, targetIndex));
    setOrderDirty(true);
    setPage(Math.floor(targetIndex / pageSize));
  }

  function onDelete(id, name) {
    // Unsaved draft row (never persisted — see addNewRow) — just drop it
    // locally, no DELETE call and no confirm needed.
    const isDraft = isTempId(id);
    if (!isDraft && !confirm(`ลบเกม "${name}" ออกจากฐานข้อมูลจริง (game_list)?\nข้อมูลนี้ใช้ร่วมกับ Topup Panel — ลบแล้วกู้คืนไม่ได้`))
      return;
    setRows((prev) => prev.filter((r) => r.id !== id));
    if (!isDraft) setSavedRows((prev) => prev.filter((r) => r.id !== id));
    setDirtyIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setDuplicateIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    if (!isDraft) {
      startTransition(() => {
        apiJson(`/api/gameinfo/gamelist/${id}`, { method: "DELETE" }).catch(() => {});
      });
    }
  }

  // Field edits only update the local draft — no request until "บันทึก".
  // Whitespace-only changes (leading/trailing/extra spaces from typing) don't
  // count as an edit: if a field's trimmed value still matches the saved row,
  // the row drops back out of dirtyIds — pressing space, then space, then
  // backspace shouldn't leave "บันทึก" enabled with nothing real to save.
  function updateField(rowId, field, value) {
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, [field]: value } : r)));
    setDirtyIds((prev) => {
      const row = rows.find((r) => r.id === rowId);
      const saved = savedRows.find((r) => r.id === rowId);
      if (row && saved) {
        const updated = { ...row, [field]: value };
        const isUnchanged = Object.keys(saved).every((key) => {
          const a = updated[key];
          const b = saved[key];
          if (typeof a === "string" && typeof b === "string") {
            return a.trim() === b.trim();
          }
          return a === b;
        });
        if (isUnchanged) {
          if (!prev.has(rowId)) return prev;
          const next = new Set(prev);
          next.delete(rowId);
          return next;
        }
      }
      return prev.has(rowId) ? prev : new Set(prev).add(rowId);
    });
  }

  async function saveAll() {
    if (duplicateIds.size > 0) return; // belt-and-suspenders — the button is already disabled
    setSaving(true);
    try {
      const dirtyRows = rows.filter((r) => dirtyIds.has(r.id));
      const draftRows = dirtyRows.filter((r) => isTempId(r.id));
      const editedRows = dirtyRows.filter((r) => !isTempId(r.id));

      // Draft rows (from "เพิ่มเกม") only actually get created here — this is
      // the one point where an add becomes real.
      const created = await Promise.all(
        draftRows.map(async (r) => {
          const { id: tempId, ...payload } = r;
          const { row } = await apiJson("/api/gameinfo/gamelist", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          return [tempId, row];
        })
      );
      const idMap = new Map(created);
      const nextRows = rows.map((r) => idMap.get(r.id) ?? r);

      const requests = editedRows.map((r) =>
        apiJson(`/api/gameinfo/gamelist/${r.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(r),
        })
      );
      if (orderDirty) {
        requests.push(
          apiJson("/api/gameinfo/gamelist/reorder", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderedIds: nextRows.map((r) => r.id) }),
          })
        );
      }
      await Promise.all(requests);
      setRows(nextRows);
      setSavedRows(nextRows);
      setDirtyIds(new Set());
      setOrderDirty(false);
    } finally {
      setSaving(false);
    }
  }

  function cancelAll() {
    setRows(savedRows);
    setDirtyIds(new Set());
    setOrderDirty(false);
    setDuplicateIds(new Set());
    setEditing(null);
  }

  function setRowDuplicate(rowId, isDuplicate) {
    setDuplicateIds((prev) => {
      const has = prev.has(rowId);
      if (isDuplicate === has) return prev;
      const next = new Set(prev);
      if (isDuplicate) next.add(rowId);
      else next.delete(rowId);
      return next;
    });
  }

  // Adds a client-only draft row — nothing is sent to the server (and
  // game_list gains no row) until "บันทึก" is pressed, same as any other
  // field edit. "ยกเลิก" (or navigating away) just drops it via cancelAll's
  // rows = savedRows reset, since the draft never entered savedRows.
  function addNewRow() {
    const tempId = `temp-${++draftIdRef.current}`;
    const row = {
      id: tempId,
      game: "เกมใหม่",
      region: "",
      platform: "",
      server: "",
      vpn: "NO VPN",
      vpnComputed: "NO",
      channel: "",
      channels: [],
      rankStars: 0,
      botManual: "",
      isRepeatable: false,
      link: "",
      remark: "",
      packCount: 0,
    };
    // Clear any active search/filter first — otherwise the new row (still
    // blank in most fields) could fail to match and be invisible right after
    // it's added.
    if (filtersActive) {
      skipFilterPageResetRef.current = true;
      clearFilters();
    }
    setRows((prev) => [...prev, row]);
    setDirtyIds((prev) => new Set(prev).add(tempId));
    setEditing({ id: tempId, field: "game" });
    // Jump to the last page so the new row (already in edit mode) is
    // actually visible instead of landing off-screen on whatever page the
    // user happened to be viewing.
    setPage(Math.max(0, Math.ceil((rows.length + 1) / pageSize) - 1));
  }

  const dirty = dirtyIds.size > 0 || orderDirty;

  const isEditing = (rowId, field) => editing?.id === rowId && editing.field === field;

  const rowProps = {
    lang,
    editable,
    suggestions,
    isEditing,
    setEditing,
    updateField,
    onDelete,
    savedRows,
    setRowDuplicate,
    totalRows: rows.length,
    onReorderByNumber,
  };

  const paginationBar = filteredRows.length > 0 && (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <span className="text-xs text-linear-ink-tertiary">
        {filtersActive
          ? `พบ ${filteredRows.length} จาก ${rows.length} เกม`
          : `ทั้งหมด ${rows.length} เกม`}{" "}
        — หน้า {clampedPage + 1}/{pageCount}
      </span>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs text-linear-ink-tertiary">
          แสดงต่อหน้า
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(0);
            }}
            className="rounded border border-linear-hairline-strong bg-linear-surface-1 px-2 py-1 text-xs text-linear-ink outline-none"
          >
            {[10, 25, 50, 100, 200].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPage(0)}
            disabled={clampedPage === 0}
            title="หน้าแรก"
            aria-label="หน้าแรก"
            className="flex items-center rounded border border-linear-hairline-strong p-1.5 text-linear-ink-muted hover:bg-linear-surface-2 disabled:opacity-40"
          >
            <ChevronsLeft size={13} />
          </button>
          <button
            type="button"
            onClick={() => setPage(Math.max(0, clampedPage - 1))}
            disabled={clampedPage === 0}
            className="flex items-center gap-1 rounded border border-linear-hairline-strong px-2.5 py-1 text-xs text-linear-ink-muted hover:bg-linear-surface-2 disabled:opacity-40"
          >
            <ArrowLeft size={13} /> ก่อนหน้า
          </button>
          <span className="px-2 text-xs text-linear-ink-tertiary">
            {clampedPage + 1} / {pageCount}
          </span>
          <button
            type="button"
            onClick={() => setPage(Math.min(pageCount - 1, clampedPage + 1))}
            disabled={clampedPage >= pageCount - 1}
            className="flex items-center gap-1 rounded border border-linear-hairline-strong px-2.5 py-1 text-xs text-linear-ink-muted hover:bg-linear-surface-2 disabled:opacity-40"
          >
            ถัดไป <ArrowRight size={13} />
          </button>
          <button
            type="button"
            onClick={() => setPage(pageCount - 1)}
            disabled={clampedPage >= pageCount - 1}
            title="หน้าสุดท้าย"
            aria-label="หน้าสุดท้าย"
            className="flex items-center rounded border border-linear-hairline-strong p-1.5 text-linear-ink-muted hover:bg-linear-surface-2 disabled:opacity-40"
          >
            <ChevronsRight size={13} />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1 max-w-xs">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อเกม..."
            className="h-9 w-full rounded-md border border-linear-hairline-strong bg-linear-surface-1 px-3 text-sm text-linear-ink outline-none focus:border-linear-primary focus:ring-2 focus:ring-linear-primary/20"
          />
        </div>

        <select
          value={filterRegion}
          onChange={(e) => setFilterRegion(e.target.value)}
          className="h-9 rounded-md border border-linear-hairline-strong bg-linear-surface-1 px-2 text-sm text-linear-ink outline-none focus:border-linear-primary"
        >
          <option value="">Region ทั้งหมด</option>
          {suggestions.regions.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>

        <select
          value={filterPlatform}
          onChange={(e) => setFilterPlatform(e.target.value)}
          className="h-9 rounded-md border border-linear-hairline-strong bg-linear-surface-1 px-2 text-sm text-linear-ink outline-none focus:border-linear-primary"
        >
          <option value="">Platform ทั้งหมด</option>
          {suggestions.platforms.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>

        <select
          value={filterServer}
          onChange={(e) => setFilterServer(e.target.value)}
          className="h-9 rounded-md border border-linear-hairline-strong bg-linear-surface-1 px-2 text-sm text-linear-ink outline-none focus:border-linear-primary"
        >
          <option value="">Server ทั้งหมด</option>
          {suggestions.servers.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>

        <select
          value={filterVpn}
          onChange={(e) => setFilterVpn(e.target.value)}
          className="h-9 rounded-md border border-linear-hairline-strong bg-linear-surface-1 px-2 text-sm text-linear-ink outline-none focus:border-linear-primary"
        >
          <option value="">VPN ทั้งหมด</option>
          <option value="NO">NO</option>
          <option value="YES">YES</option>
        </select>

        {filtersActive && (
          <button
            type="button"
            onClick={clearFilters}
            className="h-9 rounded-md border border-linear-hairline-strong px-3 text-sm text-linear-ink-muted hover:bg-linear-surface-2"
          >
            ล้างตัวกรอง
          </button>
        )}
      </div>

      {paginationBar && <div className="mb-3">{paginationBar}</div>}

      <div className="overflow-hidden rounded-lg border border-linear-hairline bg-linear-surface-1">
        <div className="scroll-x">
          <div className="min-w-[1400px]">
            <div
              className={`grid ${GRID_COLS} gap-2 border-b border-linear-hairline bg-linear-surface-2 px-3 py-2 text-xs font-medium text-linear-ink-subtle`}
            >
              <span></span>
              <span>ลำดับ</span>
              <span>ID</span>
              <span>รูป</span>
              <span className="px-2">ชื่อเกม</span>
              <span className="px-2">Region</span>
              <span className="px-2">Platform</span>
              <span className="px-2">Server</span>
              <span className="px-2">VPN</span>
              <span className="px-2">ช่องทาง</span>
              {/* Rank: not shown — hidden per request, field still exists on game_list */}
              <span className="px-2">Bot/Manual</span>
              {/* ทำซ้ำได้ (isRepeatable): not shown — hidden per request, field still exists on game_list */}
              <span className="px-2">Link</span>
              {/* หมายเหตุ (remark): not shown — hidden per request, field still exists on game_list */}
              <span className="px-2">Tutorial</span>
              <span></span>
            </div>

            {filteredRows.length === 0 ? (
              <p className="p-6 text-sm text-linear-ink-tertiary">
                {rows.length === 0 ? "ยังไม่มีเกม" : "ไม่พบเกมที่ตรงกับตัวกรอง"}
              </p>
            ) : editable ? (
              <DndContext
                id="gameinfo-gamelist-dnd"
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={onDragEnd}
              >
                <SortableContext items={pageRows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
                  {pageRows.map((row) => (
                    <SortableRow
                      key={row.id}
                      row={row}
                      order={rows.findIndex((r) => r.id === row.id) + 1}
                      {...rowProps}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            ) : (
              pageRows.map((row) => (
                <StaticRow
                  key={row.id}
                  row={row}
                  order={rows.findIndex((r) => r.id === row.id) + 1}
                  {...rowProps}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {paginationBar && <div className="mt-3">{paginationBar}</div>}

      {editable && (
        <div className="fixed bottom-6 left-1/2 z-30 flex -translate-x-1/2 flex-col items-center gap-2">
          {duplicateIds.size > 0 && (
            <span className="flex items-center gap-1 rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1 text-xs text-red-400 shadow-lg">
              <AlertTriangle size={13} /> มีชื่อเกมซ้ำกัน {duplicateIds.size} แถว — แก้ชื่อก่อนถึงจะบันทึกได้
            </span>
          )}
          {/* One continuous pill (not three separate floating buttons) —
              ยกเลิก/บันทึก are plain text sitting inside it, "เพิ่มเกม" is a
              solid capsule a little taller than the bar so it visibly pops
              out of the middle, like a badge. Both side wrappers use the same
              fixed width (not just the same max-width — max-width alone lets
              each shrink to its own text's content width, so "ยกเลิก" and
              "บันทึก" ended up different sizes since they're different
              strings) and center their button inside it, so the pill stays
              symmetric left/right and the text is centered in its own slot
              rather than hugging one edge. ยกเลิก/บันทึก stay mounted and
              collapse to w-0 when !dirty so the pill smoothly narrows around
              "เพิ่มเกม" instead of them appearing/disappearing abruptly.
              min-w-0 + flex-none on these wrappers matters: flex children
              default to min-width:auto, which fights an animated width:0 and
              leaves each one pinned to its own text's min-content width
              instead of truly collapsing — since "ยกเลิก" and "บันทึก" are
              different-width strings, that leftover was different on each
              side, throwing the pill visibly off-center around "เพิ่มเกม". */}
          <div className="flex h-11 items-center rounded-full border border-linear-hairline bg-linear-surface-1 shadow-lg">
            <div
              className={`min-w-0 flex-none flex justify-center overflow-hidden transition-all duration-300 ease-out ${
                dirty ? "w-[92px] opacity-100" : "w-0 opacity-0"
              }`}
            >
              <button
                type="button"
                onClick={cancelAll}
                disabled={saving || !dirty}
                className="w-full whitespace-nowrap py-2 text-center text-sm font-medium text-linear-ink-muted hover:text-linear-ink disabled:opacity-50"
              >
                ยกเลิก
              </button>
            </div>

            <button
              type="button"
              onClick={addNewRow}
              className="-my-0.5 flex h-10 items-center gap-2 whitespace-nowrap rounded-full bg-linear-primary px-4 text-sm font-medium text-white shadow-md hover:bg-linear-primary-hover"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full border border-white/40">
                <Plus size={14} />
              </span>
              เพิ่มเกม
            </button>

            <div
              className={`min-w-0 flex-none flex justify-center overflow-hidden transition-all duration-300 ease-out ${
                dirty ? "w-[92px] opacity-100" : "w-0 opacity-0"
              }`}
            >
              <button
                type="button"
                onClick={saveAll}
                disabled={saving || !dirty || duplicateIds.size > 0}
                title={duplicateIds.size > 0 ? "แก้ชื่อเกมที่ซ้ำก่อนถึงจะบันทึกได้" : undefined}
                className="w-full whitespace-nowrap py-2 text-center text-sm font-medium text-linear-primary hover:text-linear-primary-hover disabled:opacity-50"
              >
                {saving ? "กำลังบันทึก…" : "บันทึก"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function SortableRow({ row, ...rest }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className={`grid ${GRID_COLS} items-center gap-2 border-b border-linear-hairline px-3 py-2 text-sm last:border-b-0`}>
      <button
        {...attributes}
        {...listeners}
        className="flex cursor-grab items-center justify-center text-linear-ink-tertiary hover:text-linear-ink-muted active:cursor-grabbing"
        aria-label="ลากเพื่อจัดลำดับ"
        title="ลากเพื่อจัดลำดับ"
      >
        <GripVertical size={14} />
      </button>
      <RowCells row={row} {...rest} />
    </div>
  );
}

function StaticRow({ row, ...rest }) {
  const router = useRouter();
  // View-only mode (role "user", or admin/staff previewing via the
  // "หน้าเว็บ" toggle) — the whole row is the click target straight to the
  // detail page, not just a menu item, since there's nothing to edit here
  // anyway. RowActionsMenu still stops its own clicks from bubbling here.
  return (
    <div
      onClick={() => router.push(`/gameinfo/${rest.lang}/${row.id}`)}
      className={`grid ${GRID_COLS} cursor-pointer items-center gap-2 border-b border-linear-hairline px-3 py-2 text-sm last:border-b-0 hover:bg-linear-surface-2`}
    >
      <span></span>
      <RowCells row={row} {...rest} />
    </div>
  );
}

function RowCells({
  row,
  order,
  lang,
  editable,
  suggestions,
  isEditing,
  setEditing,
  updateField,
  onDelete,
  savedRows,
  setRowDuplicate,
  totalRows,
  onReorderByNumber,
}) {
  const editingName = isEditing(row.id, "game");
  return (
    <>
      <OrderCell
        editable={editable}
        editing={isEditing(row.id, "order")}
        order={order}
        totalRows={totalRows}
        onStartEdit={() => setEditing({ id: row.id, field: "order" })}
        onCommit={() => setEditing(null)}
        onReorder={(n) => onReorderByNumber(row.id, n)}
      />
      <span className="text-linear-ink-tertiary">{row.id}</span>

      <RowThumb />

      <NameCell
        editable={editable}
        editing={editingName}
        value={row.game}
        packCount={row.packCount}
        // Only build the "every other game's name" list while this row is
        // actually the one being renamed — computing it (and the fuzzy-match
        // pass it feeds inside GameinfoNameInput) for all ~200+ rows on
        // every keystroke elsewhere in the table is what caused the jitter.
        // Sourced from savedRows so it doesn't get rebuilt on every
        // keystroke either.
        existingNames={editingName ? savedRows.filter((r) => r.id !== row.id).map((r) => r.game) : undefined}
        onDuplicateChange={(isDup) => setRowDuplicate(row.id, isDup)}
        onStartEdit={() => setEditing({ id: row.id, field: "game" })}
        onCommit={() => setEditing(null)}
        onChange={(v) => updateField(row.id, "game", v)}
      />

      <TextCell
        editable={editable}
        editing={isEditing(row.id, "region")}
        value={row.region}
        onStartEdit={() => setEditing({ id: row.id, field: "region" })}
        onCommit={() => setEditing(null)}
      >
        <GameinfoMemoryInput
          value={row.region}
          onChange={(v) => updateField(row.id, "region", v)}
          suggestions={suggestions.regions}
          className="h-9 w-full rounded border border-linear-primary/40 px-2 text-sm outline-none"
          autoFocus
        />
      </TextCell>

      <TextCell
        editable={editable}
        editing={isEditing(row.id, "platform")}
        value={row.platform}
        onStartEdit={() => setEditing({ id: row.id, field: "platform" })}
        onCommit={() => setEditing(null)}
      >
        <GameinfoMemoryInput
          value={row.platform}
          onChange={(v) => updateField(row.id, "platform", v)}
          suggestions={suggestions.platforms}
          className="h-9 w-full rounded border border-linear-primary/40 px-2 text-sm outline-none"
          autoFocus
        />
      </TextCell>

      <TextCell
        editable={editable}
        editing={isEditing(row.id, "server")}
        value={row.server}
        onStartEdit={() => setEditing({ id: row.id, field: "server" })}
        onCommit={() => setEditing(null)}
      >
        <GameinfoMemoryInput
          value={row.server}
          onChange={(v) => updateField(row.id, "server", v)}
          suggestions={suggestions.servers}
          className="h-9 w-full rounded border border-linear-primary/40 px-2 text-sm outline-none"
          autoFocus
        />
      </TextCell>

      <VpnBadge value={row.vpnComputed} />

      <ChannelTags values={row.channels} />

      {/* Rank cell: not shown — hidden per request, row.rankStars still exists */}

      <TextCell
        editable={editable}
        editing={isEditing(row.id, "botManual")}
        value={row.botManual}
        onStartEdit={() => setEditing({ id: row.id, field: "botManual" })}
        onCommit={() => setEditing(null)}
      >
        <GameinfoMemoryInput
          value={row.botManual}
          onChange={(v) => updateField(row.id, "botManual", v)}
          suggestions={suggestions.botManuals}
          className="h-9 w-full rounded border border-linear-primary/40 px-2 text-sm outline-none"
          autoFocus
        />
      </TextCell>

      {/* isRepeatable checkbox: not shown — hidden per request, row.isRepeatable still exists */}

      {isEditing(row.id, "link") ? (
        <EditBox onCommit={() => setEditing(null)}>
          <GameinfoMemoryInput
            value={row.link}
            onChange={(v) => updateField(row.id, "link", v)}
            suggestions={suggestions.links}
            placeholder="https://..."
            className="h-9 w-full rounded border border-linear-primary/40 px-2 text-sm outline-none"
            autoFocus
          />
        </EditBox>
      ) : (
        <span
          onClick={() => editable && setEditing({ id: row.id, field: "link" })}
          className={`flex h-9 items-center truncate rounded border border-transparent px-2 ${editable ? "cursor-pointer hover:bg-linear-surface-2" : ""}`}
        >
          {row.link ? (
            <a
              href={row.link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 text-xs text-linear-primary hover:underline"
            >
              เว็บ <ExternalLink size={12} />
            </a>
          ) : (
            <span className="text-xs text-linear-ink-tertiary">-</span>
          )}
        </span>
      )}

      {/* remark cell: not shown — hidden per request, row.remark still exists */}

      {/* Always rendered regardless of editable — role "user" (and the
          "หน้าเว็บ" preview) can still open it, just read-only inside. */}
      <span className="flex justify-start" onClick={(e) => e.stopPropagation()}>
        <GameinfoTutorialButton gameId={row.id} gameName={row.game} editable={editable} />
      </span>

      {/* In view-only mode (role "user", or the "หน้าเว็บ" toggle's ?view=1
          preview) the whole row already navigates to the detail page on
          click (see StaticRow) — the "⋮" menu only ever had "ดู" for that
          case anyway, so it's redundant there and just hidden. */}
      {editable && <RowActionsMenu row={row} lang={lang} editable={editable} onDelete={onDelete} />}
    </>
  );
}

// ดู/แพ็ก/ลบ combined into one "⋮" trigger. Rendered via a portal (positioned
// from the trigger's own bounding rect) rather than inline — the table's
// outer box uses overflow-hidden for its rounded corners, which would clip
// an inline dropdown for any row near the bottom or right edge.
function RowActionsMenu({ row, lang, editable, onDelete }) {
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
    // stopPropagation here — in view-only mode the whole row navigates to
    // the detail page on click (see StaticRow); this menu (and its
    // portal-rendered items, which still bubble through the React tree even
    // though they're not DOM descendants of this span) needs to not also
    // trigger that.
    <span className="relative flex justify-end" onClick={(e) => e.stopPropagation()}>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggleOpen}
        className="flex h-7 w-7 items-center justify-center rounded text-linear-ink-tertiary hover:bg-linear-surface-2 hover:text-linear-ink-muted"
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
            className="fixed z-50 w-32 overflow-hidden rounded-md border border-linear-hairline bg-linear-surface-1 py-1 shadow-lg"
          >
            <Link
              href={`/gameinfo/${lang}/${row.id}`}
              onClick={() => setOpen(false)}
              className="block px-3 py-1.5 text-xs text-linear-ink hover:bg-linear-surface-2"
            >
              ดู
            </Link>
            {editable && (
              <Link
                href={`/gameinfo/${lang}/${row.id}/packs`}
                onClick={() => setOpen(false)}
                className="block px-3 py-1.5 text-xs text-linear-ink hover:bg-linear-surface-2"
              >
                แพ็ก
              </Link>
            )}
            {editable && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onDelete(row.id, row.game);
                }}
                className="block w-full px-3 py-1.5 text-left text-xs text-red-400 hover:bg-red-500/10"
              >
                ลบ
              </button>
            )}
          </div>,
          document.body
        )}
    </span>
  );
}

// Read-only — replaces game_list's own free-text `vpn` field entirely.
// "YES" means at least one of this game's packs has a `country` set (country
// is only meaningful on VPN-required packs, see the pack editor's vpnOn-gated
// country field); otherwise "NO". Edit it via the pack editor, not here.
function VpnBadge({ value }) {
  const isYes = value === "YES";
  return (
    <span
      className={`inline-block w-fit rounded px-1.5 py-0.5 text-[11px] font-medium ${
        isYes ? "bg-rose-500/15 text-rose-300" : "bg-linear-surface-3 text-linear-ink-tertiary"
      }`}
    >
      {value || "NO"}
    </span>
  );
}

// Read-only, unlike the other cells — this isn't a game_list field, it's
// derived from every pack's channelsMain/channelsSecondary, so there's no
// single value to click-to-edit here (edit channels via the pack editor).
// Main and secondary are labeled separately rather than merged into one
// list, and secondary explicitly says "ไม่มี" when empty instead of just
// disappearing, so it's clear that side was checked and found empty.
function ChannelTags({ values }) {
  const main = values?.main || [];
  const secondary = values?.secondary || [];
  if (main.length === 0 && secondary.length === 0) {
    return <span className="text-xs text-linear-ink-tertiary">-</span>;
  }
  return (
    <div className="space-y-1 text-[11px]">
      <ChannelTagRow label="หลัก" tags={main} />
      <ChannelTagRow label="รอง" tags={secondary} />
    </div>
  );
}

function ChannelTagRow({ label, tags }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="shrink-0 text-linear-ink-subtle">{label}:</span>
      {tags.length === 0 ? (
        <span className="text-linear-ink-tertiary">ไม่มี</span>
      ) : (
        tags.map((v) => (
          <span
            key={v}
            className="truncate rounded bg-linear-surface-3 px-1.5 py-0.5 text-linear-ink-muted"
          >
            {v}
          </span>
        ))
      )}
    </div>
  );
}

// Click "#N" to type a target position directly instead of dragging. Commits
// via onReorder(targetPosition) — the parent does the actual move with
// arrayMove (pull out, insert at the target index), so typing "3" always
// inserts this row at position 3 and shifts everything else down by one,
// never swaps places with whatever row currently sits at #3.
function OrderCell({ editable, editing, order, totalRows, onStartEdit, onCommit, onReorder }) {
  const [draft, setDraft] = useState(String(order));

  useEffect(() => {
    if (editing) setDraft(String(order));
  }, [editing, order]);

  if (!editable) {
    return <span className="text-linear-ink-tertiary">#{order}</span>;
  }

  if (editing) {
    return (
      <EditBox
        onCommit={() => {
          const n = parseInt(draft, 10);
          if (Number.isFinite(n)) onReorder(n);
          onCommit();
        }}
      >
        <input
          type="number"
          min={1}
          max={totalRows}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.target.select()}
          className="h-9 w-14 rounded border border-linear-primary/40 bg-linear-surface-1 px-1 text-center text-sm outline-none"
        />
      </EditBox>
    );
  }

  return (
    <span
      onClick={onStartEdit}
      className="cursor-pointer text-linear-ink-tertiary hover:text-linear-primary"
      title="คลิกเพื่อย้ายไปตำแหน่งที่ต้องการ"
    >
      #{order}
    </span>
  );
}

// Plain placeholder icon — game_list/gamelist_packs has no per-game "image"
// field of its own. This used to borrow whichever pack/currency image was
// entered first for that game (see the removed listGamelistThumbnailByGame()),
// but that's not actually the game's own icon — it's just whatever image a
// staff member happened to paste onto that game's first pack/currency, so a
// row could show an unrelated, inconsistent thumbnail (a currency icon, a
// promo banner, whatever) instead of reading as "no image set".
function RowThumb() {
  return (
    <span className="flex h-9 w-9 items-center justify-center rounded bg-linear-surface-3 text-linear-ink-tertiary">
      <ImageIcon size={14} />
    </span>
  );
}

function NameCell({
  editable,
  editing,
  value,
  packCount,
  existingNames,
  onDuplicateChange,
  onStartEdit,
  onCommit,
  onChange,
}) {
  if (!editable) {
    return (
      <span className="flex h-9 min-w-0 items-center gap-2 truncate px-2 font-medium text-linear-ink">
        {value || <span className="text-linear-ink-tertiary">(ไม่มีชื่อ)</span>}
        <PackCountBadge count={packCount} />
      </span>
    );
  }
  if (editing) {
    return (
      <EditBox onCommit={onCommit}>
        <GameinfoNameInput
          value={value}
          onChange={onChange}
          existingNames={existingNames}
          onDuplicateChange={onDuplicateChange}
          className="h-9 w-full rounded border border-linear-primary/40 px-2 text-sm font-medium outline-none"
          autoFocus
        />
      </EditBox>
    );
  }
  return (
    <span
      onClick={onStartEdit}
      className="flex h-9 min-w-0 cursor-pointer items-center gap-2 truncate rounded border border-transparent px-2 font-medium text-linear-ink hover:bg-linear-surface-2"
    >
      {value || <span className="text-linear-ink-tertiary">(ไม่มีชื่อ)</span>}
      <PackCountBadge count={packCount} />
    </span>
  );
}

// (N แพ็ก) next to the name — same inline placement the old admin games-table
// used, backed now by listGamelistPackCountByGame() instead of counting a
// `currencies` tree that was already in memory. Hidden entirely at 0 rather
// than showing "(0 แพ็ก)" for every still-empty game.
function PackCountBadge({ count }) {
  if (!count) return null;
  return <span className="shrink-0 text-xs font-normal text-linear-ink-tertiary">({count} แพ็ก)</span>;
}

function TextCell({ editable, editing, value, onStartEdit, onCommit, children }) {
  if (editable && editing) return <EditBox onCommit={onCommit}>{children}</EditBox>;
  return (
    <span
      onClick={editable ? onStartEdit : undefined}
      className={`flex h-9 items-center truncate rounded border border-transparent px-2 text-linear-ink-muted ${editable ? "cursor-pointer hover:bg-linear-surface-2" : ""}`}
    >
      {value || "-"}
    </span>
  );
}

function EditBox({ onCommit, children }) {
  const ref = useRef(null);
  return (
    <div
      ref={ref}
      onBlur={(e) => {
        if (!ref.current?.contains(e.relatedTarget)) onCommit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") document.activeElement?.blur();
        if (e.key === "Escape") onCommit();
      }}
    >
      {children}
    </div>
  );
}
