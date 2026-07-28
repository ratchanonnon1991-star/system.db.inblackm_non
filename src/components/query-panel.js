"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Calculator,
  ChartColumn,
  ChevronDown,
  Combine,
  ChevronUp,
  Download,
  Eye,
  GripVertical,
  Loader2,
  Maximize2,
  Minimize2,
  Palette,
  Pencil,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  SlidersHorizontal,
  Table2,
  Timer,
  User,
  Users,
  X,
} from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { evaluateFormula } from "@/lib/gamedb-formula";
import { extractSqlParams } from "@/lib/gamedb-sql-params";
import {
  buildDisplayColumns,
  cellsEqual,
  compareCells,
  EMPTY_LAYOUT,
  formatCell,
  mergeKeyOf,
  normalizeLayout,
  REFRESH_CHOICES,
  rowsToCsv,
  toNumber,
} from "@/lib/gamedb-layout";
import { ComputedColumnModal } from "@/components/gamedb-modals";
import {
  ChartModal,
  EditableSettingsModal,
  MergeModal,
  ParamsSettingsModal,
  RulesModal,
} from "@/components/panel-config-modals";
import PanelTable from "@/components/panel-table";
import PanelChart from "@/components/panel-chart";

const iconButtonClass =
  "flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 transition hover:bg-zinc-50 hover:text-zinc-700 disabled:opacity-40";

const RESIZE_HINT = "ลากเพื่อปรับขนาด · ดับเบิลคลิกเพื่อรีเซ็ต";

// Edges first, corners last: same z-index, so the corners win the hit test
// where they overlap. The bottom edge is the visible grip bar in the panel
// body, so it is not repeated here.
const FRAME_HANDLES = [
  { key: "w", dirX: -1, dirY: 0, className: "left-0 top-0 h-full w-1.5 hover:bg-red-500/20", title: RESIZE_HINT },
  { key: "e", dirX: 1, dirY: 0, className: "right-0 top-0 h-full w-1.5 hover:bg-red-500/20", title: RESIZE_HINT },
  { key: "n", dirX: 0, dirY: -1, className: "left-0 top-0 h-1.5 w-full hover:bg-red-500/20", title: RESIZE_HINT },
  { key: "nw", dirX: -1, dirY: -1, className: "left-0 top-0 h-4 w-4", title: RESIZE_HINT },
  { key: "ne", dirX: 1, dirY: -1, className: "right-0 top-0 h-4 w-4", title: RESIZE_HINT },
  { key: "sw", dirX: -1, dirY: 1, className: "bottom-0 left-0 h-4 w-4", title: RESIZE_HINT },
  { key: "se", dirX: 1, dirY: 1, className: "bottom-0 right-0 h-4 w-4", title: RESIZE_HINT },
];

function frameCursor(dirX, dirY) {
  if (!dirY) return "col-resize";
  if (!dirX) return "row-resize";
  return dirX === dirY ? "nwse-resize" : "nesw-resize";
}

function initialParamValues(params) {
  const values = {};
  for (const param of params) values[param.name] = param.defaultValue ?? "";
  return values;
}

// A :placeholder that nobody has configured yet still gets an input, so a query
// with parameters is usable the moment it is written.
function resolveParams(layout, sqlText) {
  const detected = extractSqlParams(sqlText);
  const configured = new Map(layout.params.map((param) => [param.name, param]));
  return detected.map(
    (name) =>
      configured.get(name) || {
        name,
        label: name,
        type: "text",
        defaultValue: "",
        options: [],
      }
  );
}

export default function QueryPanel({
  query,
  queries,
  panel,
  layoutOverride,
  personalLayout,
  onPersonalLayoutSaved,
  onLayoutChange,
  canManage,
  canMoveUp,
  canMoveDown,
  isFullWidth,
  draggingQueryId,
  onMove,
  onClose,
  onToggleFullWidth,
  onToggleCollapse,
  onHeightChange,
  onResetHeight,
  onWidthChange,
  onResetWidth,
  onDragStart,
  onDragEnd,
  onDropPanel,
  onEditQuery,
}) {
  // Layout precedence: what this user saved for themselves, then what a screen
  // template dictates, then the shared layout stored on the query.
  const savedLayout = useMemo(
    () => normalizeLayout(personalLayout || layoutOverride || query.layout),
    [personalLayout, layoutOverride, query.layout]
  );
  const hasOverride = Boolean(personalLayout || layoutOverride);
  const savedParams = useMemo(
    () => resolveParams(savedLayout, query.sqlText),
    [savedLayout, query.sqlText]
  );

  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const rowsLoadedRef = useRef(0);
  const [runError, setRunError] = useState("");
  const [lastRunAt, setLastRunAt] = useState(null);

  const [layout, setLayout] = useState(savedLayout);
  const [layoutDirty, setLayoutDirty] = useState(false);
  const [savingLayout, setSavingLayout] = useState(false);
  const [saveError, setSaveError] = useState("");
  const layoutDirtyRef = useRef(false);

  const [paramValues, setParamValues] = useState(() => initialParamValues(savedParams));
  const [rowFilter, setRowFilter] = useState("");
  const [view, setView] = useState("table");
  const [modal, setModal] = useState(null);
  const [changedKeys, setChangedKeys] = useState(new Set());
  const [editPending, setEditPending] = useState(null);
  const [editError, setEditError] = useState("");

  const effectiveParams = useMemo(
    () => resolveParams(layout, query.sqlText),
    [layout, query.sqlText]
  );
  const missingParams = useMemo(
    () =>
      effectiveParams
        .filter((param) => !String(paramValues[param.name] ?? "").trim())
        .map((param) => param.label || param.name),
    [effectiveParams, paramValues]
  );

  // runQuery must not be rebuilt whenever a parameter input changes, or the
  // effect below would re-run the query on every keystroke.
  const paramsRef = useRef(paramValues);
  const missingRef = useRef(missingParams);
  // Snapshot of the rows the panel is currently showing, used to highlight what
  // an auto-refresh changed.
  const previousRowsRef = useRef(null);
  const overrideRef = useRef(hasOverride);
  useEffect(() => {
    overrideRef.current = hasOverride;
  }, [hasOverride]);

  // Hand the live layout up so "save this screen as a template" can capture
  // what each panel actually looks like right now.
  useEffect(() => {
    onLayoutChange?.(query.id, layout);
  }, [onLayoutChange, query.id, layout]);
  useEffect(() => {
    paramsRef.current = paramValues;
    missingRef.current = missingParams;
  }, [paramValues, missingParams]);

  const runQuery = useCallback(
    async ({ silent = false, append = false } = {}) => {
      // Nothing to send yet — show the inputs instead of a failed request.
      if (missingRef.current.length > 0) {
        setRunning(false);
        setRefreshing(false);
        setRunError("");
        return;
      }
      if (append) setLoadingMore(true);
      else if (silent) setRefreshing(true);
      else setRunning(true);
      setRunError("");
      if (!silent && !append) setResult(null);
      try {
        const data = await apiJson(`/api/queries/${query.id}/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            params: paramsRef.current,
            offset: append ? rowsLoadedRef.current : 0,
          }),
          fallbackError: "รัน Query ไม่สำเร็จ",
        });

        // "โหลดเพิ่ม" keeps what is on screen and adds the next page under it.
        if (append) {
          setResult((prev) =>
            prev
              ? {
                  ...data,
                  rows: [...prev.rows, ...data.rows],
                  rowCount: prev.rows.length + data.rows.length,
                }
              : data
          );
          rowsLoadedRef.current += data.rows.length;
          previousRowsRef.current = null;
          setLastRunAt(new Date());
          return;
        }
        // Diff against the previous rows before storing the new ones. This has
        // to happen outside setResult: a state updater runs during render, so a
        // setChangedKeys call in there is dropped.
        const previous = previousRowsRef.current;
        if (
          previous &&
          previous.columns.length === data.columns.length &&
          previous.rows.length === data.rows.length
        ) {
          const keys = new Set();
          data.rows.forEach((row, rowIndex) => {
            row.forEach((value, colIndex) => {
              if (String(previous.rows[rowIndex][colIndex]) !== String(value)) {
                keys.add(`${rowIndex}:${data.columns[colIndex].name}`);
              }
            });
          });
          if (keys.size) setChangedKeys(keys);
        }
        previousRowsRef.current = { columns: data.columns, rows: data.rows };
        rowsLoadedRef.current = data.rows.length;
        setResult(data);
        if (!layoutDirtyRef.current && !overrideRef.current) {
          setLayout(normalizeLayout(data.layout));
        }
        setLastRunAt(new Date());
      } catch (err) {
        setRunError(err.message);
      } finally {
        setRunning(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [query.id]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setState happens after the run request resolves
    runQuery();
  }, [runQuery]);

  // Auto-refresh. Paused while the tab is hidden so a wall of panels does not
  // keep hammering the database in the background.
  useEffect(() => {
    if (!layout.refreshSeconds) return undefined;
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      runQuery({ silent: true });
    }, layout.refreshSeconds * 1000);
    return () => clearInterval(timer);
  }, [layout.refreshSeconds, runQuery]);

  useEffect(() => {
    if (changedKeys.size === 0) return undefined;
    const timer = setTimeout(() => setChangedKeys(new Set()), 8000);
    return () => clearTimeout(timer);
  }, [changedKeys]);

  const mutateLayout = useCallback((updater) => {
    setLayout((prev) => updater(prev));
    layoutDirtyRef.current = true;
    setLayoutDirty(true);
  }, []);

  // --- merge with another query -------------------------------------------
  const [mergeResult, setMergeResult] = useState(null);
  const [mergeError, setMergeError] = useState("");

  const mergeQueryId = layout.merge?.queryId ?? null;
  const mergedQueryName = useMemo(
    () => queries.find((item) => item.id === mergeQueryId)?.name || "",
    [queries, mergeQueryId]
  );

  useEffect(() => {
    if (!mergeQueryId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing state this effect owns when the merge is switched off
      setMergeResult(null);
      setMergeError("");
      return undefined;
    }
    let cancelled = false;
    apiJson(`/api/queries/${mergeQueryId}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ params: {} }),
      fallbackError: "ดึงข้อมูลของ Query ที่รวมไว้ไม่สำเร็จ",
    })
      .then((data) => {
        if (cancelled) return;
        setMergeResult(data);
        setMergeError("");
      })
      .catch((err) => {
        if (cancelled) return;
        setMergeResult(null);
        setMergeError(err.message);
      });
    return () => {
      cancelled = true;
    };
    // Re-run alongside this panel so a refresh pulls both sides.
  }, [mergeQueryId, lastRunAt]);

  // One lookup for the whole render: join key -> matching row of the other query.
  const mergeIndex = useMemo(() => {
    if (!layout.merge || !mergeResult) return null;
    const nameToIndex = new Map(mergeResult.columns.map((col, index) => [col.name, index]));
    const rightKeyIndexes = layout.merge.on.map((pair) => nameToIndex.get(pair.right));
    if (rightKeyIndexes.some((index) => index === undefined)) return null;

    const byKey = new Map();
    let duplicates = 0;
    for (const row of mergeResult.rows) {
      const key = mergeKeyOf(rightKeyIndexes.map((index) => row[index]));
      if (byKey.has(key)) duplicates += 1;
      else byKey.set(key, row);
    }
    return { byKey, nameToIndex, duplicates };
  }, [layout.merge, mergeResult]);

  const mergedColumns = useMemo(() => {
    if (!layout.merge || !mergeIndex) return [];
    const suffix = mergedQueryName ? ` · ${mergedQueryName}` : "";
    const brought = layout.merge.columns
      .filter((name) => mergeIndex.nameToIndex.has(name))
      .map((name) => ({
        id: `~${name}`,
        label: `${name}${suffix}`,
        type: mergeResult.columns[mergeIndex.nameToIndex.get(name)].type,
        kind: "merged",
        source: name,
      }));
    const checks = layout.merge.compare
      .filter((pair) => mergeIndex.nameToIndex.has(pair.right))
      .map((pair) => ({
        id: `?${pair.left}|${pair.right}`,
        label: `${pair.left} = ${pair.right}?`,
        type: "text",
        kind: "compare",
        pair,
      }));
    return [...brought, ...checks];
  }, [layout.merge, mergeIndex, mergeResult, mergedQueryName]);

  const displayColumns = useMemo(
    () => (result ? buildDisplayColumns(result.columns, layout, mergedColumns) : []),
    [result, layout, mergedColumns]
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
    const leftKeyIndexes = layout.merge
      ? layout.merge.on.map((pair) => baseNameToIndex.get(pair.left))
      : null;
    const canMerge =
      mergeIndex && leftKeyIndexes && leftKeyIndexes.every((index) => index !== undefined);

    let rows = result.rows.map((row, sourceIndex) => {
      const resolveRef = (name) => {
        const index = baseNameToIndex.get(name);
        return index === undefined ? null : toNumber(row[index]);
      };
      const partner = canMerge
        ? mergeIndex.byKey.get(mergeKeyOf(leftKeyIndexes.map((index) => row[index])))
        : null;

      return {
        sourceIndex,
        matched: canMerge ? Boolean(partner) : null,
        cells: visibleColumns.map((col) => {
          if (col.kind === "base") {
            const index = baseNameToIndex.get(col.column.name);
            const raw = index === undefined ? null : row[index];
            return { raw, text: formatCell(raw, col.type) };
          }
          if (col.kind === "merged") {
            const raw = partner ? partner[mergeIndex.nameToIndex.get(col.source)] : null;
            return { raw, text: partner ? formatCell(raw, col.type) : "ไม่พบคู่" };
          }
          if (col.kind === "compare") {
            if (!partner) return { raw: null, text: "ไม่พบคู่" };
            const left = row[baseNameToIndex.get(col.pair.left)];
            const right = partner[mergeIndex.nameToIndex.get(col.pair.right)];
            const same = cellsEqual(left, right);
            return { raw: same ? 1 : 0, text: same ? "✓ ตรงกัน" : "✗ ต่างกัน" };
          }
          if (!col.ast) return { raw: null, text: "สูตรผิด" };
          const value = evaluateFormula(col.ast, resolveRef);
          return { raw: value, text: value === null ? "—" : formatCell(value, "number") };
        }),
      };
    });

    const filter = rowFilter.trim().toLowerCase();
    if (filter) {
      rows = rows.filter((row) =>
        row.cells.some((cell) => cell.text.toLowerCase().includes(filter))
      );
    }

    if (layout.sort) {
      const index = visibleColumns.findIndex((col) => col.id === layout.sort.colId);
      if (index !== -1) {
        const direction = layout.sort.dir === "desc" ? -1 : 1;
        rows = [...rows].sort(
          (a, b) => direction * compareCells(a.cells[index]?.raw, b.cells[index]?.raw)
        );
      }
    }
    return rows;
  }, [result, visibleColumns, baseNameToIndex, rowFilter, layout.sort, layout.merge, mergeIndex]);

  const matchCount = useMemo(
    () =>
      displayRows.length && displayRows[0].matched !== null
        ? displayRows.filter((row) => row.matched).length
        : null,
    [displayRows]
  );

  // Keys arrive as `rowIndex:columnName`; the table addresses cells by
  // display-column id, which is the same string for base columns.
  const changedCellKeys = useMemo(() => changedKeys, [changedKeys]);

  const editableColumns = useMemo(() => layout.editable?.columns || [], [layout.editable]);
  const canEditCells = Boolean(
    canManage && layout.editable && baseNameToIndex.has(layout.editable.pk)
  );

  const editCell = async ({ sourceIndex, colId, colIndex, value }) => {
    const col = visibleColumns[colIndex];
    if (!col || col.kind !== "base") return;
    const current = result.rows[sourceIndex][baseNameToIndex.get(col.column.name)];
    if (String(current ?? "") === String(value ?? "")) return;

    setEditPending({ sourceIndex, colId });
    setEditError("");
    try {
      const data = await apiJson(`/api/queries/${query.id}/cell`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pkValue: result.rows[sourceIndex][baseNameToIndex.get(layout.editable.pk)],
          column: col.column.name,
          value,
        }),
        fallbackError: "แก้ไขข้อมูลไม่สำเร็จ",
      });
      setResult((prev) => {
        const rows = prev.rows.map((row, index) =>
          index === sourceIndex
            ? row.map((cell, cellIndex) =>
                cellIndex === baseNameToIndex.get(col.column.name) ? data.newValue : cell
              )
            : row
        );
        // Keep the refresh baseline in step, or the next auto-refresh reports
        // this edit as an outside change.
        previousRowsRef.current = { columns: prev.columns, rows };
        return { ...prev, rows };
      });
      setChangedKeys(new Set([`${sourceIndex}:${colId}`]));
    } catch (err) {
      setEditError(err.message);
    } finally {
      setEditPending(null);
    }
  };

  const exportCsv = () => {
    const headers = visibleColumns.map((col) => col.label);
    const csv = rowsToCsv(headers, displayRows.map((row) => row.cells.map((cell) => cell.text)));
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${query.name.replace(/[\\/:*?"<>|]/g, "_")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // scope "mine" keeps the arrangement to this user; "shared" changes what
  // everyone sees and is admin-only on the server too.
  const saveLayout = async (scope) => {
    setSavingLayout(true);
    setSaveError("");
    try {
      const url =
        scope === "shared"
          ? `/api/queries/${query.id}/layout`
          : `/api/queries/${query.id}/my-layout`;
      const data = await apiJson(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ layout }),
        fallbackError: "บันทึก Layout ไม่สำเร็จ",
      });
      setLayout(normalizeLayout(data.layout));
      layoutDirtyRef.current = false;
      setLayoutDirty(false);
      if (scope === "mine") onPersonalLayoutSaved?.(query.id, data.layout);
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSavingLayout(false);
    }
  };

  const dropPersonalLayout = async () => {
    setSavingLayout(true);
    setSaveError("");
    try {
      await apiJson(`/api/queries/${query.id}/my-layout`, {
        method: "DELETE",
        fallbackError: "ล้าง layout ส่วนตัวไม่สำเร็จ",
      });
      onPersonalLayoutSaved?.(query.id, null);
      setLayout(normalizeLayout(query.layout));
      layoutDirtyRef.current = false;
      setLayoutDirty(false);
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSavingLayout(false);
    }
  };

  const resetLayout = () => {
    mutateLayout(() => ({ ...EMPTY_LAYOUT }));
  };

  // Panel frame drag — any edge or corner. dirX/dirY say which way the pointer
  // has to travel to make the panel bigger, so the left edge is dirX -1 and the
  // right edge dirX 1. Size lives in the parent so it can be persisted.
  const sectionRef = useRef(null);
  const [frameDrag, setFrameDrag] = useState(null);

  const startFrameResize = (event, dirX, dirY) => {
    event.preventDefault();
    event.stopPropagation();
    setFrameDrag({
      dirX,
      dirY,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: sectionRef.current?.getBoundingClientRect().width || 0,
      startHeight: panel.height,
      cursor: frameCursor(dirX, dirY),
    });
  };

  useEffect(() => {
    if (!frameDrag) return undefined;
    const move = (event) => {
      if (frameDrag.dirX) {
        onWidthChange(frameDrag.startWidth + frameDrag.dirX * (event.clientX - frameDrag.startX));
      }
      if (frameDrag.dirY) {
        onHeightChange(frameDrag.startHeight + frameDrag.dirY * (event.clientY - frameDrag.startY));
      }
    };
    const stop = () => setFrameDrag(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    document.body.style.userSelect = "none";
    document.body.style.cursor = frameDrag.cursor;
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [frameDrag, onWidthChange, onHeightChange]);

  const resetFrame = (dirX, dirY) => {
    if (dirX) onResetWidth();
    if (dirY) onResetHeight();
  };

  const [dropTarget, setDropTarget] = useState(false);
  const isDragSource = draggingQueryId === query.id;
  const canDrop = draggingQueryId != null && !isDragSource;

  return (
    <section
      ref={sectionRef}
      style={panel.width ? { width: panel.width, flex: "0 0 auto" } : { flex: "1 1 480px" }}
      onDragOver={(event) => {
        if (!canDrop) return;
        event.preventDefault();
        setDropTarget(true);
      }}
      onDragLeave={() => setDropTarget(false)}
      onDrop={(event) => {
        if (!canDrop) return;
        event.preventDefault();
        setDropTarget(false);
        onDropPanel();
      }}
      className={`relative flex min-w-0 flex-col rounded-2xl border bg-white transition ${
        dropTarget && canDrop ? "border-red-600 ring-2 ring-red-500/40" : "border-zinc-200"
      } ${isDragSource ? "opacity-50" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 p-3">
        <span
          draggable
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", String(query.id));
            onDragStart();
          }}
          onDragEnd={() => {
            setDropTarget(false);
            onDragEnd();
          }}
          className="cursor-grab rounded-lg p-1 text-zinc-300 transition hover:bg-zinc-100 hover:text-zinc-600 active:cursor-grabbing"
          title="ลากเพื่อสลับตำแหน่งกับตารางอื่น"
        >
          <GripVertical size={14} />
        </span>
        <button
          type="button"
          onClick={onToggleCollapse}
          className="rounded-lg p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
          title={panel.collapsed ? "ขยายตาราง" : "ย่อตาราง"}
        >
          {panel.collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black">
            {query.name}
            {refreshing && (
              <Loader2 size={11} className="ml-1.5 inline animate-spin text-zinc-400" />
            )}
          </p>
          <p className="truncate text-[10px] font-semibold text-zinc-400">
            {result ? (
              <>
                {displayRows.length.toLocaleString("th-TH")} แถว
                {rowFilter.trim() ? ` (กรองจาก ${result.rowCount.toLocaleString("th-TH")})` : ""}
                {" · "}ใช้เวลา {result.durationMs} ms
                {" · DB: "}
                {query.connectionName || "หลัก (inblackm)"}
                {result.truncated ? " · แสดงสูงสุด 1,000 แถวแรก" : ""}
                {lastRunAt
                  ? ` · อัปเดต ${lastRunAt.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
                  : ""}
                {matchCount !== null
                  ? ` · จับคู่กับ ${mergedQueryName} ได้ ${matchCount.toLocaleString("th-TH")}/${displayRows.length.toLocaleString("th-TH")} แถว`
                  : ""}
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
              onClick={() => saveLayout("mine")}
              disabled={savingLayout}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-red-600 px-3 text-[11px] font-black text-white transition hover:bg-red-700 disabled:opacity-50"
              title="บันทึกไว้ใช้เอง คนอื่นไม่เห็นการเปลี่ยนแปลงนี้"
            >
              {savingLayout ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              บันทึกของฉัน
            </button>
            {canManage && (
              <button
                type="button"
                onClick={() => saveLayout("shared")}
                disabled={savingLayout}
                className="flex h-8 items-center gap-1.5 rounded-lg border border-zinc-300 px-3 text-[11px] font-black text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-50"
                title="ตั้งเป็นค่าเริ่มต้นที่ทุกคนเห็น"
              >
                <Users size={12} /> บันทึกให้ทุกคน
              </button>
            )}
            <button type="button" onClick={resetLayout} className={iconButtonClass} title="ล้าง layout กลับเป็นค่าเริ่มต้น">
              <RotateCcw size={13} />
            </button>
          </>
        )}
        {personalLayout && !layoutDirty && (
          <button
            type="button"
            onClick={dropPersonalLayout}
            disabled={savingLayout}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2.5 text-[10px] font-black text-sky-700 transition hover:bg-sky-100 disabled:opacity-50"
            title="ตอนนี้ใช้ layout ส่วนตัวอยู่ — กดเพื่อกลับไปใช้ค่ากลาง"
          >
            <User size={11} /> ของฉัน
          </button>
        )}

        <button type="button" onClick={() => runQuery()} disabled={running} className={iconButtonClass} title="รันใหม่">
          <RefreshCw size={13} className={running ? "animate-spin" : ""} />
        </button>
        <div className="flex h-8 items-center gap-1 rounded-lg border border-zinc-200 px-2" title="รันซ้ำอัตโนมัติ">
          <Timer size={12} className={layout.refreshSeconds ? "text-red-600" : "text-zinc-400"} />
          <select
            value={layout.refreshSeconds}
            onChange={(e) =>
              mutateLayout((prev) => ({ ...prev, refreshSeconds: Number(e.target.value) }))
            }
            className="bg-transparent text-[10px] font-black text-zinc-600 outline-none"
          >
            {REFRESH_CHOICES.map((seconds) => (
              <option key={seconds} value={seconds}>
                {seconds === 0
                  ? "ปิด"
                  : seconds < 60
                    ? `${seconds} วิ`
                    : `${seconds / 60} นาที`}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => setView((prev) => (prev === "table" ? "chart" : "table"))}
          disabled={!result}
          className={`${iconButtonClass} ${view === "chart" ? "border-red-600 text-red-600" : ""}`}
          title={view === "chart" ? "กลับไปดูตาราง" : "ดูเป็นกราฟ"}
        >
          <ChartColumn size={13} />
        </button>
        <button type="button" onClick={() => setModal("computed")} disabled={!result} className={iconButtonClass} title="เพิ่มคอลัมน์สูตร">
          <Calculator size={13} />
        </button>
        <button
          type="button"
          onClick={() => setModal("merge")}
          disabled={!result}
          className={iconButtonClass}
          title="รวมตารางกับอีก Query"
        >
          <Combine size={13} className={layout.merge ? "text-red-600" : ""} />
        </button>
        <button type="button" onClick={() => setModal("rules")} disabled={!result} className={iconButtonClass} title="ระบายสีตามเงื่อนไข">
          <Palette size={13} />
        </button>
        <button type="button" onClick={() => setModal("chart")} disabled={!result} className={iconButtonClass} title="ตั้งค่ากราฟ">
          <Play size={13} className="rotate-90" />
        </button>
        <button type="button" onClick={exportCsv} disabled={!result} className={iconButtonClass} title="ดาวน์โหลด CSV">
          <Download size={13} />
        </button>
        {canManage && (
          <>
            <button type="button" onClick={() => setModal("params")} className={iconButtonClass} title="พารามิเตอร์ของ Query">
              <SlidersHorizontal size={13} />
            </button>
            <button type="button" onClick={() => setModal("editable")} disabled={!result} className={iconButtonClass} title="ตั้งค่าการแก้ไขข้อมูล">
              <Table2 size={13} className={layout.editable ? "text-red-600" : ""} />
            </button>
          </>
        )}
        <button type="button" onClick={onToggleFullWidth} className={iconButtonClass} title={isFullWidth ? "คืนความกว้างอัตโนมัติ" : "ขยายเต็มความกว้าง"}>
          {isFullWidth ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        </button>
        <button type="button" onClick={() => onMove(-1)} disabled={!canMoveUp} className={iconButtonClass} title="ย้ายไปก่อนหน้า">
          <ArrowLeft size={13} />
        </button>
        <button type="button" onClick={() => onMove(1)} disabled={!canMoveDown} className={iconButtonClass} title="ย้ายไปถัดไป">
          <ArrowRight size={13} />
        </button>
        {canManage && (
          <button type="button" onClick={onEditQuery} className={iconButtonClass} title="แก้ไข Query">
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
          {effectiveParams.length > 0 && (
            <div className="flex flex-wrap items-end gap-2 border-b border-zinc-100 bg-zinc-50/60 px-3 py-2">
              {effectiveParams.map((param) => (
                <div key={param.name}>
                  <label className="mb-0.5 block text-[9px] font-black text-zinc-500">
                    {param.label}
                  </label>
                  {param.type === "select" ? (
                    <select
                      value={paramValues[param.name] ?? ""}
                      onChange={(e) =>
                        setParamValues((prev) => ({ ...prev, [param.name]: e.target.value }))
                      }
                      className="h-8 rounded-lg border border-zinc-200 bg-white px-2 text-[11px] font-semibold outline-none focus:border-red-600"
                    >
                      <option value="">—</option>
                      {param.options.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={param.type === "date" ? "date" : param.type === "number" ? "number" : "text"}
                      value={paramValues[param.name] ?? ""}
                      onChange={(e) =>
                        setParamValues((prev) => ({ ...prev, [param.name]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") runQuery();
                      }}
                      className="h-8 w-32 rounded-lg border border-zinc-200 bg-white px-2 text-[11px] font-semibold outline-none focus:border-red-600"
                    />
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => runQuery()}
                disabled={running || missingParams.length > 0}
                className="flex h-8 items-center gap-1.5 rounded-lg bg-zinc-800 px-3 text-[11px] font-black text-white transition hover:bg-zinc-900 disabled:opacity-50"
              >
                <Play size={11} /> ใช้ค่านี้
              </button>
              {missingParams.length > 0 && (
                <p className="self-center text-[10px] font-bold text-amber-600">
                  กรอก {missingParams.join(", ")} ก่อนจึงจะรันได้
                </p>
              )}
            </div>
          )}

          {hiddenColumns.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 border-b border-zinc-100 px-3 py-2">
              <span className="text-[10px] font-black text-zinc-400">คอลัมน์ที่ซ่อน:</span>
              {hiddenColumns.map((col) => (
                <button
                  key={col.id}
                  type="button"
                  onClick={() =>
                    mutateLayout((prev) => ({
                      ...prev,
                      hidden: prev.hidden.filter((id) => id !== col.id),
                    }))
                  }
                  className="flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[10px] font-bold text-zinc-500 transition hover:bg-zinc-100"
                  title="กดเพื่อแสดงคอลัมน์นี้"
                >
                  <Eye size={10} /> {col.label}
                </button>
              ))}
            </div>
          )}

          {(saveError || editError || mergeError) && (
            <div className="mx-3 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-bold text-red-600">
              {saveError || editError || `รวมตารางไม่สำเร็จ: ${mergeError}`}
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
          ) : missingParams.length > 0 && !result ? (
            <p className="px-4 py-12 text-center text-xs font-semibold text-zinc-400">
              กรอกค่าด้านบนแล้วกด &quot;ใช้ค่านี้&quot; เพื่อดึงข้อมูล
            </p>
          ) : result ? (
            <>
              {view === "chart" && layout.chart ? (
                <PanelChart
                  chart={layout.chart}
                  columns={visibleColumns}
                  rows={displayRows}
                  height={panel.height}
                />
              ) : view === "chart" ? (
                <div
                  className="flex items-center justify-center px-4 text-[11px] font-semibold text-zinc-400"
                  style={{ height: panel.height }}
                >
                  ยังไม่ได้ตั้งค่ากราฟ — กดปุ่มตั้งค่ากราฟเพื่อเลือกแกน X/Y
                </div>
              ) : (
                <PanelTable
                  columns={visibleColumns}
                  allColumns={displayColumns}
                  rows={displayRows}
                  layout={layout}
                  mutateLayout={mutateLayout}
                  height={panel.height}
                  canEdit={canEditCells}
                  editableColumns={editableColumns}
                  editPending={editPending}
                  onEditCell={editCell}
                  changedKeys={changedCellKeys}
                />
              )}

              {result.hasMore && view === "table" && (
                <button
                  type="button"
                  onClick={() => runQuery({ append: true })}
                  disabled={loadingMore}
                  className="flex items-center justify-center gap-1.5 border-t border-zinc-100 bg-zinc-50 py-2 text-[11px] font-black text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-50"
                >
                  {loadingMore ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <ChevronDown size={12} />
                  )}
                  โหลดเพิ่ม (แสดงอยู่ {result.rows.length.toLocaleString("th-TH")} แถว)
                </button>
              )}

              <div
                onPointerDown={(event) => startFrameResize(event, 0, 1)}
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

      {FRAME_HANDLES.filter((handle) => !panel.collapsed || handle.dirY === 0).map((handle) => (
        <span
          key={handle.key}
          onPointerDown={(event) => startFrameResize(event, handle.dirX, handle.dirY)}
          onDoubleClick={() => resetFrame(handle.dirX, handle.dirY)}
          className={`absolute z-20 touch-none ${handle.className}`}
          style={{ cursor: frameCursor(handle.dirX, handle.dirY) }}
          title={handle.title}
        />
      ))}

      {modal === "computed" && result && (
        <ComputedColumnModal
          availableNames={[...new Set(result.columns.map((col) => col.name))]}
          onClose={() => setModal(null)}
          onAdd={({ label, formula }) => {
            const key = `calc_${Date.now()}`;
            mutateLayout((prev) => ({
              ...prev,
              computed: [...prev.computed, { key, label, formula }],
            }));
            setModal(null);
          }}
        />
      )}
      {modal === "params" && (
        <ParamsSettingsModal
          sqlText={query.sqlText}
          params={layout.params}
          onClose={() => setModal(null)}
          onSave={(params) => {
            mutateLayout((prev) => ({ ...prev, params }));
            setParamValues((prev) => {
              const next = { ...prev };
              for (const param of params) {
                if (next[param.name] === undefined) next[param.name] = param.defaultValue ?? "";
              }
              return next;
            });
            setModal(null);
          }}
        />
      )}
      {modal === "editable" && result && (
        <EditableSettingsModal
          columnNames={result.columns.map((col) => col.name)}
          editable={layout.editable}
          onClose={() => setModal(null)}
          onSave={(editable) => {
            mutateLayout((prev) => ({ ...prev, editable }));
            setModal(null);
          }}
        />
      )}
      {modal === "merge" && result && (
        <MergeModal
          query={query}
          queries={queries}
          columnNames={result.columns.map((col) => col.name)}
          merge={layout.merge}
          onClose={() => setModal(null)}
          onSave={(merge) => {
            mutateLayout((prev) => ({ ...prev, merge }));
            setModal(null);
          }}
        />
      )}
      {modal === "rules" && result && (
        <RulesModal
          columns={visibleColumns}
          rules={layout.rules}
          onClose={() => setModal(null)}
          onSave={(rules) => {
            mutateLayout((prev) => ({ ...prev, rules }));
            setModal(null);
          }}
        />
      )}
      {modal === "chart" && result && (
        <ChartModal
          columns={visibleColumns}
          chart={layout.chart}
          onClose={() => setModal(null)}
          onSave={(chart) => {
            mutateLayout((prev) => ({ ...prev, chart }));
            setView(chart ? "chart" : "table");
            setModal(null);
          }}
        />
      )}
    </section>
  );
}
