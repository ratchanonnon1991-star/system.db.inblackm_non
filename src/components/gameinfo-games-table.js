"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
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
import { apiJson } from "@/lib/api-json";
import GameinfoMemoryInput from "./gameinfo-memory-input";

const GRID_COLS =
  "grid-cols-[28px_46px_60px_minmax(200px,1fr)_120px_130px_120px_170px_170px_60px_120px_190px]";

function uniq(arr) {
  return Array.from(new Set(arr.filter(Boolean))).sort((a, b) => a.localeCompare(b, "th"));
}

// Admin games list: drag-reorder + inline click-to-edit cells. Ported from
// gameinfo's GamesTable.tsx — server actions swapped for fetch() calls to
// /api/gameinfo/games*, "Lookups" history swapped for suggestions derived
// from the rows already on screen.
export default function GameinfoGamesTable({ initial, lang }) {
  const [rows, setRows] = useState(initial);
  const [editing, setEditing] = useState(null);
  const [, startTransition] = useTransition();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const suggestions = useMemo(
    () => ({
      gameNames: uniq(rows.map((r) => r.gameName)),
      regions: uniq(rows.map((r) => r.region)),
      platforms: uniq(rows.map((r) => r.platform)),
      servers: uniq(rows.map((r) => r.server)),
    }),
    [rows]
  );

  function onDragEnd(e) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = rows.findIndex((r) => r.id === active.id);
    const newIndex = rows.findIndex((r) => r.id === over.id);
    const next = arrayMove(rows, oldIndex, newIndex);
    setRows(next);
    startTransition(() => {
      apiJson("/api/gameinfo/games/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: next.map((r) => r.id) }),
      }).catch(() => {});
    });
  }

  function onDelete(id, name) {
    if (!confirm(`ลบเกม "${name}" และแพ็กทั้งหมด?`)) return;
    setRows((prev) => prev.filter((r) => r.id !== id));
    startTransition(() => {
      apiJson(`/api/gameinfo/games/${id}`, { method: "DELETE" }).catch(() => {});
    });
  }

  function saveRow(row) {
    startTransition(() => {
      apiJson(`/api/gameinfo/games/${row.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameName: row.gameName,
          region: row.region,
          platform: row.platform,
          server: row.server,
          vpn: row.vpn,
          webTopup: row.webTopup,
        }),
      }).catch(() => {});
    });
  }

  function updateField(rowId, field, value) {
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, [field]: value } : r)));
    const current = rows.find((r) => r.id === rowId);
    if (current) saveRow({ ...current, [field]: value });
  }

  async function addNewRow() {
    const defaults = {
      gameName: "เกมใหม่",
      region: "",
      platform: "",
      server: "",
      vpn: "NO",
      webTopup: "",
      image: "",
    };
    const { game } = await apiJson("/api/gameinfo/games", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(defaults),
    });
    setRows((prev) => [
      ...prev,
      { ...defaults, id: game.id, packCount: 0, mainChannels: [], secondaryChannels: [] },
    ]);
    setEditing({ id: game.id, field: "gameName" });
  }

  return (
    <>
      <div className="scroll-x rounded-lg border border-slate-200 bg-white">
        <div className="min-w-[1500px]">
          <div
            className={`grid ${GRID_COLS} gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500`}
          >
            <span></span>
            <span>ID</span>
            <span>ลำดับ</span>
            <span className="px-2">ชื่อเกม</span>
            <span className="px-2">Region</span>
            <span className="px-2">Platform</span>
            <span className="px-2">Server</span>
            <span>ช่องทางหลัก</span>
            <span>ช่องทางรอง</span>
            <span>VPN</span>
            <span className="px-2">Web Topup</span>
            <span className="text-right">จัดการ</span>
          </div>

          {rows.length === 0 ? (
            <p className="p-6 text-sm text-slate-400">ยังไม่มีเกม — กด + ด้านล่างเพื่อเพิ่มเกมแรก</p>
          ) : (
            <DndContext
              id="gameinfo-games-dnd"
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={onDragEnd}
            >
              <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
                {rows.map((row, i) => (
                  <SortableRow
                    key={row.id}
                    row={row}
                    order={i + 1}
                    lang={lang}
                    suggestions={suggestions}
                    editing={editing}
                    setEditing={setEditing}
                    updateField={updateField}
                    onDelete={onDelete}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}

          <button
            type="button"
            onClick={addNewRow}
            className="flex w-full items-center gap-2 border-b border-slate-100 px-3 py-3 text-sm text-slate-400 hover:bg-slate-50 hover:text-indigo-600"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 text-base leading-none">
              +
            </span>
            เพิ่มเกม
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={addNewRow}
        className="fixed bottom-6 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm text-slate-600 shadow-lg hover:border-indigo-300 hover:text-indigo-600"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 text-base leading-none">
          +
        </span>
        เพิ่มเกม
      </button>
    </>
  );
}

function SortableRow({ row, order, lang, suggestions, editing, setEditing, updateField, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  const isEditing = (field) => editing?.id === row.id && editing.field === field;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`grid ${GRID_COLS} items-center gap-2 border-b border-slate-100 px-3 py-2 text-sm last:border-b-0`}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab text-slate-400 hover:text-slate-600 active:cursor-grabbing"
        aria-label="ลากเพื่อจัดลำดับ"
        title="ลากเพื่อจัดลำดับ"
      >
        ⠿
      </button>
      <span className="text-slate-400">{row.id}</span>
      <span className="text-slate-400">#{order}</span>

      <div className="flex min-w-0 items-center gap-2">
        {isEditing("gameName") ? (
          <EditBox onCommit={() => setEditing(null)}>
            <GameinfoMemoryInput
              value={row.gameName}
              onChange={(v) => updateField(row.id, "gameName", v)}
              suggestions={suggestions.gameNames}
              className="h-9 w-full min-w-[140px] rounded border border-indigo-300 px-2 text-sm outline-none"
              autoFocus
            />
          </EditBox>
        ) : (
          <span
            onClick={() => setEditing({ id: row.id, field: "gameName" })}
            className="flex h-9 min-w-0 flex-1 cursor-pointer items-center truncate rounded border border-transparent px-2 font-medium text-slate-800 hover:bg-slate-50"
          >
            {row.gameName || <span className="text-slate-300">(ไม่มีชื่อ)</span>}
          </span>
        )}
        <span className="shrink-0 text-xs text-slate-400">({row.packCount} แพ็ก)</span>
      </div>

      <TextCell
        editing={isEditing("region")}
        value={row.region}
        onStartEdit={() => setEditing({ id: row.id, field: "region" })}
        onCommit={() => setEditing(null)}
      >
        <GameinfoMemoryInput
          value={row.region}
          onChange={(v) => updateField(row.id, "region", v)}
          suggestions={suggestions.regions}
          className="h-9 w-full rounded border border-indigo-300 px-2 text-sm outline-none"
          autoFocus
        />
      </TextCell>

      <TextCell
        editing={isEditing("platform")}
        value={row.platform}
        onStartEdit={() => setEditing({ id: row.id, field: "platform" })}
        onCommit={() => setEditing(null)}
      >
        <GameinfoMemoryInput
          value={row.platform}
          onChange={(v) => updateField(row.id, "platform", v)}
          suggestions={suggestions.platforms}
          className="h-9 w-full rounded border border-indigo-300 px-2 text-sm outline-none"
          autoFocus
        />
      </TextCell>

      <TextCell
        editing={isEditing("server")}
        value={row.server}
        onStartEdit={() => setEditing({ id: row.id, field: "server" })}
        onCommit={() => setEditing(null)}
      >
        <GameinfoMemoryInput
          value={row.server}
          onChange={(v) => updateField(row.id, "server", v)}
          suggestions={suggestions.servers}
          className="h-9 w-full rounded border border-indigo-300 px-2 text-sm outline-none"
          autoFocus
        />
      </TextCell>

      <ChannelTags values={row.mainChannels} />
      <ChannelTags values={row.secondaryChannels} />

      <div className="flex gap-1">
        {["NO", "YES"].map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => updateField(row.id, "vpn", v)}
            className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
              row.vpn === v
                ? v === "YES"
                  ? "bg-rose-100 text-rose-700"
                  : "bg-emerald-100 text-emerald-700"
                : "bg-slate-100 text-slate-400"
            }`}
          >
            {v}
          </button>
        ))}
      </div>

      {isEditing("webTopup") ? (
        <EditBox onCommit={() => setEditing(null)}>
          <input
            autoFocus
            value={row.webTopup}
            onChange={(e) => updateField(row.id, "webTopup", e.target.value)}
            placeholder="https://..."
            className="h-9 w-full rounded border border-indigo-300 px-2 text-sm outline-none"
          />
        </EditBox>
      ) : (
        <span
          onClick={() => setEditing({ id: row.id, field: "webTopup" })}
          className="flex h-9 cursor-pointer items-center truncate rounded border border-transparent px-2 hover:bg-slate-50"
        >
          {row.webTopup ? (
            <span className="text-xs text-indigo-600">เว็บ ↗</span>
          ) : (
            <span className="text-xs text-slate-300">-</span>
          )}
        </span>
      )}

      <span className="flex justify-end gap-2 text-xs">
        <Link
          href={`/gameinfo/${lang}/admin/${row.id}/edit`}
          className="rounded bg-slate-50 px-2 py-1 text-slate-700 hover:bg-slate-100"
        >
          แก้ไข
        </Link>
        <Link
          href={`/gameinfo/${lang}/admin/${row.id}/packs`}
          className="rounded bg-indigo-50 px-2 py-1 text-indigo-700 hover:bg-indigo-100"
        >
          แพ็ก
        </Link>
        <button
          onClick={() => onDelete(row.id, row.gameName)}
          className="rounded bg-red-50 px-2 py-1 text-red-600 hover:bg-red-100"
        >
          ลบ
        </button>
      </span>
    </div>
  );
}

function ChannelTags({ values }) {
  if (values.length === 0) return <span className="text-xs text-slate-300">-</span>;
  return (
    <div className="flex flex-wrap gap-1" title={values.join(", ")}>
      {values.map((v) => (
        <span
          key={v}
          className="truncate rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600"
        >
          {v}
        </span>
      ))}
    </div>
  );
}

function TextCell({ editing, value, onStartEdit, onCommit, children }) {
  if (editing) return <EditBox onCommit={onCommit}>{children}</EditBox>;
  return (
    <span
      onClick={onStartEdit}
      className="flex h-9 cursor-pointer items-center truncate rounded border border-transparent px-2 text-slate-600 hover:bg-slate-50"
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
