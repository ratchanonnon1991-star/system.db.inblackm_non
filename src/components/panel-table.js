"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  EyeOff,
  Pencil,
  Sigma,
  Trash2,
} from "lucide-react";
import {
  clampColumnWidth,
  formatCell,
  MAX_NATURAL_WIDTH,
  MIN_COLUMN_WIDTH,
  ROW_NUMBER_WIDTH,
  ruleMatches,
  SUMMARY_KINDS,
  SUMMARY_LABELS,
  summarize,
  TONE_CELL_CLASS,
  toNumber,
} from "@/lib/gamedb-layout";

const headerButton =
  "rounded p-0.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700";

// Only base columns carry `column`; computed, merged and compare columns each
// describe themselves differently.
function columnTooltip(col) {
  if (col.kind === "computed") return `สูตร: ${col.formula} — กดเพื่อเรียงลำดับ`;
  if (col.kind === "merged") return `ดึงมาจากคอลัมน์ ${col.source} ของอีก Query — กดเพื่อเรียงลำดับ`;
  if (col.kind === "compare") {
    return `เทียบค่า ${col.pair.left} กับ ${col.pair.right} ของอีก Query — กดเพื่อเรียงลำดับ`;
  }
  return `${col.column.name} — กดเพื่อเรียงลำดับ`;
}

const HEADER_TONE = {
  computed: "text-red-600",
  merged: "text-sky-700",
  compare: "text-sky-700",
  base: "text-zinc-700",
};

export default function PanelTable({
  columns,
  allColumns,
  rows,
  layout,
  mutateLayout,
  height,
  canEdit,
  editableColumns,
  editPending,
  onEditCell,
  changedKeys,
}) {
  const [naturalWidths, setNaturalWidths] = useState({});
  const [resizing, setResizing] = useState(null);
  const [editingCell, setEditingCell] = useState(null);
  const headRefs = useRef({});

  const widthOf = useCallback(
    (colId) => layout.widths[colId] || naturalWidths[colId] || null,
    [layout.widths, naturalWidths]
  );

  const measured = columns.length > 0 && columns.every((col) => widthOf(col.id));

  // First paint uses auto table layout so the browser sizes each column to its
  // content; we snapshot those widths and then switch to a fixed layout, which
  // is what makes dragging a column edge behave predictably.
  useLayoutEffect(() => {
    if (measured) return;
    const next = {};
    for (const col of columns) {
      if (widthOf(col.id)) continue;
      const el = headRefs.current[col.id];
      if (!el) continue;
      const width = Math.ceil(el.getBoundingClientRect().width) + 8;
      next[col.id] = Math.min(MAX_NATURAL_WIDTH, clampColumnWidth(width));
    }
    if (Object.keys(next).length === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- measuring the DOM after paint is the point here
    setNaturalWidths((prev) => ({ ...prev, ...next }));
  }, [measured, columns, widthOf]);

  const setColumnWidth = useCallback(
    (colId, width) => {
      mutateLayout((prev) => ({
        ...prev,
        widths: { ...prev.widths, [colId]: clampColumnWidth(width) },
      }));
    },
    [mutateLayout]
  );

  useEffect(() => {
    if (!resizing) return undefined;
    const move = (event) =>
      setColumnWidth(resizing.colId, resizing.startWidth + (event.clientX - resizing.startX));
    const stop = () => setResizing(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [resizing, setColumnWidth]);

  const resetColumnWidth = (colId) => {
    mutateLayout((prev) => {
      const widths = { ...prev.widths };
      delete widths[colId];
      return { ...prev, widths };
    });
    setNaturalWidths((prev) => {
      const next = { ...prev };
      delete next[colId];
      return next;
    });
  };

  const moveColumn = (colId, direction) => {
    const ids = allColumns.map((col) => col.id);
    const from = ids.indexOf(colId);
    const to = from + direction;
    if (from === -1 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    mutateLayout((prev) => ({ ...prev, order: ids }));
  };

  const renameColumn = (col) => {
    const next = window.prompt("ตั้งชื่อคอลัมน์ใหม่", col.label);
    if (next === null) return;
    mutateLayout((prev) => ({
      ...prev,
      labels: { ...prev.labels, [col.id]: next.trim() || col.label },
    }));
  };

  const toggleSort = (colId) => {
    mutateLayout((prev) => {
      const current = prev.sort;
      if (!current || current.colId !== colId) return { ...prev, sort: { colId, dir: "asc" } };
      if (current.dir === "asc") return { ...prev, sort: { colId, dir: "desc" } };
      return { ...prev, sort: null };
    });
  };

  const cycleSummary = (colId) => {
    mutateLayout((prev) => {
      const current = prev.summary[colId];
      const index = SUMMARY_KINDS.indexOf(current);
      const next = index === -1 ? SUMMARY_KINDS[0] : SUMMARY_KINDS[index + 1];
      const summary = { ...prev.summary };
      if (next) summary[colId] = next;
      else delete summary[colId];
      return { ...prev, summary };
    });
  };

  // Rules and bar maxima are per column, so resolve them once per render
  // instead of inside the cell loop.
  const columnStyling = useMemo(() => {
    return columns.map((col, index) => {
      const rules = layout.rules.filter((rule) => rule.colId === col.id);
      const barRule = rules.find((rule) => rule.tone === "bar");
      let barMax = 0;
      if (barRule) {
        for (const row of rows) {
          const value = toNumber(row.cells[index]?.raw);
          if (value !== null) barMax = Math.max(barMax, Math.abs(value));
        }
      }
      return { rules, barMax };
    });
  }, [columns, layout.rules, rows]);

  const summaryValues = useMemo(() => {
    if (!Object.keys(layout.summary).length) return null;
    return columns.map((col, index) => {
      const kind = layout.summary[col.id];
      if (!kind) return null;
      const value = summarize(kind, rows.map((row) => row.cells[index]?.raw));
      return { kind, value };
    });
  }, [columns, layout.summary, rows]);

  const startEdit = (row, col, colIndex) => {
    if (!canEdit || col.kind !== "base" || !editableColumns.includes(col.column.name)) return;
    setEditingCell({
      sourceIndex: row.sourceIndex,
      colId: col.id,
      colIndex,
      value: row.cells[colIndex]?.raw ?? "",
    });
  };

  const commitEdit = async () => {
    if (!editingCell) return;
    const pending = editingCell;
    setEditingCell(null);
    await onEditCell(pending);
  };

  return (
    <div className="overflow-auto border-t border-zinc-100" style={{ height }}>
      <table
        className="border-collapse text-[11px]"
        style={
          measured
            ? {
                tableLayout: "fixed",
                width: "100%",
                minWidth:
                  columns.reduce((sum, col) => sum + (widthOf(col.id) || 0), 0) +
                  ROW_NUMBER_WIDTH,
              }
            : { tableLayout: "auto", width: "100%" }
        }
      >
        {measured && (
          <colgroup>
            <col style={{ width: ROW_NUMBER_WIDTH }} />
            {columns.map((col) => (
              <col key={col.id} style={{ width: widthOf(col.id) }} />
            ))}
            <col />
          </colgroup>
        )}
        <thead>
          <tr className="bg-zinc-100">
            <th className="sticky top-0 z-10 border border-zinc-200 bg-zinc-100 px-2 py-2 text-center font-black text-zinc-400">
              #
            </th>
            {columns.map((col) => {
              const sorted = layout.sort?.colId === col.id ? layout.sort.dir : null;
              const summaryKind = layout.summary[col.id];
              return (
                <th
                  key={col.id}
                  ref={(el) => {
                    headRefs.current[col.id] = el;
                  }}
                  className="group sticky top-0 z-10 border border-zinc-200 bg-zinc-100 px-2 py-1.5 text-left"
                >
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => toggleSort(col.id)}
                      className={`flex min-w-0 flex-1 items-center gap-1 truncate text-left font-black ${
                        HEADER_TONE[col.kind] || "text-zinc-700"
                      }`}
                      title={columnTooltip(col)}
                    >
                      <span className="min-w-0 truncate">{col.label}</span>
                      {sorted === "asc" && <ArrowUp size={10} className="shrink-0" />}
                      {sorted === "desc" && <ArrowDown size={10} className="shrink-0" />}
                      {summaryKind && (
                        <span className="shrink-0 rounded bg-zinc-200 px-1 text-[8px] font-black text-zinc-500">
                          {SUMMARY_LABELS[summaryKind]}
                        </span>
                      )}
                    </button>
                    <span className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                      <button type="button" onClick={() => moveColumn(col.id, -1)} className={headerButton} title="เลื่อนซ้าย">
                        <ArrowLeft size={11} />
                      </button>
                      <button type="button" onClick={() => moveColumn(col.id, 1)} className={headerButton} title="เลื่อนขวา">
                        <ArrowRight size={11} />
                      </button>
                      <button type="button" onClick={() => cycleSummary(col.id)} className={headerButton} title="สรุปท้ายตาราง (รวม → เฉลี่ย → ต่ำสุด → สูงสุด → นับ → ปิด)">
                        <Sigma size={11} />
                      </button>
                      <button type="button" onClick={() => renameColumn(col)} className={headerButton} title="เปลี่ยนชื่อ">
                        <Pencil size={11} />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          mutateLayout((prev) => ({
                            ...prev,
                            hidden: [...new Set([...prev.hidden, col.id])],
                          }))
                        }
                        className={headerButton}
                        title="ซ่อนคอลัมน์"
                      >
                        <EyeOff size={11} />
                      </button>
                      {col.kind === "computed" && (
                        <button
                          type="button"
                          onClick={() =>
                            mutateLayout((prev) => ({
                              ...prev,
                              computed: prev.computed.filter((item) => `#${item.key}` !== col.id),
                              order: prev.order.filter((id) => id !== col.id),
                              hidden: prev.hidden.filter((id) => id !== col.id),
                            }))
                          }
                          className="rounded p-0.5 text-zinc-400 hover:bg-zinc-200 hover:text-red-600"
                          title="ลบคอลัมน์สูตร"
                        >
                          <Trash2 size={11} />
                        </button>
                      )}
                    </span>
                  </div>
                  <span
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setResizing({
                        colId: col.id,
                        startX: event.clientX,
                        startWidth: widthOf(col.id) || MIN_COLUMN_WIDTH,
                      });
                    }}
                    onDoubleClick={() => resetColumnWidth(col.id)}
                    className={`absolute right-0 top-0 flex h-full w-2 touch-none cursor-col-resize items-center justify-center ${
                      resizing?.colId === col.id ? "bg-red-500/30" : "hover:bg-red-500/20"
                    }`}
                    title="ลากเพื่อปรับความกว้าง · ดับเบิลคลิกเพื่อรีเซ็ต"
                  >
                    <span className="h-1/2 w-px bg-zinc-300" />
                  </span>
                </th>
              );
            })}
            {measured && <th className="sticky top-0 z-10 border border-zinc-200 bg-zinc-100" />}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length + (measured ? 2 : 1)}
                className="border border-zinc-200 px-3 py-8 text-center font-semibold text-zinc-400"
              >
                ไม่มีข้อมูล
              </td>
            </tr>
          ) : (
            rows.map((row, rowIndex) => (
              <tr key={row.sourceIndex} className="odd:bg-white even:bg-zinc-50/60 hover:bg-amber-50/60">
                <td className="border border-zinc-200 px-2 py-1.5 text-center font-bold text-zinc-400">
                  {rowIndex + 1}
                </td>
                {row.cells.map((cell, cellIndex) => {
                  const col = columns[cellIndex];
                  const numeric = col.type === "number" || col.kind === "computed";
                  const styling = columnStyling[cellIndex];
                  const tone = styling.rules.find(
                    (rule) => rule.tone !== "bar" && ruleMatches(rule, cell.raw, cell.text)
                  );
                  const barRule = styling.rules.find(
                    (rule) => rule.tone === "bar" && ruleMatches(rule, cell.raw, cell.text)
                  );
                  const barPercent =
                    barRule && styling.barMax
                      ? Math.min(100, (Math.abs(toNumber(cell.raw) ?? 0) / styling.barMax) * 100)
                      : 0;
                  const editing =
                    editingCell &&
                    editingCell.sourceIndex === row.sourceIndex &&
                    editingCell.colId === col.id;
                  const editable =
                    canEdit && col.kind === "base" && editableColumns.includes(col.column.name);
                  const changed = changedKeys.has(`${row.sourceIndex}:${col.id}`);
                  const saving =
                    editPending &&
                    editPending.sourceIndex === row.sourceIndex &&
                    editPending.colId === col.id;

                  return (
                    <td
                      key={col.id}
                      title={editable ? `${cell.text} — ดับเบิลคลิกเพื่อแก้ไข` : cell.text}
                      onDoubleClick={() => startEdit(row, col, cellIndex)}
                      className={`relative truncate border border-zinc-200 px-2 py-1.5 font-semibold ${
                        numeric ? "text-right font-mono tabular-nums" : ""
                      } ${tone ? TONE_CELL_CLASS[tone.tone] : "text-zinc-700"} ${
                        changed ? "bg-yellow-100" : ""
                      } ${editable ? "cursor-cell" : ""} ${saving ? "opacity-50" : ""}`}
                      style={
                        barPercent
                          ? {
                              backgroundImage: `linear-gradient(to right, rgba(220,38,38,0.18) ${barPercent}%, transparent ${barPercent}%)`,
                            }
                          : undefined
                      }
                    >
                      {editing ? (
                        <input
                          autoFocus
                          value={editingCell.value ?? ""}
                          onChange={(e) =>
                            setEditingCell((prev) => ({ ...prev, value: e.target.value }))
                          }
                          onBlur={commitEdit}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitEdit();
                            if (e.key === "Escape") setEditingCell(null);
                          }}
                          className="w-full rounded border border-red-500 bg-white px-1 py-0.5 text-[11px] font-semibold outline-none"
                        />
                      ) : (
                        cell.text
                      )}
                    </td>
                  );
                })}
                {measured && <td className="border border-zinc-200" />}
              </tr>
            ))
          )}
        </tbody>
        {summaryValues && (
          <tfoot>
            <tr className="bg-zinc-100 font-black">
              <td className="border border-zinc-200 px-2 py-1.5 text-center text-zinc-400">Σ</td>
              {summaryValues.map((entry, index) => (
                <td
                  key={columns[index].id}
                  className={`border border-zinc-200 px-2 py-1.5 text-zinc-700 ${
                    columns[index].type === "number" || columns[index].kind === "computed"
                      ? "text-right font-mono tabular-nums"
                      : ""
                  }`}
                >
                  {entry ? (
                    <span title={`${SUMMARY_LABELS[entry.kind]} ของ ${columns[index].label}`}>
                      {entry.value === null ? "—" : formatCell(entry.value, "number")}
                    </span>
                  ) : null}
                </td>
              ))}
              {measured && <td className="border border-zinc-200" />}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
