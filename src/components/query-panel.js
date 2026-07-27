"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  Calculator,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Loader2,
  Maximize2,
  Minimize2,
  Pencil,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { evaluateFormula } from "@/lib/gamedb-formula";
import {
  buildDisplayColumns,
  clampColumnWidth,
  EMPTY_LAYOUT,
  formatCell,
  MAX_NATURAL_WIDTH,
  MIN_COLUMN_WIDTH,
  normalizeLayout,
  ROW_NUMBER_WIDTH,
  toNumber,
} from "@/lib/gamedb-layout";
import { ComputedColumnModal } from "@/components/gamedb-modals";

const iconButtonClass =
  "flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 transition hover:bg-zinc-50 hover:text-zinc-700 disabled:opacity-40";

export default function QueryPanel({
  query,
  panel,
  canManage,
  canMoveUp,
  canMoveDown,
  onMove,
  onClose,
  onToggleSpan,
  onToggleCollapse,
  onHeightChange,
  onResetHeight,
  onEditQuery,
}) {
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState("");

  const [layout, setLayout] = useState(EMPTY_LAYOUT);
  const [layoutDirty, setLayoutDirty] = useState(false);
  const [savingLayout, setSavingLayout] = useState(false);
  const [saveError, setSaveError] = useState("");

  const [rowFilter, setRowFilter] = useState("");
  const [computedModal, setComputedModal] = useState(false);

  // Column width comes from the saved layout when the user dragged it, and
  // otherwise from a one-time measurement of the natural (auto-layout) width.
  const [naturalWidths, setNaturalWidths] = useState({});
  const [resizing, setResizing] = useState(null);
  const headRefs = useRef({});

  const runQuery = useCallback(async () => {
    setRunning(true);
    setRunError("");
    setResult(null);
    setNaturalWidths({});
    try {
      const data = await apiJson(`/api/queries/${query.id}/run`, {
        method: "POST",
        fallbackError: "รัน Query ไม่สำเร็จ",
      });
      setResult(data);
      setLayout(normalizeLayout(data.layout));
      setLayoutDirty(false);
    } catch (err) {
      setRunError(err.message);
    } finally {
      setRunning(false);
    }
  }, [query.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setState happens after the run request resolves
    runQuery();
  }, [runQuery]);

  const displayColumns = useMemo(
    () => (result ? buildDisplayColumns(result.columns, layout) : []),
    [result, layout]
  );
  const visibleColumns = useMemo(
    () => displayColumns.filter((col) => !layout.hidden.includes(col.id)),
    [displayColumns, layout.hidden]
  );
  const hiddenColumns = useMemo(
    () => displayColumns.filter((col) => layout.hidden.includes(col.id)),
    [displayColumns, layout.hidden]
  );

  const baseNameToIndex = useMemo(() => {
    const map = new Map();
    (result?.columns || []).forEach((col, index) => {
      if (!map.has(col.name)) map.set(col.name, index);
    });
    return map;
  }, [result]);

  const displayRows = useMemo(() => {
    if (!result) return [];
    const rows = result.rows.map((row) => {
      const resolveRef = (name) => {
        const index = baseNameToIndex.get(name);
        return index === undefined ? null : toNumber(row[index]);
      };
      return visibleColumns.map((col) => {
        if (col.kind === "base") {
          const index = baseNameToIndex.get(col.column.name);
          const raw = index === undefined ? null : row[index];
          return { raw, text: formatCell(raw, col.type) };
        }
        if (!col.ast) return { raw: null, text: "สูตรผิด" };
        const value = evaluateFormula(col.ast, resolveRef);
        return { raw: value, text: value === null ? "—" : formatCell(value, "number") };
      });
    });
    const filter = rowFilter.trim().toLowerCase();
    if (!filter) return rows;
    return rows.filter((cells) =>
      cells.some((cell) => cell.text.toLowerCase().includes(filter))
    );
  }, [result, visibleColumns, baseNameToIndex, rowFilter]);

  const mutateLayout = useCallback((updater) => {
    setLayout((prev) => updater(prev));
    setLayoutDirty(true);
  }, []);

  const widthOf = useCallback(
    (colId) => layout.widths[colId] || naturalWidths[colId] || null,
    [layout.widths, naturalWidths]
  );

  const measured =
    visibleColumns.length > 0 && visibleColumns.every((col) => widthOf(col.id));

  // First paint uses auto table layout so the browser sizes each column to its
  // content; we snapshot those widths and then switch to a fixed layout, which
  // is what makes dragging a column edge behave predictably.
  useLayoutEffect(() => {
    if (!result || measured) return;
    const next = {};
    for (const col of visibleColumns) {
      if (widthOf(col.id)) continue;
      const el = headRefs.current[col.id];
      if (!el) continue;
      const width = Math.ceil(el.getBoundingClientRect().width) + 8;
      next[col.id] = Math.min(MAX_NATURAL_WIDTH, clampColumnWidth(width));
    }
    if (Object.keys(next).length === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- measuring the DOM after paint is the point here
    setNaturalWidths((prev) => ({ ...prev, ...next }));
  }, [result, measured, visibleColumns, widthOf]);

  const setColumnWidth = useCallback(
    (colId, width) => {
      mutateLayout((prev) => ({
        ...prev,
        widths: { ...prev.widths, [colId]: clampColumnWidth(width) },
      }));
    },
    [mutateLayout]
  );

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

  const startColumnResize = (event, colId) => {
    event.preventDefault();
    event.stopPropagation();
    setResizing({
      colId,
      startX: event.clientX,
      startWidth: widthOf(colId) || MIN_COLUMN_WIDTH,
    });
  };

  useEffect(() => {
    if (!resizing) return undefined;
    const move = (event) => {
      setColumnWidth(resizing.colId, resizing.startWidth + (event.clientX - resizing.startX));
    };
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

  // Panel height drag — the height itself lives in the parent so it can be
  // persisted with the rest of the workspace.
  const [heightDrag, setHeightDrag] = useState(null);

  useEffect(() => {
    if (!heightDrag) return undefined;
    const move = (event) => {
      onHeightChange(heightDrag.startHeight + (event.clientY - heightDrag.startY));
    };
    const stop = () => setHeightDrag(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "row-resize";
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [heightDrag, onHeightChange]);

  const moveColumn = (colId, direction) => {
    const ids = displayColumns.map((col) => col.id);
    const from = ids.indexOf(colId);
    const to = from + direction;
    if (from === -1 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    mutateLayout((prev) => ({ ...prev, order: ids }));
  };

  const hideColumn = (colId) => {
    mutateLayout((prev) => ({
      ...prev,
      hidden: [...new Set([...prev.hidden, colId])],
    }));
  };

  const showColumn = (colId) => {
    mutateLayout((prev) => ({
      ...prev,
      hidden: prev.hidden.filter((id) => id !== colId),
    }));
  };

  const renameColumn = (col) => {
    const next = window.prompt("ตั้งชื่อคอลัมน์ใหม่", col.label);
    if (next === null) return;
    mutateLayout((prev) => ({
      ...prev,
      labels: { ...prev.labels, [col.id]: next.trim() || col.label },
    }));
  };

  const removeComputed = (colId) => {
    const key = colId.slice(1);
    mutateLayout((prev) => ({
      ...prev,
      computed: prev.computed.filter((col) => col.key !== key),
      order: prev.order.filter((id) => id !== colId),
      hidden: prev.hidden.filter((id) => id !== colId),
      widths: Object.fromEntries(
        Object.entries(prev.widths).filter(([id]) => id !== colId)
      ),
    }));
  };

  const saveLayout = async () => {
    setSavingLayout(true);
    setSaveError("");
    try {
      const data = await apiJson(`/api/queries/${query.id}/layout`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ layout }),
        fallbackError: "บันทึก Layout ไม่สำเร็จ",
      });
      setLayout(normalizeLayout(data.layout));
      setLayoutDirty(false);
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSavingLayout(false);
    }
  };

  const resetLayout = () => {
    mutateLayout(() => ({ ...EMPTY_LAYOUT }));
    setNaturalWidths({});
  };

  return (
    <section
      className={`flex min-w-0 flex-col rounded-2xl border border-zinc-200 bg-white ${
        panel.span === 2 ? "xl:col-span-2" : ""
      }`}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 p-3">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="rounded-lg p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
          title={panel.collapsed ? "ขยายตาราง" : "ย่อตาราง"}
        >
          {panel.collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black">{query.name}</p>
          <p className="truncate text-[10px] font-semibold text-zinc-400">
            {result ? (
              <>
                {displayRows.length.toLocaleString("th-TH")} แถว
                {rowFilter.trim()
                  ? ` (กรองจาก ${result.rowCount.toLocaleString("th-TH")})`
                  : ""}
                {" · "}ใช้เวลา {result.durationMs} ms
                {" · DB: "}
                {query.connectionName || "หลัก (inblackm)"}
                {result.truncated ? " · แสดงสูงสุด 1,000 แถวแรก" : ""}
              </>
            ) : (
              query.description || "—"
            )}
          </p>
        </div>

        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={rowFilter}
            onChange={(e) => setRowFilter(e.target.value)}
            placeholder="ค้นหาในผลลัพธ์..."
            className="h-8 w-36 rounded-lg border border-zinc-200 bg-zinc-50 pl-8 pr-2 text-[11px] font-semibold outline-none focus:border-red-600 focus:bg-white"
          />
        </div>

        {layoutDirty && (
          <>
            <button
              type="button"
              onClick={saveLayout}
              disabled={savingLayout}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-red-600 px-3 text-[11px] font-black text-white transition hover:bg-red-700 disabled:opacity-50"
            >
              {savingLayout ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Save size={12} />
              )}
              บันทึก Layout
            </button>
            <button
              type="button"
              onClick={resetLayout}
              className={iconButtonClass}
              title="ล้าง layout กลับเป็นค่าเริ่มต้น"
            >
              <RotateCcw size={13} />
            </button>
          </>
        )}

        <button
          type="button"
          onClick={runQuery}
          disabled={running}
          className={iconButtonClass}
          title="รันใหม่"
        >
          <RefreshCw size={13} className={running ? "animate-spin" : ""} />
        </button>
        <button
          type="button"
          onClick={() => setComputedModal(true)}
          disabled={!result}
          className={iconButtonClass}
          title="เพิ่มคอลัมน์สูตร"
        >
          <Calculator size={13} />
        </button>
        <button
          type="button"
          onClick={onToggleSpan}
          className={iconButtonClass}
          title={panel.span === 2 ? "ย่อเหลือครึ่งจอ" : "ขยายเต็มความกว้าง"}
        >
          {panel.span === 2 ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        </button>
        <button
          type="button"
          onClick={() => onMove(-1)}
          disabled={!canMoveUp}
          className={iconButtonClass}
          title="ย้ายไปก่อนหน้า"
        >
          <ArrowLeft size={13} />
        </button>
        <button
          type="button"
          onClick={() => onMove(1)}
          disabled={!canMoveDown}
          className={iconButtonClass}
          title="ย้ายไปถัดไป"
        >
          <ArrowRight size={13} />
        </button>
        {canManage && (
          <button
            type="button"
            onClick={onEditQuery}
            className={iconButtonClass}
            title="แก้ไข Query"
          >
            <Pencil size={13} />
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 transition hover:bg-red-50 hover:text-red-600"
          title="ปิดตารางนี้"
        >
          <X size={13} />
        </button>
      </div>

      {!panel.collapsed && (
        <>
          {hiddenColumns.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 border-b border-zinc-100 px-3 py-2">
              <span className="text-[10px] font-black text-zinc-400">คอลัมน์ที่ซ่อน:</span>
              {hiddenColumns.map((col) => (
                <button
                  key={col.id}
                  type="button"
                  onClick={() => showColumn(col.id)}
                  className="flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[10px] font-bold text-zinc-500 transition hover:bg-zinc-100"
                  title="กดเพื่อแสดงคอลัมน์นี้"
                >
                  <Eye size={10} /> {col.label}
                </button>
              ))}
            </div>
          )}

          {saveError && (
            <div className="mx-3 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-bold text-red-600">
              {saveError}
            </div>
          )}

          {running ? (
            <p className="flex items-center justify-center gap-2 py-16 text-xs font-semibold text-zinc-400">
              <Loader2 size={16} className="animate-spin" /> กำลังรัน Query...
            </p>
          ) : runError ? (
            <div className="m-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-bold text-red-600">
              {runError}
            </div>
          ) : result ? (
            <>
              <div
                className="overflow-auto border-t border-zinc-100"
                style={{ height: panel.height }}
              >
                <table
                  className="border-collapse text-[11px]"
                  style={
                    measured
                      ? { tableLayout: "fixed", width: "100%", minWidth: tableMinWidth(visibleColumns, widthOf) }
                      : { tableLayout: "auto", width: "100%" }
                  }
                >
                  {measured && (
                    <colgroup>
                      <col style={{ width: ROW_NUMBER_WIDTH }} />
                      {visibleColumns.map((col) => (
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
                      {visibleColumns.map((col) => (
                        <th
                          key={col.id}
                          ref={(el) => {
                            headRefs.current[col.id] = el;
                          }}
                          className="group sticky top-0 z-10 border border-zinc-200 bg-zinc-100 px-2 py-1.5 text-left"
                        >
                          <div className="flex items-center gap-1">
                            <span
                              className={`min-w-0 flex-1 truncate font-black ${
                                col.kind === "computed" ? "text-red-600" : "text-zinc-700"
                              }`}
                              title={
                                col.kind === "computed"
                                  ? `สูตร: ${col.formula}`
                                  : col.column.name
                              }
                            >
                              {col.label}
                            </span>
                            <span className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                              <button
                                type="button"
                                onClick={() => moveColumn(col.id, -1)}
                                className="rounded p-0.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700"
                                title="เลื่อนซ้าย"
                              >
                                <ArrowLeft size={11} />
                              </button>
                              <button
                                type="button"
                                onClick={() => moveColumn(col.id, 1)}
                                className="rounded p-0.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700"
                                title="เลื่อนขวา"
                              >
                                <ArrowRight size={11} />
                              </button>
                              <button
                                type="button"
                                onClick={() => renameColumn(col)}
                                className="rounded p-0.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700"
                                title="เปลี่ยนชื่อ"
                              >
                                <Pencil size={11} />
                              </button>
                              <button
                                type="button"
                                onClick={() => hideColumn(col.id)}
                                className="rounded p-0.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700"
                                title="ซ่อนคอลัมน์"
                              >
                                <EyeOff size={11} />
                              </button>
                              {col.kind === "computed" && (
                                <button
                                  type="button"
                                  onClick={() => removeComputed(col.id)}
                                  className="rounded p-0.5 text-zinc-400 hover:bg-zinc-200 hover:text-red-600"
                                  title="ลบคอลัมน์สูตร"
                                >
                                  <Trash2 size={11} />
                                </button>
                              )}
                            </span>
                          </div>
                          <span
                            onPointerDown={(event) => startColumnResize(event, col.id)}
                            onDoubleClick={() => resetColumnWidth(col.id)}
                            className={`absolute right-0 top-0 flex h-full w-2 touch-none cursor-col-resize items-center justify-center ${
                              resizing?.colId === col.id ? "bg-red-500/30" : "hover:bg-red-500/20"
                            }`}
                            title="ลากเพื่อปรับความกว้าง · ดับเบิลคลิกเพื่อรีเซ็ต"
                          >
                            <span className="h-1/2 w-px bg-zinc-300" />
                          </span>
                        </th>
                      ))}
                      {measured && (
                        <th className="sticky top-0 z-10 border border-zinc-200 bg-zinc-100" />
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {displayRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={visibleColumns.length + (measured ? 2 : 1)}
                          className="border border-zinc-200 px-3 py-8 text-center font-semibold text-zinc-400"
                        >
                          ไม่มีข้อมูล
                        </td>
                      </tr>
                    ) : (
                      displayRows.map((cells, rowIndex) => (
                        <tr
                          key={rowIndex}
                          className="odd:bg-white even:bg-zinc-50/60 hover:bg-amber-50/60"
                        >
                          <td className="border border-zinc-200 px-2 py-1.5 text-center font-bold text-zinc-400">
                            {rowIndex + 1}
                          </td>
                          {cells.map((cell, cellIndex) => {
                            const col = visibleColumns[cellIndex];
                            const numeric =
                              col.type === "number" || col.kind === "computed";
                            return (
                              <td
                                key={col.id}
                                title={cell.text}
                                className={`truncate border border-zinc-200 px-2 py-1.5 font-semibold text-zinc-700 ${
                                  numeric ? "text-right font-mono tabular-nums" : ""
                                }`}
                              >
                                {cell.text}
                              </td>
                            );
                          })}
                          {measured && <td className="border border-zinc-200" />}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div
                onPointerDown={(event) =>
                  setHeightDrag({ startY: event.clientY, startHeight: panel.height })
                }
                onDoubleClick={onResetHeight}
                className="group flex h-3.5 shrink-0 cursor-row-resize touch-none items-center justify-center rounded-b-2xl border-t border-zinc-100 bg-zinc-50 transition hover:bg-zinc-100"
                title="ลากเพื่อปรับความสูงตาราง · ดับเบิลคลิกเพื่อรีเซ็ต"
              >
                <span className="h-0.5 w-10 rounded-full bg-zinc-300 transition group-hover:bg-red-400" />
              </div>
            </>
          ) : null}
        </>
      )}

      {computedModal && result && (
        <ComputedColumnModal
          availableNames={[...new Set(result.columns.map((col) => col.name))]}
          onClose={() => setComputedModal(false)}
          onAdd={({ label, formula }) => {
            const key = `calc_${Date.now()}`;
            mutateLayout((prev) => ({
              ...prev,
              computed: [...prev.computed, { key, label, formula }],
            }));
            setComputedModal(false);
          }}
        />
      )}
    </section>
  );
}

// Fixed layout needs a min width so shrinking the window scrolls instead of
// squeezing the columns the user sized by hand.
function tableMinWidth(visibleColumns, widthOf) {
  const total = visibleColumns.reduce((sum, col) => sum + (widthOf(col.id) || 0), 0);
  return total + ROW_NUMBER_WIDTH;
}
