"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Calculator,
  Camera,
  ChartColumn,
  ChevronDown,
  ClipboardPaste,
  Combine,
  CornerDownRight,
  ChevronUp,
  Download,
  Eye,
  GripVertical,
  Lock,
  Loader2,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Paintbrush,
  Palette,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  SlidersHorizontal,
  Table2,
  Timer,
  Trash2,
  User,
  Users,
  X,
} from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { evaluateFormula } from "@/lib/gamedb-formula";
import { extractSqlParams } from "@/lib/gamedb-sql-params";
import {
  baseColumnIds,
  buildDisplayColumns,
  buildHeaderGroups,
  buildToneGrid,
  cellsEqual,
  compareCells,
  EMPTY_LAYOUT,
  formatCell,
  mergeKeyOf,
  normalizeLayout,
  REFRESH_CHOICES,
  rowsToCsv,
} from "@/lib/gamedb-layout";
import { ComputedColumnModal } from "@/components/gamedb-modals";
import {
  BulkEditModal,
  ChartModal,
  DrillModal,
  EditableSettingsModal,
  FormatsModal,
  MergeModal,
  NewRowModal,
  ParamsSettingsModal,
  RulesModal,
} from "@/components/panel-config-modals";
import PanelTable from "@/components/panel-table";
import PanelChart from "@/components/panel-chart";

// One shared empty object, so a panel with no lookup fields does not hand its
// children a new identity on every render.
const NO_LOOKUPS = {};

const iconButtonClass =
  "flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 transition hover:bg-zinc-50 hover:text-zinc-700 disabled:opacity-40";

const menuItemClass =
  "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[11px] font-bold text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-40";

const paramPresetButtonClass =
  "rounded-md border border-zinc-200 bg-white px-2 py-1 text-[9px] font-black text-zinc-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700";

const RESIZE_HINT = "ลากเพื่อปรับขนาด · ดับเบิลคลิกเพื่อรีเซ็ต";
const MIN_FRAME_WIDTH = 280;
const MIN_FRAME_HEIGHT = 140;
const MAX_FRAME_HEIGHT = 1600;

// Eight Figma-like hit areas. The inner marker is shown when the frame is
// selected, while the larger transparent area remains easy to grab.
const FRAME_HANDLES = [
  { key: "w", dirX: -1, dirY: 0, className: "-left-1.5 top-4 bottom-4 w-3", markerClass: "left-1/2 top-0 h-full w-px -translate-x-1/2 bg-red-500" },
  { key: "e", dirX: 1, dirY: 0, className: "-right-1.5 top-4 bottom-4 w-3", markerClass: "left-1/2 top-0 h-full w-px -translate-x-1/2 bg-red-500" },
  { key: "n", dirX: 0, dirY: -1, className: "-top-1.5 left-4 right-4 h-3", markerClass: "left-0 top-1/2 h-px w-full -translate-y-1/2 bg-red-500" },
  { key: "s", dirX: 0, dirY: 1, className: "-bottom-1.5 left-4 right-4 h-3", markerClass: "left-0 top-1/2 h-px w-full -translate-y-1/2 bg-red-500" },
  { key: "nw", dirX: -1, dirY: -1, className: "-left-2.5 -top-2.5 h-5 w-5", markerClass: "inset-1 rounded-sm border border-red-500 bg-white shadow-sm" },
  { key: "ne", dirX: 1, dirY: -1, className: "-right-2.5 -top-2.5 h-5 w-5", markerClass: "inset-1 rounded-sm border border-red-500 bg-white shadow-sm" },
  { key: "sw", dirX: -1, dirY: 1, className: "-bottom-2.5 -left-2.5 h-5 w-5", markerClass: "inset-1 rounded-sm border border-red-500 bg-white shadow-sm" },
  { key: "se", dirX: 1, dirY: 1, className: "-bottom-2.5 -right-2.5 h-5 w-5", markerClass: "inset-1 rounded-sm border border-red-500 bg-white shadow-sm" },
];

function frameCursor(dirX, dirY) {
  if (!dirY) return "col-resize";
  if (!dirX) return "row-resize";
  return dirX === dirY ? "nwse-resize" : "nesw-resize";
}

function initialParamValues(params) {
  const values = {};
  for (const param of params) {
    values[param.name] =
      param.type === "boolean" && !param.defaultValue
        ? "false"
        : param.defaultValue ?? "";
  }
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
        required: true,
      }
  );
}

function paramInputGuide(param) {
  if (param.type === "number") {
    return {
      inputType: "number",
      placeholder: "เช่น 100 หรือ 99.50",
      hint: "กรอกเป็นตัวเลข เช่น 100 หรือ 99.50",
      widthClass: "w-36",
      kind: "number",
    };
  }
  if (param.type === "date") {
    return {
      inputType: "date",
      placeholder: "เช่น 2026-07-28",
      hint: "รูปแบบ YYYY-MM-DD เช่น 2026-07-28",
      widthClass: "w-40",
      kind: "date",
    };
  }
  if (param.type === "datetime") {
    return {
      inputType: "datetime-local",
      placeholder: "เช่น 2026-07-28T14:30:00",
      hint: "รูปแบบ YYYY-MM-DDTHH:mm:ss เช่น 2026-07-28T14:30:00",
      widthClass: "w-52",
      kind: "datetime",
    };
  }
  if (param.type === "time") {
    return {
      inputType: "time",
      placeholder: "เช่น 14:30:00",
      hint: "รูปแบบ HH:mm:ss เช่น 14:30:00",
      widthClass: "w-36",
      kind: "time",
    };
  }
  if (param.type === "boolean") {
    return {
      inputType: "checkbox",
      placeholder: "",
      hint: "เปิด = true, ปิด = false",
      widthClass: "w-28",
      kind: "boolean",
    };
  }

  const identity = `${param.name} ${param.label || ""}`.toLowerCase();
  if (/(datetime|timestamp|date[_ -]?time|created_at|updated_at|\w+_at\b)/.test(identity)) {
    return {
      inputType: "text",
      placeholder: "เช่น 2026-07-28 14:30:00",
      hint: "วันที่และเวลา: YYYY-MM-DD HH:mm:ss เช่น 2026-07-28 14:30:00",
      widthClass: "w-52",
      kind: "datetime",
    };
  }
  if (/(^|[_ -])date($|[_ -])/.test(identity)) {
    return {
      inputType: "text",
      placeholder: "เช่น 2026-07-28",
      hint: "วันที่: YYYY-MM-DD เช่น 2026-07-28",
      widthClass: "w-40",
      kind: "date",
    };
  }
  if (/(^|[_ -])time($|[_ -])/.test(identity)) {
    return {
      inputType: "text",
      placeholder: "เช่น 14:30:00",
      hint: "เวลา: HH:mm:ss เช่น 14:30:00",
      widthClass: "w-36",
      kind: "time",
    };
  }
  return {
    inputType: "text",
    placeholder: "เช่น ABC123",
    hint: "กรอกข้อความหรือรหัสที่ต้องการค้นหา เช่น ABC123",
    widthClass: "w-40",
    kind: "text",
  };
}

function isValidDatePart(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isValidTimePart(value) {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return false;
  const [, hour, minute, second = "0"] = match;
  return Number(hour) <= 23 && Number(minute) <= 59 && Number(second) <= 59;
}

function validateParamValues(params, values) {
  const errors = {};
  for (const param of params) {
    const value = String(values[param.name] ?? "").trim();
    if (!value) {
      if (param.required !== false) {
        errors[param.name] = `กรุณากรอก ${param.label || param.name}`;
      }
      continue;
    }

    const guide = paramInputGuide(param);
    if (guide.kind === "number" && !Number.isFinite(Number(value))) {
      errors[param.name] = "กรุณากรอกเป็นตัวเลข เช่น 100 หรือ 99.50";
    } else if (guide.kind === "date" && !isValidDatePart(value)) {
      errors[param.name] = "รูปแบบวันที่ต้องเป็น YYYY-MM-DD เช่น 2026-07-28";
    } else if (guide.kind === "datetime") {
      const [datePart, timePart] = value.split(/[T ]/);
      if (!isValidDatePart(datePart || "") || !isValidTimePart(timePart || "")) {
        errors[param.name] =
          param.type === "datetime"
            ? "รูปแบบต้องเป็น YYYY-MM-DDTHH:mm:ss"
            : "รูปแบบต้องเป็น YYYY-MM-DD HH:mm:ss";
      }
    } else if (guide.kind === "time" && !isValidTimePart(value)) {
      errors[param.name] = "รูปแบบเวลาต้องเป็น HH:mm:ss เช่น 14:30:00";
    } else if (
      param.type === "select" &&
      param.options.length > 0 &&
      !param.options.includes(value)
    ) {
      errors[param.name] = "กรุณาเลือกค่าจากรายการ";
    } else if (param.type === "boolean" && !["true", "false"].includes(value)) {
      errors[param.name] = "ค่าต้องเป็น true หรือ false";
    }
  }

  const range = findDateRangeParams(params);
  if (range && !errors[range.start.name] && !errors[range.end.name]) {
    const startRaw = String(values[range.start.name] ?? "").replace(" ", "T");
    const endRaw = String(values[range.end.name] ?? "").replace(" ", "T");
    const startValue =
      paramInputGuide(range.start).kind === "date" ? `${startRaw}T00:00:00` : startRaw;
    const endValue =
      paramInputGuide(range.end).kind === "date" ? `${endRaw}T23:59:59` : endRaw;
    if (startValue > endValue) {
      errors[range.end.name] = "วันที่สิ้นสุดต้องไม่น้อยกว่าวันที่เริ่มต้น";
    }
  }
  return errors;
}

function findDateRangeParams(params) {
  const dateParams = params.filter((param) =>
    ["date", "datetime"].includes(paramInputGuide(param).kind)
  );
  const identity = (param) => `${param.name} ${param.label || ""}`.toLowerCase();
  const start = dateParams.find((param) =>
    /(^|[_ -])(from|start|since|begin)(?=$|[_ -])|(from|start)(date|time)|เริ่ม/.test(identity(param))
  );
  const end = dateParams.find((param) =>
    /(^|[_ -])(to|end|until|before)(?=$|[_ -])|(to|end)(date|time)|สิ้นสุด|ถึง/.test(identity(param))
  );
  return start && end && start.name !== end.name ? { start, end } : null;
}

function formatDateParam(date, param, endOfDay = false) {
  const pad = (value) => String(value).padStart(2, "0");
  const datePart = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const kind = paramInputGuide(param).kind;
  if (kind === "date") return datePart;
  const timePart = endOfDay ? "23:59:59" : "00:00:00";
  return param.type === "datetime"
    ? `${datePart}T${timePart}`
    : `${datePart} ${timePart}`;
}

function datePresetRange(preset) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  const end = new Date(today);

  if (preset === "yesterday") {
    start.setDate(start.getDate() - 1);
    end.setDate(end.getDate() - 1);
  } else if (preset === "last7") {
    start.setDate(start.getDate() - 6);
  } else if (preset === "thisMonth") {
    start.setDate(1);
  } else if (preset === "previousMonth") {
    start.setMonth(start.getMonth() - 1, 1);
    end.setDate(0);
  }
  return { start, end };
}

function isSensitiveParam(param) {
  return /(password|passwd|passcode|token|secret|api[_ -]?key|cookie|credential)/i.test(
    `${param.name} ${param.label || ""}`
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
  onDataChange,
  canManage,
  canCustomizeLayout,
  isFullWidth,
  onPositionChange,
  onFrameChange,
  onBringToFront,
  onInteractionStart,
  onInteractionEnd,
  canvasScale = 1,
  onRenderedHeight,
  onClose,
  onToggleFullWidth,
  onToggleCollapse,
  onResetHeight,
  onResetWidth,
  onEditQuery,
  onDrill,
  initialParams,
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

  // initialParams arrives when this panel was opened by drilling from another,
  // and takes precedence over the configured defaults.
  const startingParamValues = useMemo(
    () => ({
      ...initialParamValues(savedParams),
      ...(initialParams || {}),
    }),
    [initialParams, savedParams]
  );
  const [paramValues, setParamValues] = useState(startingParamValues);
  const [paramStorageReady, setParamStorageReady] = useState(false);
  const [showParamErrors, setShowParamErrors] = useState(false);
  const paramStorageLoadedRef = useRef(null);
  const [rowFilter, setRowFilter] = useState("");
  const [view, setView] = useState("table");
  const [modal, setModal] = useState(null);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef(null);
  const [changedKeys, setChangedKeys] = useState(new Set());
  const [editPending, setEditPending] = useState(null);
  const [editError, setEditError] = useState("");

  const effectiveParams = useMemo(
    () => resolveParams(layout, query.sqlText),
    [layout, query.sqlText]
  );
  const paramErrors = useMemo(
    () => validateParamValues(effectiveParams, paramValues),
    [effectiveParams, paramValues]
  );
  const dateRangeParams = useMemo(
    () => findDateRangeParams(effectiveParams),
    [effectiveParams]
  );

  // runQuery must not be rebuilt whenever a parameter input changes, or the
  // effect below would re-run the query on every keystroke.
  const paramsRef = useRef(paramValues);
  const paramErrorsRef = useRef(paramErrors);
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
    paramErrorsRef.current = paramErrors;
  }, [paramValues, paramErrors]);

  useEffect(() => {
    if (paramStorageLoadedRef.current === query.id) return;
    paramStorageLoadedRef.current = query.id;
    const remembered = {};
    try {
      const stored = JSON.parse(localStorage.getItem(`gamedb.query-params.${query.id}`) || "{}");
      for (const param of effectiveParams) {
        if (
          !isSensitiveParam(param) &&
          stored &&
          typeof stored[param.name] === "string"
        ) {
          remembered[param.name] = stored[param.name];
        }
      }
    } catch {
      // A corrupt or blocked browser store should never stop a query panel.
    }
    setParamValues({
      ...startingParamValues,
      ...remembered,
      ...(initialParams || {}),
    });
    setParamStorageReady(true);
  }, [effectiveParams, initialParams, query.id, startingParamValues]);

  useEffect(() => {
    if (!paramStorageReady) return;
    const remembered = {};
    for (const param of effectiveParams) {
      if (!isSensitiveParam(param)) {
        remembered[param.name] = String(paramValues[param.name] ?? "");
      }
    }
    try {
      localStorage.setItem(`gamedb.query-params.${query.id}`, JSON.stringify(remembered));
    } catch {
      // Private browsing and storage policies may block localStorage.
    }
  }, [effectiveParams, paramStorageReady, paramValues, query.id]);

  useEffect(() => {
    if (!moreMenuOpen) return;

    const closeOnOutsideClick = (event) => {
      if (!moreMenuRef.current?.contains(event.target)) setMoreMenuOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setMoreMenuOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [moreMenuOpen]);

  const runMoreAction = (action) => {
    setMoreMenuOpen(false);
    action();
  };

  const runQuery = useCallback(
    async ({ silent = false, append = false, validate = false } = {}) => {
      // Nothing to send yet — show the inputs instead of a failed request.
      const firstInvalidParam = Object.keys(paramErrorsRef.current)[0];
      if (firstInvalidParam) {
        if (validate) {
          setShowParamErrors(true);
          requestAnimationFrame(() => {
            document.getElementById(`query-${query.id}-param-${firstInvalidParam}`)?.focus();
          });
        }
        setRunning(false);
        setRefreshing(false);
        setRunError("");
        return;
      }
      if (validate) setShowParamErrors(false);
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
            // Pressing refresh means "go and look", so skip the shared cache;
            // the auto-refresh timer is happy to reuse it.
            fresh: !silent && !append,
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
          // Keyed by display-column id, which is how the table addresses a cell.
          const columnIds = baseColumnIds(data.columns);
          const keys = new Set();
          data.rows.forEach((row, rowIndex) => {
            row.forEach((value, colIndex) => {
              if (String(previous.rows[rowIndex][colIndex]) !== String(value)) {
                keys.add(`${rowIndex}:${columnIds[colIndex]}`);
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
    if (!paramStorageReady) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setState happens after the run request resolves
    runQuery();
  }, [paramStorageReady, runQuery]);

  // The "r" shortcut refreshes every open panel at once.
  useEffect(() => {
    const refreshAll = () => runQuery();
    window.addEventListener("gamedb:refresh-all", refreshAll);
    return () => window.removeEventListener("gamedb:refresh-all", refreshAll);
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
    if (!canCustomizeLayout) return;
    setLayout((prev) => updater(prev));
    layoutDirtyRef.current = true;
    setLayoutDirty(true);
  }, [canCustomizeLayout]);

  const resetParamValues = () => {
    setParamValues(initialParamValues(effectiveParams));
    setShowParamErrors(false);
  };

  const clearParamValues = () => {
    setParamValues(
      Object.fromEntries(
        effectiveParams.map((param) => [
          param.name,
          param.type === "boolean" ? "false" : "",
        ])
      )
    );
    setShowParamErrors(false);
  };

  const applyDateRangePreset = (preset) => {
    if (!dateRangeParams) return;
    const range = datePresetRange(preset);
    setParamValues((prev) => ({
      ...prev,
      [dateRangeParams.start.name]: formatDateParam(
        range.start,
        dateRangeParams.start,
        false
      ),
      [dateRangeParams.end.name]: formatDateParam(
        range.end,
        dateRangeParams.end,
        true
      ),
    }));
    setShowParamErrors(false);
  };

  const applySingleDatePreset = (param, preset) => {
    const range = datePresetRange(preset);
    setParamValues((prev) => ({
      ...prev,
      [param.name]: formatDateParam(range.start, param, false),
    }));
    setShowParamErrors(false);
  };

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
      // Raw, not coerced: the formula engine decides whether it wanted a
      // number, a date or text, and a column of dates is none of the three
      // until it is asked for.
      const resolveRef = (name) => {
        const index = baseNameToIndex.get(name);
        return index === undefined ? null : row[index];
      };
      const partner = canMerge
        ? mergeIndex.byKey.get(mergeKeyOf(leftKeyIndexes.map((index) => row[index])))
        : null;

      return {
        sourceIndex,
        matched: canMerge ? Boolean(partner) : null,
        cells: visibleColumns.map((col) => {
          if (col.kind === "base") {
            // By position: two columns can share a name, and then a lookup by
            // name hands both of them the same value.
            const raw = row[col.index];
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
          return { raw: value, text: formatCell(value, col.type) };
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

  // Report what is on screen so the workbook export can pick it up — including
  // how it looks, so the download is the table rather than its values.
  useEffect(() => {
    onDataChange?.(query.id, {
      name: query.name,
      headers: visibleColumns.map((col) => col.label),
      // Excel decides how to store a cell from the column type, not from what
      // the text looks like, so a phone number keeps its leading zero.
      types: visibleColumns.map((col) => col.type),
      rows: displayRows.map((row) => row.cells.map((cell) => cell.raw ?? cell.text)),
      headerTones: visibleColumns.map((col) => layout.formats[col.id]?.headerBg || ""),
      cellTones: buildToneGrid(visibleColumns, displayRows, layout),
      groups: buildHeaderGroups(visibleColumns, layout),
    });
  }, [onDataChange, query.id, query.name, visibleColumns, displayRows, layout]);

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

  // Dropdowns that read another table are fetched once for the panel rather
  // than per cell, and only when a field actually asks for one.
  const [loadedLookups, setLoadedLookups] = useState(NO_LOOKUPS);
  const lookupSignature = useMemo(
    () =>
      JSON.stringify(
        (layout.editable?.inputs || [])
          .filter((input) => input.widget === "lookup" && input.lookup)
          .map((input) => [input.column, input.lookup])
      ),
    [layout.editable]
  );
  const hasLookups = lookupSignature !== "[]";

  useEffect(() => {
    if (!canEditCells || !hasLookups) return undefined;
    let cancelled = false;
    apiJson(`/api/queries/${query.id}/lookup`, {
      fallbackError: "โหลดรายการตัวเลือกไม่สำเร็จ",
    })
      .then((data) => {
        if (!cancelled) setLoadedLookups(data.options || NO_LOOKUPS);
      })
      .catch(() => {
        if (!cancelled) setLoadedLookups(NO_LOOKUPS);
      });
    return () => {
      cancelled = true;
    };
  }, [query.id, canEditCells, hasLookups, lookupSignature]);

  // Derived rather than cleared in the effect: turning the last lookup field
  // off should drop the lists without another render pass.
  const lookupOptions = hasLookups ? loadedLookups : NO_LOOKUPS;

  const editCell = async ({ sourceIndex, colId, colIndex, value }) => {
    const col = visibleColumns[colIndex];
    if (!col || col.kind !== "base") return;
    const current = result.rows[sourceIndex][col.index];
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
            ? row.map((cell, cellIndex) => (cellIndex === col.index ? data.newValue : cell))
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

  const insertRow = async (values) => {
    await apiJson(`/api/queries/${query.id}/row`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values }),
      fallbackError: "เพิ่มแถวไม่สำเร็จ",
    });
    // Re-run rather than splice the row in: the table can have defaults,
    // triggers and an ordering of its own, and only the query knows the result.
    await runQuery({ silent: true });
  };

  const deleteRow = async (row) => {
    const pkValue = result.rows[row.sourceIndex][baseNameToIndex.get(layout.editable.pk)];
    const confirmed = window.confirm(
      `ลบแถวที่ ${layout.editable.pk} = ${pkValue} ออกจากตาราง ${layout.editable.table}?\n` +
        "ลบแล้วเอากลับไม่ได้"
    );
    if (!confirmed) return;
    setEditError("");
    try {
      await apiJson(`/api/queries/${query.id}/row`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pkValue }),
        fallbackError: "ลบแถวไม่สำเร็จ",
      });
      await runQuery({ silent: true });
    } catch (err) {
      setEditError(err.message);
    }
  };

  // Runs the pasted edits one at a time: the endpoint writes a single cell in
  // its own transaction, and a partial failure should report which lines failed
  // rather than roll the good ones back.
  const applyBulkEdits = async (edits) => {
    let ok = 0;
    const failed = [];
    for (const edit of edits) {
      try {
        await apiJson(`/api/queries/${query.id}/cell`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(edit),
          fallbackError: "แก้ไขไม่สำเร็จ",
        });
        ok += 1;
      } catch (err) {
        failed.push({ ...edit, message: err.message });
      }
    }
    if (ok > 0) await runQuery({ silent: true });
    return { ok, failed };
  };

  // --- snapshots -----------------------------------------------------------
  const [snapshots, setSnapshots] = useState([]);
  const [viewingSnapshot, setViewingSnapshot] = useState(null);

  const loadSnapshots = useCallback(async () => {
    try {
      const data = await apiJson(`/api/queries/${query.id}/snapshots`, {
        fallbackError: "โหลดรายการ snapshot ไม่สำเร็จ",
      });
      setSnapshots(data.snapshots || []);
    } catch {
      setSnapshots([]);
    }
  }, [query.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setState runs after the fetch resolves
    loadSnapshots();
  }, [loadSnapshots]);

  const saveSnapshot = async () => {
    const name = window.prompt(
      "ตั้งชื่อ snapshot นี้",
      `${query.name} — ${new Date().toLocaleString("th-TH")}`
    );
    if (name === null) return;
    setSaveError("");
    try {
      await apiJson(`/api/queries/${query.id}/snapshots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, params: paramValues }),
        fallbackError: "บันทึก snapshot ไม่สำเร็จ",
      });
      await loadSnapshots();
    } catch (err) {
      setSaveError(err.message);
    }
  };

  const openSnapshot = async (snapshotId) => {
    if (!snapshotId) {
      setViewingSnapshot(null);
      runQuery();
      return;
    }
    setSaveError("");
    try {
      const data = await apiJson(`/api/snapshots/${snapshotId}`, {
        fallbackError: "เปิด snapshot ไม่สำเร็จ",
      });
      previousRowsRef.current = null;
      setViewingSnapshot(data.snapshot);
      setResult({
        columns: data.snapshot.columns,
        rows: data.snapshot.rows,
        rowCount: data.snapshot.rowCount,
        durationMs: 0,
        truncated: false,
        hasMore: false,
      });
    } catch (err) {
      setSaveError(err.message);
    }
  };

  // Deletes the snapshot on screen, or the whole history when none is open.
  const clearSnapshots = async () => {
    const target = viewingSnapshot
      ? snapshots.find((snapshot) => snapshot.id === viewingSnapshot.id)
      : null;
    const message = target
      ? `ลบ snapshot "${target.name}" ?`
      : `ลบ snapshot ของ "${query.name}" ทั้งหมด ${snapshots.length} รายการ ?`;
    if (!window.confirm(message)) return;
    setSaveError("");
    try {
      await apiJson(
        target ? `/api/snapshots/${target.id}` : `/api/queries/${query.id}/snapshots`,
        { method: "DELETE", fallbackError: "ลบ snapshot ไม่สำเร็จ" }
      );
      // Whatever was on screen is gone now, so go back to live data.
      if (viewingSnapshot) {
        setViewingSnapshot(null);
        runQuery();
      }
      await loadSnapshots();
    } catch (err) {
      setSaveError(err.message);
    }
  };

  const drillRow = (row) => {
    if (!layout.drill || !onDrill) return;
    const values = {};
    for (const item of layout.drill.map) {
      const index = baseNameToIndex.get(item.column);
      if (index !== undefined) values[item.param] = result.rows[row.sourceIndex][index];
    }
    onDrill(layout.drill.queryId, values);
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
  const [panelDrag, setPanelDrag] = useState(null);
  const [frameSelected, setFrameSelected] = useState(false);

  useEffect(() => {
    if (!canCustomizeLayout) return undefined;
    const clearSelection = (event) => {
      if (!sectionRef.current?.contains(event.target)) setFrameSelected(false);
    };
    document.addEventListener("pointerdown", clearSelection);
    return () => document.removeEventListener("pointerdown", clearSelection);
  }, [canCustomizeLayout]);

  useEffect(() => {
    const element = sectionRef.current;
    if (!element || !onRenderedHeight) return undefined;
    const report = () =>
      onRenderedHeight(
        query.id,
        Math.ceil(element.getBoundingClientRect().height / canvasScale)
      );
    report();
    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(report) : null;
    observer?.observe(element);
    return () => observer?.disconnect();
  }, [canvasScale, onRenderedHeight, query.id]);

  const startPanelMove = (event) => {
    if (!canCustomizeLayout) return;
    event.preventDefault();
    event.stopPropagation();
    onInteractionStart?.();
    onBringToFront?.(query.id);
    setPanelDrag({
      startX: event.clientX,
      startY: event.clientY,
      panelX: panel.x || 0,
      panelY: panel.y || 0,
    });
  };

  useEffect(() => {
    if (!panelDrag) return undefined;
    const move = (event) => {
      onPositionChange(
        query.id,
        panelDrag.panelX + (event.clientX - panelDrag.startX) / canvasScale,
        panelDrag.panelY + (event.clientY - panelDrag.startY) / canvasScale
      );
    };
    const stop = () => {
      setPanelDrag(null);
      onInteractionEnd?.();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [
    canvasScale,
    onInteractionEnd,
    onPositionChange,
    panelDrag,
    query.id,
  ]);

  const startFrameResize = (event, dirX, dirY) => {
    event.preventDefault();
    event.stopPropagation();
    setFrameSelected(true);
    onInteractionStart?.();
    onBringToFront?.(query.id);
    setFrameDrag({
      dirX,
      dirY,
      startX: event.clientX,
      startY: event.clientY,
      startWidth:
        (sectionRef.current?.getBoundingClientRect().width || 0) / canvasScale,
      startHeight: panel.height || 420,
      startPanelX: panel.x || 0,
      startPanelY: panel.y || 0,
      cursor: frameCursor(dirX, dirY),
    });
  };

  useEffect(() => {
    if (!frameDrag) return undefined;
    const move = (event) => {
      const deltaX = (event.clientX - frameDrag.startX) / canvasScale;
      const deltaY = (event.clientY - frameDrag.startY) / canvasScale;
      let width = frameDrag.startWidth;
      let height = frameDrag.startHeight;
      let x = frameDrag.startPanelX;
      let y = frameDrag.startPanelY;

      if (frameDrag.dirX === 1) {
        width = Math.max(MIN_FRAME_WIDTH, frameDrag.startWidth + deltaX);
      } else if (frameDrag.dirX === -1) {
        width = Math.max(MIN_FRAME_WIDTH, frameDrag.startWidth - deltaX);
        x = frameDrag.startPanelX + frameDrag.startWidth - width;
      }

      if (frameDrag.dirY === 1) {
        height = Math.min(
          MAX_FRAME_HEIGHT,
          Math.max(MIN_FRAME_HEIGHT, frameDrag.startHeight + deltaY)
        );
      } else if (frameDrag.dirY === -1) {
        height = Math.min(
          MAX_FRAME_HEIGHT,
          Math.max(MIN_FRAME_HEIGHT, frameDrag.startHeight - deltaY)
        );
        y = frameDrag.startPanelY + frameDrag.startHeight - height;
      }

      onFrameChange(query.id, {
        x,
        y,
        width,
        height,
        dirX: frameDrag.dirX,
        dirY: frameDrag.dirY,
      });
    };
    const stop = () => {
      setFrameDrag(null);
      onInteractionEnd?.();
    };
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
  }, [
    canvasScale,
    frameDrag,
    onFrameChange,
    onInteractionEnd,
    query.id,
  ]);

  const resetFrame = (dirX, dirY) => {
    if (dirX) onResetWidth();
    if (dirY) onResetHeight();
  };

  return (
    <section
      ref={sectionRef}
      onPointerDown={() => {
        if (canCustomizeLayout) {
          setFrameSelected(true);
          onBringToFront?.(query.id);
        }
      }}
      style={{
        position: "absolute",
        left: panel.x || 0,
        top: panel.y || 0,
        width: panel.width,
      }}
      className={`flex min-w-0 flex-col rounded-2xl border border-zinc-200 bg-white shadow-sm transition-shadow ${
        panelDrag || frameDrag
          ? "z-30 shadow-xl ring-1 ring-red-500"
          : frameSelected
            ? "z-10 ring-1 ring-red-500"
            : "z-10"
      }`}
    >
      {canCustomizeLayout && (panelDrag || frameDrag) && (
        <div
          className="pointer-events-none absolute right-2 top-2 z-50 rounded-md bg-zinc-900/90 px-2 py-1 font-mono text-[9px] font-bold text-white shadow-lg"
          aria-live="polite"
        >
          {panelDrag
            ? `X ${Math.round(panel.x || 0)} · Y ${Math.round(panel.y || 0)}`
            : `${Math.round(panel.width || 0)} × ${Math.round(panel.height || 0)} px`}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 p-3">
        {canCustomizeLayout ? <button
          type="button"
          onPointerDown={startPanelMove}
          className="flex h-8 w-8 shrink-0 cursor-grab items-center justify-center rounded-lg border border-transparent text-zinc-300 transition hover:border-zinc-200 hover:bg-zinc-100 hover:text-zinc-600 active:cursor-grabbing"
          title="ลากเพื่อย้ายกล่องไปวางตำแหน่งที่ต้องการ"
          aria-label={`ย้ายกล่อง ${query.name}`}
        >
          <GripVertical size={14} />
        </button> : (
          <span
            className="rounded-lg p-1 text-zinc-300"
            title="บัญชีนี้ใช้ layout จาก template"
          >
            <Lock size={14} />
          </span>
        )}
        {canCustomizeLayout && <button
          type="button"
          onClick={onToggleCollapse}
          className="rounded-lg p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
          title={panel.collapsed ? "ขยายตาราง" : "ย่อตาราง"}
        >
          {panel.collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>}

        <div className="min-w-48 flex-[1_1_16rem]">
          <p className="truncate text-sm font-black" title={query.name}>
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

        {canCustomizeLayout && layoutDirty && (
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
        {canCustomizeLayout && personalLayout && !layoutDirty && (
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

        <button type="button" onClick={() => runQuery({ validate: true })} disabled={running} className={iconButtonClass} title="รันใหม่">
          <RefreshCw size={13} className={running ? "animate-spin" : ""} />
        </button>
        <div className="flex h-8 items-center gap-1 rounded-lg border border-zinc-200 px-2" title="รันซ้ำอัตโนมัติ">
          <Timer size={12} className={layout.refreshSeconds ? "text-red-600" : "text-zinc-400"} />
          <select
            value={layout.refreshSeconds}
            disabled={!canCustomizeLayout}
            onChange={(e) =>
              mutateLayout((prev) => ({ ...prev, refreshSeconds: Number(e.target.value) }))
            }
            className="bg-transparent text-[10px] font-black text-zinc-600 outline-none disabled:cursor-default"
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
        <button type="button" onClick={exportCsv} disabled={!result} className={iconButtonClass} title="ดาวน์โหลด CSV">
          <Download size={13} />
        </button>

        {canCustomizeLayout && <div ref={moreMenuRef} className="relative">
          <button
            type="button"
            onClick={() => setMoreMenuOpen((open) => !open)}
            className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[10px] font-black transition ${
              moreMenuOpen
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
            }`}
            aria-haspopup="menu"
            aria-expanded={moreMenuOpen}
            aria-controls={`query-more-menu-${query.id}`}
          >
            <MoreHorizontal size={14} />
            เพิ่มเติม
          </button>

          {moreMenuOpen && (
            <div
              id={`query-more-menu-${query.id}`}
              role="menu"
              className="absolute right-0 top-full z-50 mt-2 max-h-[min(32rem,70vh)] w-64 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-2 shadow-xl shadow-zinc-900/10"
            >
              <p className="px-2.5 pb-1 pt-1 text-[9px] font-black uppercase tracking-wider text-zinc-400">
                การแสดงผล
              </p>
              <button
                type="button"
                role="menuitem"
                onClick={() => runMoreAction(() => setModal("computed"))}
                disabled={!result}
                className={menuItemClass}
              >
                <Calculator size={14} /> เพิ่มคอลัมน์สูตร
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => runMoreAction(() => setModal("formats"))}
                disabled={!result}
                className={menuItemClass}
              >
                <Paintbrush
                  size={14}
                  className={
                    Object.keys(layout.formats).length || layout.freeze ? "text-red-600" : ""
                  }
                />
                รูปแบบคอลัมน์
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => runMoreAction(() => setModal("rules"))}
                disabled={!result}
                className={menuItemClass}
              >
                <Palette size={14} className={layout.rules.length ? "text-red-600" : ""} />
                สีตามเงื่อนไข
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => runMoreAction(() => setModal("chart"))}
                disabled={!result}
                className={menuItemClass}
              >
                <Play size={14} className="rotate-90" /> ตั้งค่ากราฟ
              </button>

              <div className="my-1 border-t border-zinc-100" />
              <p className="px-2.5 pb-1 pt-1 text-[9px] font-black uppercase tracking-wider text-zinc-400">
                ข้อมูล
              </p>
              <button
                type="button"
                role="menuitem"
                onClick={() => runMoreAction(() => setModal("merge"))}
                disabled={!result}
                className={menuItemClass}
              >
                <Combine size={14} className={layout.merge ? "text-red-600" : ""} />
                รวมกับ Query อื่น
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => runMoreAction(saveSnapshot)}
                disabled={!result || Boolean(viewingSnapshot)}
                className={menuItemClass}
              >
                <Camera size={14} /> บันทึกผลลัพธ์ย้อนหลัง
              </button>
              {snapshots.length > 0 && (
                <div className="px-2.5 py-1.5">
                  <label
                    htmlFor={`query-snapshot-${query.id}`}
                    className="mb-1 block text-[9px] font-black text-zinc-400"
                  >
                    ดูข้อมูลที่บันทึกไว้
                  </label>
                  <select
                    id={`query-snapshot-${query.id}`}
                    value={viewingSnapshot?.id ?? ""}
                    onChange={(event) => {
                      openSnapshot(event.target.value ? Number(event.target.value) : null);
                      setMoreMenuOpen(false);
                    }}
                    className="h-8 w-full rounded-lg border border-zinc-200 bg-white px-2 text-[10px] font-bold text-zinc-600 outline-none focus:border-red-500"
                  >
                    <option value="">ข้อมูลล่าสุด</option>
                    {snapshots.map((snapshot) => (
                      <option key={snapshot.id} value={snapshot.id}>
                        {snapshot.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {canManage && snapshots.length > 0 && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => runMoreAction(clearSnapshots)}
                  className={`${menuItemClass} text-red-600 hover:bg-red-50 hover:text-red-700`}
                >
                  <Trash2 size={14} />
                  {viewingSnapshot ? "ลบ snapshot ที่กำลังดู" : `ลบ snapshot ทั้งหมด (${snapshots.length})`}
                </button>
              )}

              {canManage && (
                <>
                  <div className="my-1 border-t border-zinc-100" />
                  <p className="px-2.5 pb-1 pt-1 text-[9px] font-black uppercase tracking-wider text-zinc-400">
                    จัดการ Query
                  </p>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => runMoreAction(() => setModal("params"))}
                    className={menuItemClass}
                  >
                    <SlidersHorizontal size={14} /> พารามิเตอร์
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => runMoreAction(() => setModal("drill"))}
                    disabled={!result}
                    className={menuItemClass}
                  >
                    <CornerDownRight size={14} className={layout.drill ? "text-red-600" : ""} />
                    เปิด Query อื่นจากแถว
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => runMoreAction(() => setModal("editable"))}
                    disabled={!result}
                    className={menuItemClass}
                  >
                    <Table2 size={14} className={layout.editable ? "text-red-600" : ""} />
                    ตั้งค่าการแก้ไขข้อมูล
                  </button>
                  {canEditCells && layout.editable.allowInsert && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => runMoreAction(() => setModal("newRow"))}
                      disabled={Boolean(viewingSnapshot)}
                      className={menuItemClass}
                    >
                      <Plus size={14} /> เพิ่มแถวใหม่
                    </button>
                  )}
                  {canEditCells && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => runMoreAction(() => setModal("bulk"))}
                      className={menuItemClass}
                    >
                      <ClipboardPaste size={14} /> แก้หลายแถวจาก Excel
                    </button>
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => runMoreAction(onEditQuery)}
                    className={menuItemClass}
                  >
                    <Pencil size={14} /> แก้ไข Query
                  </button>
                </>
              )}

            </div>
          )}
        </div>}

        {canCustomizeLayout && <button type="button" onClick={onToggleFullWidth} className={iconButtonClass} title={isFullWidth ? "คืนความกว้างอัตโนมัติ" : "ขยายเต็มความกว้าง"}>
          {isFullWidth ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        </button>}
        {canCustomizeLayout && <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 transition hover:bg-red-50 hover:text-red-600"
          title="ปิดตารางนี้"
        >
          <X size={13} />
        </button>}
      </div>

      {!panel.collapsed && (
        <>
          {effectiveParams.length > 0 && (
            <div className="flex flex-wrap items-end gap-2 border-b border-zinc-100 bg-zinc-50/60 px-3 py-2">
              <div className="flex w-full flex-wrap items-center justify-between gap-2 pb-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 text-[10px] font-black text-zinc-500">ตัวกรอง Query</span>
                  {dateRangeParams && (
                    <>
                      <button type="button" onClick={() => applyDateRangePreset("today")} className={paramPresetButtonClass}>
                        วันนี้
                      </button>
                      <button type="button" onClick={() => applyDateRangePreset("yesterday")} className={paramPresetButtonClass}>
                        เมื่อวาน
                      </button>
                      <button type="button" onClick={() => applyDateRangePreset("last7")} className={paramPresetButtonClass}>
                        7 วันล่าสุด
                      </button>
                      <button type="button" onClick={() => applyDateRangePreset("thisMonth")} className={paramPresetButtonClass}>
                        เดือนนี้
                      </button>
                      <button type="button" onClick={() => applyDateRangePreset("previousMonth")} className={paramPresetButtonClass}>
                        เดือนก่อน
                      </button>
                    </>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[9px] font-semibold text-zinc-400">
                    จำค่าล่าสุดใน browser นี้
                  </span>
                  <button type="button" onClick={resetParamValues} className={paramPresetButtonClass}>
                    คืนค่าเริ่มต้น
                  </button>
                  <button type="button" onClick={clearParamValues} className={paramPresetButtonClass}>
                    ล้างทั้งหมด
                  </button>
                </div>
              </div>
              {effectiveParams.map((param) => {
                const guide = paramInputGuide(param);
                const inputId = `query-${query.id}-param-${param.name}`;
                const hintId = `${inputId}-hint`;
                const errorId = `${inputId}-error`;
                const error = showParamErrors ? paramErrors[param.name] : "";
                return (
                  <div key={param.name}>
                    <label
                      htmlFor={inputId}
                      className="mb-0.5 block text-[9px] font-black text-zinc-500"
                    >
                      {param.label}{" "}
                      {param.required !== false ? (
                        <span className="text-red-500">*</span>
                      ) : (
                        <span className="font-semibold text-zinc-400">(ไม่บังคับ)</span>
                      )}
                    </label>
                    {param.type === "boolean" ? (
                      <button
                        id={inputId}
                        type="button"
                        role="switch"
                        aria-checked={(paramValues[param.name] ?? "false") === "true"}
                        onClick={() =>
                          setParamValues((prev) => ({
                            ...prev,
                            [param.name]:
                              (prev[param.name] ?? "false") === "true" ? "false" : "true",
                          }))
                        }
                        className={`flex h-8 min-w-28 items-center gap-2 rounded-lg border px-2 text-[11px] font-black transition ${
                          (paramValues[param.name] ?? "false") === "true"
                            ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                            : "border-zinc-200 bg-white text-zinc-500"
                        }`}
                      >
                        <span
                          className={`relative h-4 w-7 rounded-full transition ${
                            (paramValues[param.name] ?? "false") === "true"
                              ? "bg-emerald-500"
                              : "bg-zinc-300"
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition ${
                              (paramValues[param.name] ?? "false") === "true"
                                ? "left-3.5"
                                : "left-0.5"
                            }`}
                          />
                        </span>
                        {(paramValues[param.name] ?? "false") === "true" ? "ใช่" : "ไม่ใช่"}
                      </button>
                    ) : param.type === "select" ? (
                      <select
                        id={inputId}
                        value={paramValues[param.name] ?? ""}
                        onChange={(e) =>
                          setParamValues((prev) => ({ ...prev, [param.name]: e.target.value }))
                        }
                        aria-invalid={Boolean(error)}
                        aria-describedby={error ? errorId : hintId}
                        className={`h-8 min-w-40 rounded-lg border bg-white px-2 text-[11px] font-semibold outline-none ${
                          error
                            ? "border-red-400 bg-red-50/50 focus:border-red-600"
                            : "border-zinc-200 focus:border-red-600"
                        }`}
                      >
                        <option value="">— เลือกค่า —</option>
                        {param.options.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id={inputId}
                        type={guide.inputType}
                        step={["datetime", "time"].includes(param.type) ? 1 : undefined}
                        value={paramValues[param.name] ?? ""}
                        onChange={(e) =>
                          setParamValues((prev) => ({ ...prev, [param.name]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") runQuery({ validate: true });
                        }}
                        placeholder={guide.placeholder}
                        aria-invalid={Boolean(error)}
                        aria-describedby={error ? errorId : hintId}
                        className={`h-8 ${guide.widthClass} rounded-lg border bg-white px-2 text-[11px] font-semibold outline-none placeholder:text-zinc-300 ${
                          error
                            ? "border-red-400 bg-red-50/50 focus:border-red-600"
                            : "border-zinc-200 focus:border-red-600"
                        }`}
                      />
                    )}
                    {!dateRangeParams && ["date", "datetime"].includes(guide.kind) && (
                      <div className="mt-1 flex gap-1">
                        <button type="button" onClick={() => applySingleDatePreset(param, "today")} className={paramPresetButtonClass}>
                          วันนี้
                        </button>
                        <button type="button" onClick={() => applySingleDatePreset(param, "yesterday")} className={paramPresetButtonClass}>
                          เมื่อวาน
                        </button>
                      </div>
                    )}
                    {error ? (
                      <p id={errorId} className="mt-1 max-w-52 text-[9px] font-bold text-red-600">
                        {error}
                      </p>
                    ) : (
                      <p id={hintId} className="mt-1 max-w-52 text-[9px] font-semibold text-zinc-400">
                        {param.type === "select" ? "เลือก 1 ค่าจากรายการ" : guide.hint}
                      </p>
                    )}
                  </div>
                );
              })}
              <button
                type="button"
                onClick={() => runQuery({ validate: true })}
                disabled={running}
                className="flex h-8 items-center gap-1.5 rounded-lg bg-zinc-800 px-3 text-[11px] font-black text-white transition hover:bg-zinc-900 disabled:opacity-50"
              >
                <Play size={11} /> ใช้ค่านี้
              </button>
            </div>
          )}

          {canCustomizeLayout && hiddenColumns.length > 0 && (
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

          {viewingSnapshot && (
            <div className="flex items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2">
              <p className="truncate text-[11px] font-bold text-amber-800">
                กำลังดู snapshot &quot;{viewingSnapshot.name}&quot; ·{" "}
                {new Date(viewingSnapshot.createdAt).toLocaleString("th-TH")} · ข้อมูลนี้ไม่อัปเดต
              </p>
              <button
                type="button"
                onClick={() => openSnapshot(null)}
                className="shrink-0 rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-[10px] font-black text-amber-800 transition hover:bg-amber-100"
              >
                กลับไปข้อมูลล่าสุด
              </button>
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
          ) : Object.keys(paramErrors).length > 0 && !result ? (
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
                  canCustomizeLayout={canCustomizeLayout}
                  height={panel.height}
                  canEdit={canEditCells}
                  editableColumns={editableColumns}
                  lookupOptions={lookupOptions}
                  editPending={editPending}
                  onEditCell={editCell}
                  changedKeys={changedCellKeys}
                  onDeleteRow={
                    canEditCells && layout.editable.allowDelete && !viewingSnapshot
                      ? deleteRow
                      : null
                  }
                  onDrill={layout.drill && onDrill ? drillRow : null}
                  drillLabel={`เปิด ${
                    queries.find((item) => item.id === layout.drill?.queryId)?.name || "Query"
                  } ด้วยค่าจากแถวนี้`}
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

            </>
          ) : null}
        </>
      )}

      {canCustomizeLayout && FRAME_HANDLES.filter((handle) => !panel.collapsed || handle.dirY === 0).map((handle) => (
        <span
          key={handle.key}
          onPointerDown={(event) => startFrameResize(event, handle.dirX, handle.dirY)}
          onDoubleClick={() => resetFrame(handle.dirX, handle.dirY)}
          className={`group absolute z-40 touch-none ${handle.className}`}
          style={{ cursor: frameCursor(handle.dirX, handle.dirY) }}
          title={RESIZE_HINT}
        >
          <span
            className={`pointer-events-none absolute transition-opacity ${
              frameSelected || frameDrag || panelDrag
                ? "opacity-100"
                : "opacity-0 group-hover:opacity-100"
            } ${handle.markerClass}`}
          />
        </span>
      ))}

      {modal === "computed" && result && (
        <ComputedColumnModal
          availableNames={[...new Set(result.columns.map((col) => col.name))]}
          // The first row, so the editor can show what the formula produces
          // before the column exists.
          sampleRow={
            result.rows.length
              ? Object.fromEntries(
                  [...baseNameToIndex.entries()].map(([name, index]) => [
                    name,
                    result.rows[0][index],
                  ])
                )
              : null
          }
          onClose={() => setModal(null)}
          onAdd={({ label, formula, type }) => {
            const key = `calc_${Date.now()}`;
            mutateLayout((prev) => ({
              ...prev,
              computed: [...prev.computed, { key, label, formula, type }],
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
      {modal === "drill" && result && (
        <DrillModal
          query={query}
          queries={queries}
          columnNames={result.columns.map((col) => col.name)}
          drill={layout.drill}
          onClose={() => setModal(null)}
          onSave={(drill) => {
            mutateLayout((prev) => ({ ...prev, drill }));
            setModal(null);
          }}
        />
      )}
      {modal === "newRow" && result && layout.editable && (
        <NewRowModal
          editable={layout.editable}
          lookupOptions={lookupOptions}
          resultColumns={result.columns}
          onSubmit={insertRow}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "bulk" && result && layout.editable && (
        <BulkEditModal
          editable={layout.editable}
          columnNames={result.columns.map((col) => col.name)}
          onApply={applyBulkEdits}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "formats" && result && (
        <FormatsModal
          columns={visibleColumns}
          formats={layout.formats}
          freeze={layout.freeze}
          onClose={() => setModal(null)}
          onSave={({ formats, freeze }) => {
            mutateLayout((prev) => ({ ...prev, formats, freeze }));
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
