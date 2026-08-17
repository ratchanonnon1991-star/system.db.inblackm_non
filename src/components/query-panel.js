"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BookmarkPlus,
  Calculator,
  Camera,
  ChartColumn,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  Combine,
  CornerDownRight,
  Copy,
  ChevronUp,
  Download,
  Eye,
  GripVertical,
  History,
  Link2,
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
  Eraser,
  Search,
  ChevronsLeft,
  ChevronsRight,
  SlidersHorizontal,
  Sigma,
  Table2,
  Timer,
  Trash2,
  Undo2,
  User,
  Save,
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
  MAX_LOOKUPS,
  mergeKeyOf,
  normalizeLayout,
  REFRESH_CHOICES,
  resolveInputDefault,
  rowsToCsv,
  summarize,
  SUMMARY_LABELS,
  toneStyle,
  widgetForColumn,
  writeTargetFor,
} from "@/lib/gamedb-layout";
import { isKeyOnlyColumn } from "@/lib/gamedb-sql-sources";
import { ComputedColumnModal } from "@/components/gamedb-modals";
import {
  BulkEditModal,
  ChartModal,
  DrillModal,
  EditableSettingsModal,
  FindReplaceModal,
  FormatsModal,
  LookupsListModal,
  MergeModal,
  ParamsSettingsModal,
  InsertFormModal,
  InsertRunModal,
  RulesModal,
  ShareLinkModal,
} from "@/components/panel-config-modals";
import PanelTable from "@/components/panel-table";
import SearchableSelect from "@/components/searchable-select";
import PanelChart from "@/components/panel-chart";
import ModalResizeHandle from "@/components/modal-resize-handle";
import { useResizableModalWidth } from "@/lib/use-resizable-modal-width";

// One shared empty object, so a panel with no lookup fields does not hand its
// children a new identity on every render.
const NO_LOOKUPS = {};

const iconButtonClass =
  "flex h-8 w-8 items-center justify-center rounded-sm border border-zinc-200 text-zinc-500 transition hover:bg-zinc-50 hover:text-zinc-700 disabled:opacity-40";

const menuItemClass =
  "flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-[11px] font-bold text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-40";

const paramPresetButtonClass =
  "rounded-sm border border-zinc-200 bg-white px-2 py-1 text-[9px] font-black text-zinc-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 200];

function PaginationBar({ rowCount, page, pageCount, pageSize, tableTone, onPageChange, onPageSizeChange }) {
  const first = rowCount ? (page - 1) * pageSize + 1 : 0;
  const last = Math.min(rowCount, page * pageSize);
  const buttonClass =
    "flex h-7 w-7 items-center justify-center rounded-sm border border-zinc-200 bg-white text-zinc-500 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-35";

  return (
    <div
      className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-zinc-100 bg-zinc-50 px-3 py-1.5 text-[10px] font-semibold text-zinc-500"
      style={toneStyle(tableTone) || undefined}
    >
      <span>
        แสดง {first.toLocaleString("th-TH")}-{last.toLocaleString("th-TH")} จาก {rowCount.toLocaleString("th-TH")} แถว
      </span>
      <div className="flex items-center gap-1.5">
        <label className="flex items-center gap-1">
          ต่อหน้า
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className="h-7 rounded-sm border border-zinc-200 bg-white px-1.5 font-bold outline-none focus:border-red-500"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => onPageChange(1)} disabled={page === 1} className={buttonClass} title="หน้าแรก">
          <ChevronsLeft size={13} />
        </button>
        <button type="button" onClick={() => onPageChange(page - 1)} disabled={page === 1} className={buttonClass} title="หน้าก่อนหน้า">
          <ChevronLeft size={13} />
        </button>
        <span className="min-w-16 text-center font-bold text-zinc-600">{page}/{pageCount}</span>
        <button type="button" onClick={() => onPageChange(page + 1)} disabled={page === pageCount} className={buttonClass} title="หน้าถัดไป">
          <ChevronRight size={13} />
        </button>
        <button type="button" onClick={() => onPageChange(pageCount)} disabled={page === pageCount} className={buttonClass} title="หน้าสุดท้าย">
          <ChevronsRight size={13} />
        </button>
      </div>
    </div>
  );
}

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
function resolveParams(layout, paramNames) {
  const configured = new Map(layout.params.map((param) => [param.name, param]));
  return paramNames.map(
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
  onSharedLayoutSaved,
  onLayoutChange,
  onDataChange,
  canManage,
  canCustomizeLayout,
  canWriteData,
  canUpdateData,
  // The template this panel is being viewed through, if any -- write
  // requests carry it so the server can check the template's own
  // allowStaffEdit/allowUserEdit grant, not just the account's. null when
  // browsing a query directly (e.g. plain /systemdb), where the account-level
  // grant alone has always decided.
  activeViewId = null,
  isFullWidth,
  isSelected,
  workspaceToolbar,
  onSelect,
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
  onDuplicateQuery,
  onDrill,
  initialParams,
  // In the sheet view the panel is the page: it sits in the flow at full width
  // and has no position or frame of its own to drag.
  docked = false,
  canClose = true,
  // A public link renders this same panel, so it reads through the share route
  // instead of the signed-in one. Everything the token does not cover is off
  // through canManage/canCustomizeLayout, not through this flag.
  shareToken = null,
}) {
  const runUrl = shareToken
    ? `/api/share/${shareToken}/run`
    : `/api/queries/${query.id}/run`;
  // A shared query carries its placeholder names with it; the SQL they came
  // from stays on the server.
  const paramNames = useMemo(
    () => query.paramNames || extractSqlParams(query.sqlText || ""),
    [query.paramNames, query.sqlText]
  );
  // Layout precedence: what this user saved for themselves, then what a screen
  // template dictates, then the shared layout stored on the query.
  const savedLayout = useMemo(
    () => normalizeLayout(personalLayout || layoutOverride || query.layout),
    [personalLayout, layoutOverride, query.layout]
  );
  const hasOverride = Boolean(personalLayout || layoutOverride);
  const savedParams = useMemo(
    () => resolveParams(savedLayout, paramNames),
    [savedLayout, paramNames]
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
  // Ticked values per column, the way an AutoFilter works in a spreadsheet.
  // Per-browser like rowFilter -- looking at a subset is not a layout change,
  // so it never gets saved to the query for everyone else.
  const [columnValueFilters, setColumnValueFilters] = useState({});
  // A per-browser view of the current result, same as rowFilter -- not part of
  // layout, so it resets on reload rather than surviving as a saved setting
  // nobody remembers turning on.
  const [lookupRowFilter, setLookupRowFilter] = useState(null); // { lookupId, matched } | null
  const [selectedFilterViewId, setSelectedFilterViewId] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [view, setView] = useState("table");
  const [modal, setModal] = useState(null);
  const [modalColumnId, setModalColumnId] = useState(null);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef(null);
  const [changedKeys, setChangedKeys] = useState(new Set());
  const [editPending, setEditPending] = useState(null);
  const [editError, setEditError] = useState("");
  // The last cell edit, kept just long enough to offer it back. Editing a
  // database by hand is the scariest thing a non-technical account does here,
  // and "there is no way back" is what stops people using it at all -- so
  // every write leaves a way to put the old value back, the way Ctrl+Z does
  // in a spreadsheet. Cleared on a timer so it can never be mistaken for a
  // permanent history (that is what the log page is for).
  const [lastEdit, setLastEdit] = useState(null);
  const [undoing, setUndoing] = useState(false);
  const [rowHistory, setRowHistory] = useState(null);
  // A row being filled in cell by cell before it exists anywhere -- null
  // means no draft is open, {} means one is open but still blank.
  const [draftRow, setDraftRow] = useState(null);
  const [draftSaving, setDraftSaving] = useState(false);
  // What the draft started as (a date column may start pre-filled with
  // today) -- "touched" compares against this, not against blank, so
  // cancelling an untouched auto-filled draft doesn't ask to confirm.
  const draftInitialRef = useRef({});
  const { width: paramsModalWidth, startResize: startParamsModalResize, resizing: paramsModalResizing } =
    useResizableModalWidth(672);

  const effectiveParams = useMemo(
    () => resolveParams(layout, paramNames),
    [layout, paramNames]
  );

  // "select" params can be set to fill their dropdown in from a table/column
  // instead of an admin typing every value by hand -- fetched lazily, only
  // once, only when a param actually needs it.
  const columnSourcedParamNames = useMemo(
    () =>
      effectiveParams
        .filter((param) => param.type === "select" && param.optionsSource === "column")
        .map((param) => param.name),
    [effectiveParams]
  );
  const [columnParamOptions, setColumnParamOptions] = useState({});
  const [columnParamOptionsLoading, setColumnParamOptionsLoading] = useState(false);
  const columnParamOptionsLoadedForRef = useRef(null);
  useEffect(() => {
    if (columnSourcedParamNames.length === 0) return;
    if (columnParamOptionsLoadedForRef.current === query.id) return;
    columnParamOptionsLoadedForRef.current = query.id;
    (async () => {
      setColumnParamOptionsLoading(true);
      try {
        const data = await apiJson(`/api/queries/${query.id}/param-options`, {
          fallbackError: "โหลดตัวเลือกจากคอลัมน์ไม่สำเร็จ",
        });
        setColumnParamOptions(data.options || {});
      } catch {
        setColumnParamOptions({});
      } finally {
        setColumnParamOptionsLoading(false);
      }
    })();
  }, [columnSourcedParamNames.length, query.id]);

  const resolvedParams = useMemo(
    () =>
      effectiveParams.map((param) =>
        param.type === "select" && param.optionsSource === "column"
          ? { ...param, options: columnParamOptions[param.name] || [] }
          : param
      ),
    [effectiveParams, columnParamOptions]
  );

  const paramErrors = useMemo(
    () => validateParamValues(resolvedParams, paramValues),
    [resolvedParams, paramValues]
  );
  const dateRangeParams = useMemo(
    () => findDateRangeParams(effectiveParams),
    [effectiveParams]
  );

  // The params bar is now a modal an "Input" button opens rather than a
  // permanent strip across the top of every panel with any (it used to cover
  // the table underneath on a narrow panel). Something still has to prompt a
  // first-time visitor to open it, though, so it opens itself once on mount
  // if there is nothing to show yet and a required value is missing --
  // never again after that, so filling it in and closing it does not pop
  // it back open on the next re-render.
  const autoOpenedParamsModalRef = useRef(false);
  useEffect(() => {
    if (autoOpenedParamsModalRef.current) return;
    if (effectiveParams.length === 0) return;
    autoOpenedParamsModalRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot prompt on mount, not a live sync
    if (!result && Object.keys(paramErrors).length > 0) setModal("paramsInput");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot check on mount, not a live sync
  }, []);

  // runQuery must not be rebuilt whenever a parameter input changes, or the
  // effect below would re-run the query on every keystroke.
  const paramsRef = useRef(paramValues);
  const paramErrorsRef = useRef(paramErrors);
  // Snapshot of the rows the panel is currently showing, used to highlight what
  // an auto-refresh changed.
  const previousRowsRef = useRef(null);
  // The result column that identifies a row, so that refresh diff can match rows
  // by identity rather than by position. A ref because the query runner is set up
  // long before the edit config is read.
  const pkNameRef = useRef("");
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

  // The table can fill this area with CSS, while the hand-drawn SVG chart
  // needs an actual pixel height for its scale calculations.
  const dockedBodyRef = useRef(null);
  const [dockedChartHeight, setDockedChartHeight] = useState(320);
  useEffect(() => {
    if (!docked || !dockedBodyRef.current) return undefined;
    const element = dockedBodyRef.current;
    const measure = () => {
      const height = Math.round(element.getBoundingClientRect().height);
      if (height > 0) setDockedChartHeight(height);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [docked]);

  const appliedDrillRef = useRef(null);

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
    // Applied on the way in, so the drill effect below has nothing left to do
    // and the first run is not issued twice.
    appliedDrillRef.current = initialParams || null;
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
        const data = await apiJson(runUrl, {
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
        if (previous && previous.columns.length === data.columns.length) {
          // Keyed by display-column id, which is how the table addresses a cell.
          const columnIds = baseColumnIds(data.columns);
          // Match rows by their key, not by where they sit. A query with no total
          // ordering -- or one ordered by the very column that was just edited --
          // hands back the same rows in another order, and comparing position to
          // position then paints most of the table as changed.
          const keyIndex = pkNameRef.current
            ? data.columns.findIndex((col) => col.name === pkNameRef.current)
            : -1;
          const before =
            keyIndex >= 0
              ? new Map(previous.rows.map((row) => [String(row[keyIndex]), row]))
              : null;
          const keys = new Set();
          if (before) {
            data.rows.forEach((row, rowIndex) => {
              const was = before.get(String(row[keyIndex]));
              // A row that was not there before is new, not changed.
              if (!was) return;
              row.forEach((value, colIndex) => {
                if (String(was[colIndex]) !== String(value)) {
                  keys.add(`${rowIndex}:${columnIds[colIndex]}`);
                }
              });
            });
          } else if (previous.rows.length === data.rows.length) {
            // No key to match on, so position is all there is.
            data.rows.forEach((row, rowIndex) => {
              row.forEach((value, colIndex) => {
                if (String(previous.rows[rowIndex][colIndex]) !== String(value)) {
                  keys.add(`${rowIndex}:${columnIds[colIndex]}`);
                }
              });
            });
          }
          if (keys.size) setChangedKeys(keys);
        }
        previousRowsRef.current = { columns: data.columns, rows: data.rows };
        rowsLoadedRef.current = data.rows.length;
        setResult(data);
        if (!silent) setPage(1);
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
    [query.id, runUrl]
  );

  useEffect(() => {
    if (!paramStorageReady) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setState happens after the run request resolves
    runQuery();
  }, [paramStorageReady, runQuery]);

  // Drilling into a panel that is already open cannot rely on the mount-time
  // defaults, because the panel never unmounts. Every drill hands over a fresh
  // object, so its identity is what marks a set of values as not yet applied.
  useEffect(() => {
    if (!initialParams || appliedDrillRef.current === initialParams) return;
    appliedDrillRef.current = initialParams;
    const incoming = {};
    for (const [name, value] of Object.entries(initialParams)) {
      incoming[name] = value === null || value === undefined ? "" : String(value);
    }
    const next = { ...paramsRef.current, ...incoming };
    // runQuery reads the values through these refs, and the effect that syncs
    // them has not run yet at this point, so they are updated here too.
    paramsRef.current = next;
    paramErrorsRef.current = validateParamValues(effectiveParams, next);
    setParamValues(next);
    if (paramStorageReady) runQuery();
  }, [effectiveParams, initialParams, paramStorageReady, runQuery]);

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

  const openColumnModal = (kind, column) => {
    setModalColumnId(column.id);
    setModal(kind);
  };

  const closeColumnModal = () => {
    setModalColumnId(null);
    setModal(null);
  };

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
    // The rows on screen were fetched with the values that were just thrown
    // away, so keeping them would show a table that no filter accounts for.
    setResult(null);
    setPage(1);
    setRunError("");
    setChangedKeys(new Set());
    previousRowsRef.current = null;
    rowsLoadedRef.current = 0;
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

  const baseNameToIndex = useMemo(() => {
    const map = new Map();
    (result?.columns || []).forEach((col, index) => {
      if (!map.has(col.name)) map.set(col.name, index);
    });
    return map;
  }, [result]);

  // --- lookups: pull columns in from other queries --------------------------
  // Up to MAX_LOOKUPS queries run alongside this one, each joined in by its own
  // key columns. A layout saved before lookups existed has a single `merge`
  // instead, which `normalizeLayout` already reads as a one-item lookups list,
  // so nothing here needs to know the difference. Named `mergeSource*` rather
  // than `lookup*` because that name is already taken by the FK dropdowns an
  // editable cell can read from -- unrelated feature, same word.
  const [mergeSourceResults, setMergeSourceResults] = useState({});

  useEffect(() => {
    if (layout.lookups.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing state this effect owns when the last lookup is removed
      setMergeSourceResults({});
      return undefined;
    }
    let cancelled = false;
    const requests = layout.lookups.map((lookup) =>
      // Through a share link the pulled-in table is resolved from the shared
      // query's own layout on the server, so the id never travels.
      apiJson(shareToken ? `/api/share/${shareToken}/run` : `/api/queries/${lookup.queryId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(shareToken ? { merge: true, lookupId: lookup.id } : { params: {} }),
        fallbackError: "ดึงข้อมูลของ Query ที่ดึงมาไม่สำเร็จ",
      })
        .then((data) => ({ id: lookup.id, data, error: "" }))
        .catch((err) => ({ id: lookup.id, data: null, error: err.message }))
    );
    Promise.all(requests).then((results) => {
      if (cancelled) return;
      setMergeSourceResults(Object.fromEntries(results.map((item) => [item.id, item])));
    });
    return () => {
      cancelled = true;
    };
    // Re-run alongside this panel so a refresh pulls every source again.
  }, [layout.lookups, lastRunAt, shareToken]);

  // One index per lookup: its join key -> the matching row of that query.
  const mergeSourceIndexes = useMemo(() => {
    const indexes = {};
    for (const lookup of layout.lookups) {
      const data = mergeSourceResults[lookup.id]?.data;
      if (!data) continue;
      const nameToIndex = new Map(data.columns.map((col, index) => [col.name, index]));
      const rightKeyIndexes = lookup.on.map((pair) => nameToIndex.get(pair.right));
      if (rightKeyIndexes.some((index) => index === undefined)) continue;
      const byKey = new Map();
      for (const row of data.rows) {
        const key = mergeKeyOf(rightKeyIndexes.map((index) => row[index]));
        if (!byKey.has(key)) byKey.set(key, row);
      }
      indexes[lookup.id] = { byKey, nameToIndex };
    }
    return indexes;
  }, [layout.lookups, mergeSourceResults]);

  // The base result's key column for each lookup, resolved once instead of on
  // every row: `on` names a column, not a position, and that mapping does not
  // change from row to row.
  const mergeSourceKeyIndexes = useMemo(() => {
    const indexes = {};
    for (const lookup of layout.lookups) {
      indexes[lookup.id] = lookup.on.map((pair) => baseNameToIndex.get(pair.left));
    }
    return indexes;
  }, [layout.lookups, baseNameToIndex]);

  const mergedColumns = useMemo(() => {
    const columns = [];
    for (const lookup of layout.lookups) {
      const index = mergeSourceIndexes[lookup.id];
      const data = mergeSourceResults[lookup.id]?.data;
      if (!index || !data) continue;
      // The label already carries the source query's name, which is what
      // keeps two lookups pulling a same-named column from colliding both on
      // screen and as a formula ref -- `[ราคาทุน · ราคาทุนสินค้า]` reads as
      // one thing even though "ราคาทุน" alone might not be unique.
      const targetName = queries.find((item) => item.id === lookup.queryId)?.name || "";
      const suffix = targetName ? ` · ${targetName}` : "";
      for (const name of lookup.columns) {
        if (!index.nameToIndex.has(name)) continue;
        columns.push({
          id: `~${lookup.id}:${name}`,
          label: `${name}${suffix}`,
          type: data.columns[index.nameToIndex.get(name)].type,
          kind: "merged",
          lookupId: lookup.id,
          source: name,
        });
      }
      for (const pair of lookup.compare) {
        if (!index.nameToIndex.has(pair.right)) continue;
        columns.push({
          id: `?${lookup.id}:${pair.left}|${pair.right}`,
          label: `${pair.left} = ${pair.right}?${suffix}`,
          type: "text",
          kind: "compare",
          lookupId: lookup.id,
          pair,
        });
      }
    }
    return columns;
  }, [layout.lookups, mergeSourceIndexes, mergeSourceResults, queries]);
  // Looked up once per render, not once per row: a formula's `[name]` is
  // matched against this the same way `baseNameToIndex` matches a base column.
  const mergedColumnsByLabel = useMemo(
    () => new Map(mergedColumns.map((col) => [col.label, col])),
    [mergedColumns]
  );

  const displayColumns = useMemo(
    () => (result ? buildDisplayColumns(result.columns, layout, mergedColumns) : []),
    [result, layout, mergedColumns]
  );
  // A formula can reference another formula column by its (possibly renamed)
  // label, same as it references a base or a merged-in column. Built from
  // every computed column regardless of hidden state, matching how a hidden
  // base column stays referenceable too.
  const computedColumnsByLabel = useMemo(
    () => new Map(displayColumns.filter((col) => col.kind === "computed").map((col) => [col.label, col])),
    [displayColumns]
  );
  const visibleColumns = useMemo(
    () =>
      displayColumns.filter(
        (col) =>
          !layout.hidden.includes(col.id) &&
          // Key columns the query editor added so a joined table could be
          // edited. They carry no information for a reader -- only the row
          // identity the write needs -- so they are not something anyone
          // should have to hide, or be able to un-hide by mistake.
          !(col.kind === "base" && isKeyOnlyColumn(col.column.name))
      ),
    [displayColumns, layout.hidden]
  );
  const hiddenColumns = useMemo(
    () => displayColumns.filter((col) => layout.hidden.includes(col.id)),
    [displayColumns, layout.hidden]
  );
  const modalComputedColumn = useMemo(() => {
    if (!modalColumnId) return null;
    const item = layout.computed.find((column) => `#${column.key}` === modalColumnId);
    if (!item) return null;
    return {
      ...item,
      label: displayColumns.find((column) => column.id === modalColumnId)?.label || item.label,
    };
  }, [displayColumns, layout.computed, modalColumnId]);

  // Every lookup with a ready index and a fully-resolved key can match a row
  // this refresh; one still loading, or referencing a column the query no
  // longer has, sits out rather than reporting every row as unmatched.
  const activeLookups = useMemo(
    () =>
      layout.lookups.filter((lookup) => {
        const index = mergeSourceIndexes[lookup.id];
        const keyIndexes = mergeSourceKeyIndexes[lookup.id];
        return index && keyIndexes.every((keyIndex) => keyIndex !== undefined);
      }),
    [layout.lookups, mergeSourceIndexes, mergeSourceKeyIndexes]
  );
  const computePartners = useCallback(
    (row) => {
      const partners = {};
      for (const lookup of activeLookups) {
        const keyIndexes = mergeSourceKeyIndexes[lookup.id];
        partners[lookup.id] = mergeSourceIndexes[lookup.id].byKey.get(
          mergeKeyOf(keyIndexes.map((index) => row[index]))
        );
      }
      return partners;
    },
    [activeLookups, mergeSourceIndexes, mergeSourceKeyIndexes]
  );
  // Raw, not coerced: the formula engine decides whether it wanted a number, a
  // date or text, and a column of dates is none of the three until it is
  // asked for. Base columns resolve by name first; a lookup's brought-in or
  // compare column only exists under its (already disambiguated) label, so
  // that is tried second, and another formula column's own label third.
  // Shared with the formula editor's own preview, so a formula referencing a
  // lookup or another formula previews the same value it will run.
  //
  // `visiting` threads through the recursion into a formula column's own
  // refs, not across separate top-level calls -- a cycle (A reads B, B reads
  // A) breaks at whichever ref closes the loop by resolving to null there,
  // same as any other ref this engine cannot satisfy.
  // A named function declaration, not a memoized callback: it calls itself by
  // name to walk a chain of formula-to-formula refs, and a self-reference
  // inside a useCallback closure is exactly the pattern the React Compiler
  // cannot safely memoize. Re-created every render like any other closure
  // over these values -- displayRows below lists what it actually reads.
  function resolveRowRef(row, partners, name, visiting) {
    const baseIndex = baseNameToIndex.get(name);
    if (baseIndex !== undefined) return row[baseIndex];
    const mergedCol = mergedColumnsByLabel.get(name);
    if (mergedCol) {
      const partner = partners[mergedCol.lookupId];
      const index = mergeSourceIndexes[mergedCol.lookupId];
      if (mergedCol.kind === "merged") {
        return partner ? partner[index.nameToIndex.get(mergedCol.source)] : null;
      }
      if (mergedCol.kind === "compare") {
        if (!partner) return null;
        const left = row[baseNameToIndex.get(mergedCol.pair.left)];
        const right = partner[index.nameToIndex.get(mergedCol.pair.right)];
        return cellsEqual(left, right) ? 1 : 0;
      }
      return null;
    }
    const computedCol = computedColumnsByLabel.get(name);
    if (computedCol) {
      if (!computedCol.ast) return null;
      const chain = visiting || new Set();
      if (chain.has(name)) return null;
      chain.add(name);
      return evaluateFormula(computedCol.ast, (ref) => resolveRowRef(row, partners, ref, chain));
    }
    return null;
  }

  // Every row with its cells worked out, before any filtering. Kept separate
  // from displayRows so the header filter can offer every value a column
  // actually holds -- not just the ones that survived the filters already on.
  const mappedRows = useMemo(() => {
    if (!result) return [];
    return result.rows.map((row, sourceIndex) => {
      const partners = computePartners(row);
      const resolveRef = (name) => resolveRowRef(row, partners, name);

      return {
        sourceIndex,
        matchedByLookup: Object.fromEntries(
          activeLookups.map((lookup) => [lookup.id, Boolean(partners[lookup.id])])
        ),
        cells: visibleColumns.map((col) => {
          if (col.kind === "base") {
            // By position: two columns can share a name, and then a lookup by
            // name hands both of them the same value.
            const raw = row[col.index];
            return { raw, text: formatCell(raw, col.type) };
          }
          if (col.kind === "merged") {
            const partner = partners[col.lookupId];
            const raw = partner ? partner[mergeSourceIndexes[col.lookupId].nameToIndex.get(col.source)] : null;
            return { raw, text: partner ? formatCell(raw, col.type) : "ไม่พบคู่" };
          }
          if (col.kind === "compare") {
            const partner = partners[col.lookupId];
            if (!partner) return { raw: null, text: "ไม่พบคู่" };
            const left = row[baseNameToIndex.get(col.pair.left)];
            const right = partner[mergeSourceIndexes[col.lookupId].nameToIndex.get(col.pair.right)];
            const same = cellsEqual(left, right);
            return { raw: same ? 1 : 0, text: same ? "✓ ตรงกัน" : "✗ ต่างกัน" };
          }
          if (!col.ast) return { raw: null, text: "สูตรผิด" };
          const value = evaluateFormula(col.ast, resolveRef);
          return { raw: value, text: formatCell(value, col.type) };
        }),
      };
    });
    // resolveRowRef is a plain function, not a hook value -- it closes over
    // exactly the entries already listed below, so depending on it directly
    // would recompute every render instead of only when one of those changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    result,
    visibleColumns,
    baseNameToIndex,
    mergeSourceIndexes,
    mergedColumnsByLabel,
    computedColumnsByLabel,
    activeLookups,
    computePartners,
  ]);

  // Every distinct value each column holds, for the tick-list in its header.
  const columnValueOptions = useMemo(() => {
    const byColumn = visibleColumns.map(() => new Set());
    for (const row of mappedRows) {
      row.cells.forEach((cell, index) => byColumn[index]?.add(cell.text));
    }
    return Object.fromEntries(
      visibleColumns.map((col, index) => [
        col.id,
        [...byColumn[index]].sort((a, b) => a.localeCompare(b, "th")),
      ])
    );
  }, [mappedRows, visibleColumns]);

  const activeColumnFilterIds = useMemo(
    () => Object.keys(columnValueFilters).filter((colId) => columnValueFilters[colId]?.length),
    [columnValueFilters]
  );

  const displayRows = useMemo(() => {
    if (!result) return [];
    let rows = mappedRows;

    // Ticking values in a column header keeps only rows holding one of them.
    // Several columns filtered at once all have to match, the way stacked
    // AutoFilters behave in a spreadsheet.
    const activeColumnFilters = Object.entries(columnValueFilters).filter(
      ([, values]) => values?.length
    );
    if (activeColumnFilters.length) {
      const plan = activeColumnFilters
        .map(([colId, values]) => ({
          index: visibleColumns.findIndex((col) => col.id === colId),
          allowed: new Set(values),
        }))
        .filter((entry) => entry.index !== -1);
      if (plan.length) {
        rows = rows.filter((row) =>
          plan.every(({ index, allowed }) => allowed.has(row.cells[index]?.text))
        );
      }
    }

    const filter = rowFilter.trim().toLowerCase();
    if (filter) {
      rows = rows.filter((row) =>
        row.cells.some((cell) => cell.text.toLowerCase().includes(filter))
      );
    }

    if (lookupRowFilter) {
      rows = rows.filter(
        (row) => Boolean(row.matchedByLookup[lookupRowFilter.lookupId]) === lookupRowFilter.matched
      );
    }

    if (layout.sort?.length) {
      // Each entry is a tiebreaker for the ones before it -- the first
      // non-zero comparison along the list wins, same as an ORDER BY with
      // several columns.
      const plan = layout.sort
        .map((entry) => ({
          index: visibleColumns.findIndex((col) => col.id === entry.colId),
          direction: entry.dir === "desc" ? -1 : 1,
        }))
        .filter((entry) => entry.index !== -1);
      if (plan.length) {
        rows = [...rows].sort((a, b) => {
          for (const { index, direction } of plan) {
            const result = direction * compareCells(a.cells[index]?.raw, b.cells[index]?.raw);
            if (result !== 0) return result;
          }
          return 0;
        });
      }
    }
    return rows;
  }, [
    result,
    mappedRows,
    visibleColumns,
    columnValueFilters,
    rowFilter,
    lookupRowFilter,
    layout.sort,
  ]);

  // Big-number cards, built from the per-column summaries an admin has
  // already set (the ones shown under the table) rather than a second thing
  // to configure. A query with none still gets the one number every table
  // has: how many rows it is showing.
  const kpiCards = useMemo(() => {
    const cards = Object.entries(layout.summary || {})
      .map(([colId, kind]) => {
        const index = visibleColumns.findIndex((col) => col.id === colId);
        if (index === -1) return null;
        return {
          id: colId,
          kind,
          label: visibleColumns[index].label,
          value: summarize(kind, displayRows.map((row) => row.cells[index]?.raw)),
        };
      })
      .filter(Boolean);
    return [
      { id: "__rows__", kind: "count", label: "จำนวนแถว", value: displayRows.length },
      ...cards,
    ];
  }, [layout.summary, visibleColumns, displayRows]);

  const pageCount = Math.max(1, Math.ceil(displayRows.length / pageSize));
  const activePage = Math.min(page, pageCount);
  const pageOffset = (activePage - 1) * pageSize;
  const pagedRows = useMemo(
    () => displayRows.slice(pageOffset, pageOffset + pageSize),
    [displayRows, pageOffset, pageSize]
  );

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
      headerTones: visibleColumns.map(
        (col) => layout.formats[col.id]?.headerBg || layout.tableTone || ""
      ),
      cellTones: buildToneGrid(visibleColumns, displayRows, layout),
      groups: buildHeaderGroups(visibleColumns, layout),
    });
  }, [onDataChange, query.id, query.name, visibleColumns, displayRows, layout]);

  // Counted against every row the query returned, not the filtered/sorted
  // displayRows -- so "matched 8/50" stays a stable reference to look at while
  // a text search or the matched/unmatched filter below narrows what's shown,
  // rather than degenerating to "8/8" the moment that filter is turned on.
  const lookupSummaries = useMemo(() => {
    if (!result || activeLookups.length === 0) return [];
    return activeLookups.map((lookup) => {
      const keyIndexes = mergeSourceKeyIndexes[lookup.id];
      const index = mergeSourceIndexes[lookup.id];
      let matched = 0;
      for (const row of result.rows) {
        if (index.byKey.has(mergeKeyOf(keyIndexes.map((i) => row[i])))) matched += 1;
      }
      return {
        id: lookup.id,
        name: queries.find((item) => item.id === lookup.queryId)?.name || `Query #${lookup.queryId}`,
        matched,
        total: result.rows.length,
      };
    });
  }, [result, activeLookups, mergeSourceIndexes, mergeSourceKeyIndexes, queries]);

  const mergeSourceErrorText = useMemo(() => {
    const messages = layout.lookups
      .map((lookup) => mergeSourceResults[lookup.id]?.error)
      .filter(Boolean);
    return messages.join(" · ");
  }, [layout.lookups, mergeSourceResults]);

  // A filter naming a lookup that was since edited or removed would silently
  // hide every row rather than showing what changed.
  useEffect(() => {
    if (lookupRowFilter && !layout.lookups.some((lookup) => lookup.id === lookupRowFilter.lookupId)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing a filter this effect owns when its target disappears
      setLookupRowFilter(null);
    }
  }, [layout.lookups, lookupRowFilter]);

  // Every ref the formula editor can offer: this query's own columns, plus
  // anything pulled in from another query, plus every other formula column --
  // never the one currently being edited, since listing a column among its
  // own available refs is more likely to be clicked by mistake than used on
  // purpose.
  const computedFormulaRefNames = useMemo(() => {
    const otherComputedLabels = displayColumns
      .filter((col) => col.kind === "computed" && col.id !== modalColumnId)
      .map((col) => col.label);
    return {
      available: [...new Set((result?.columns || []).map((col) => col.name)), ...mergedColumns.map((col) => col.label), ...otherComputedLabels],
      all: [...baseNameToIndex.keys(), ...mergedColumns.map((col) => col.label), ...otherComputedLabels],
    };
  }, [displayColumns, modalColumnId, result, mergedColumns, baseNameToIndex]);
  // The first row, so the formula editor can show what a formula produces
  // before the column exists.
  const computedFormulaSampleRow = useMemo(() => {
    if (!result?.rows.length) return null;
    const row = result.rows[0];
    const partners = computePartners(row);
    return Object.fromEntries(
      computedFormulaRefNames.all.map((name) => [name, resolveRowRef(row, partners, name)])
    );
    // See the note on resolveRowRef above displayRows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, computePartners, computedFormulaRefNames]);

  // Keys arrive as `rowIndex:columnName`; the table addresses cells by
  // display-column id, which is the same string for base columns.
  const changedCellKeys = useMemo(() => changedKeys, [changedKeys]);

  // Every write endpoint reads the query's own shared layout -- not this user's
  // personal one, and not what is only in the editor. So a table is editable here
  // exactly when it is editable there, and by the config that will be enforced;
  // anything else offers a box whose save is refused with
  // "ยังไม่ได้เปิดให้แก้ไขข้อมูล", or a column the writer will not accept.
  const sharedEditable = useMemo(
    () => normalizeLayout(query.layout).editable,
    [query.layout]
  );
  const editableColumns = useMemo(() => sharedEditable?.columns || [], [sharedEditable]);
  // Same rule as sharedEditable: the write endpoint reads the query's own saved
  // layout, so a form that only exists in this user's copy would offer a button
  // whose submit is refused.
  const sharedInsertForm = useMemo(
    () => normalizeLayout(query.layout).insertForm,
    [query.layout]
  );
  // Writing the script is an admin's job; filling it in is open to anyone who
  // is allowed to edit at all — which is what canCustomizeLayout already means.
  const canUseInsertForm = Boolean(sharedInsertForm && canCustomizeLayout);
  useEffect(() => {
    pkNameRef.current = sharedEditable?.pk || "";
  }, [sharedEditable]);
  // "Update" (PATCH /cell) and "write" (POST/DELETE /row) are grantable to a
  // Staff account independently of each other (see canWriteData/canUpdateData
  // in gamedb-workspace.js), so a delete-row button can't just reuse the same
  // flag the cell-edit UI does — that would show a button the server then
  // rejects for someone with update but not write.
  const canEditCells = Boolean(
    canUpdateData && sharedEditable && baseNameToIndex.has(sharedEditable.pk)
  );
  const canDeleteRows = Boolean(
    canWriteData && sharedEditable && baseNameToIndex.has(sharedEditable.pk)
  );
  const canAddRow = Boolean(canWriteData && sharedEditable?.allowInsert);
  // Configured, but only in the editor or only for this user.
  const editableNotShared = Boolean(canManage && layout.editable && !sharedEditable);

  // Dropdowns that read another table are fetched once for the panel rather
  // than per cell, and only when a field actually asks for one.
  const [loadedLookups, setLoadedLookups] = useState(NO_LOOKUPS);
  const lookupColumns = useMemo(
    () =>
      (sharedEditable?.inputs || [])
        .filter((input) => input.widget === "lookup" && input.lookup)
        .map((input) => input.column),
    [sharedEditable]
  );
  const lookupSignature = useMemo(
    () =>
      JSON.stringify(
        (sharedEditable?.inputs || [])
          .filter((input) => input.widget === "lookup" && input.lookup)
          .map((input) => [input.column, input.lookup])
      ),
    [sharedEditable]
  );
  const hasLookups = lookupSignature !== "[]";

  useEffect(() => {
    if (!canEditCells || !hasLookups) return undefined;
    let cancelled = false;
    // A field with no list yet is still loading, so every configured field has
    // to end up with one either way -- otherwise a failed request leaves its
    // cells stuck on "กำลังโหลดรายการ..." with no way back to a plain box.
    const blanks = Object.fromEntries(lookupColumns.map((column) => [column, []]));
    apiJson(`/api/queries/${query.id}/lookup`, {
      fallbackError: "โหลดรายการตัวเลือกไม่สำเร็จ",
    })
      .then((data) => {
        if (cancelled) return;
        setLoadedLookups({ ...blanks, ...(data.options || {}) });
        const failed = Object.values(data.failed || {})[0];
        if (failed) setEditError(`โหลดรายการตัวเลือกไม่ครบ: ${failed}`);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadedLookups(blanks);
        setEditError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [query.id, canEditCells, hasLookups, lookupSignature, lookupColumns]);

  // Derived rather than cleared in the effect: turning the last lookup field
  // off should drop the lists without another render pass.
  const lookupOptions = hasLookups ? loadedLookups : NO_LOOKUPS;

  // One flat {pkValue, values: {colName: raw}} record per row, cheap to scan
  // client-side for FindReplaceModal — the table already holds the whole
  // result set in memory for rendering, so this reuses it rather than
  // re-fetching just to search.
  const findReplaceRows = useMemo(() => {
    if (!result || !sharedEditable?.pk) return [];
    const pkIndex = baseNameToIndex.get(sharedEditable.pk);
    if (pkIndex === undefined) return [];
    return result.rows.map((row) => ({
      pkValue: row[pkIndex],
      values: Object.fromEntries(result.columns.map((col, index) => [col.name, row[index]])),
    }));
  }, [result, sharedEditable, baseNameToIndex]);

  // Bulk edit and find/replace identify every row by one key value, which only
  // holds for the base table -- a joined column's row is a different row of a
  // different table, and writing it with this key would land on whatever row
  // of that table happens to carry the same number. Those columns are left out
  // of both tools rather than written to the wrong place; editing them one
  // cell at a time still works, because that path resolves the key per column.
  const baseTableEditable = useMemo(() => {
    if (!sharedEditable) return sharedEditable;
    // A stacked query has no single table at all: which one a row belongs to
    // is decided row by row, which is precisely what these two tools cannot
    // do. They offer nothing here rather than offering the wrong table.
    if (sharedEditable.rowTargets) return { ...sharedEditable, columns: [] };
    if ((sharedEditable.targets || []).length === 0) return sharedEditable;
    return {
      ...sharedEditable,
      columns: sharedEditable.columns.filter(
        (column) => writeTargetFor(sharedEditable, column).table === sharedEditable.table
      ),
    };
  }, [sharedEditable]);

  // --- cell notes ------------------------------------------------------------
  // Anchored to the row's own pk value (same identity findReplaceRows uses),
  // so a note stays on the right cell across a refresh or a re-sort instead
  // of tracking a row's position on screen.
  const [notes, setNotes] = useState([]);
  const notesEnabled = Boolean(sharedEditable?.pk);

  const loadNotes = useCallback(async () => {
    if (!notesEnabled) {
      setNotes([]);
      return;
    }
    try {
      const data = await apiJson(`/api/queries/${query.id}/notes`, {
        fallbackError: "โหลดโน้ตไม่สำเร็จ",
      });
      setNotes(data.notes || []);
    } catch {
      setNotes([]);
    }
  }, [query.id, notesEnabled]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setState runs after the fetch resolves
    loadNotes();
  }, [loadNotes]);

  const cellNotes = useMemo(() => {
    const map = new Map();
    for (const item of notes) map.set(`${item.pkValue}:${item.column}`, item.note);
    return map;
  }, [notes]);

  const saveNote = async (pkValue, column, note) => {
    try {
      await apiJson(`/api/queries/${query.id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pkValue, column, note }),
        fallbackError: "บันทึกโน้ตไม่สำเร็จ",
      });
      await loadNotes();
    } catch (err) {
      window.alert(err.message);
    }
  };

  const pkValueOf = (sourceIndex) =>
    sharedEditable?.pk ? result?.rows?.[sourceIndex]?.[baseNameToIndex.get(sharedEditable.pk)] : undefined;

  // --- saved filter views -----------------------------------------------------
  // The search box text, the lookup match/no-match toggle, and the bound
  // param values, captured together under a name -- picking one puts the
  // table back exactly the way it was when it was saved, in one click
  // instead of re-typing the same search + re-picking the same params again.
  const [filterViews, setFilterViews] = useState([]);

  const loadFilterViews = useCallback(async () => {
    try {
      const data = await apiJson(`/api/queries/${query.id}/filter-views`, {
        fallbackError: "โหลดชุดตัวกรองไม่สำเร็จ",
      });
      setFilterViews(data.filterViews || []);
    } catch {
      setFilterViews([]);
    }
  }, [query.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setState runs after the fetch resolves
    loadFilterViews();
  }, [loadFilterViews]);

  const saveFilterView = async () => {
    const name = window.prompt(
      "ตั้งชื่อชุดตัวกรองนี้",
      rowFilter.trim() || `ตัวกรอง ${new Date().toLocaleString("th-TH")}`
    );
    if (!name || !name.trim()) return;
    try {
      await apiJson(`/api/queries/${query.id}/filter-views`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), rowFilter, lookupRowFilter, paramValues }),
        fallbackError: "บันทึกชุดตัวกรองไม่สำเร็จ",
      });
      await loadFilterViews();
    } catch (err) {
      window.alert(err.message);
    }
  };

  const applyFilterView = (view) => {
    setRowFilter(view.rowFilter || "");
    setLookupRowFilter(view.lookupRowFilter || null);
    setParamValues((prev) => ({ ...prev, ...(view.paramValues || {}) }));
    setPage(1);
  };

  const deleteFilterView = async (viewId) => {
    if (!window.confirm("ลบชุดตัวกรองนี้?")) return;
    try {
      await apiJson(`/api/queries/${query.id}/filter-views/${viewId}`, {
        method: "DELETE",
        fallbackError: "ลบชุดตัวกรองไม่สำเร็จ",
      });
      await loadFilterViews();
    } catch (err) {
      window.alert(err.message);
    }
  };

  // Live value of one cell, no lock -- used to refresh what the editor opens
  // with (see onPeekCell on PanelTable) so a double-click shows what the
  // table actually holds right now, not whatever this browser last fetched.
  /**
   * The value identifying the row this column's write will land on.
   *
   * Across a join each column belongs to its own table, with its own key, and
   * the result carries one column per table holding it. Using the base table's
   * key for a joined column would either find nothing or -- when both tables
   * number their rows from 1 -- find a completely unrelated row.
   */
  /**
   * Which half of a stacked query a row came from, read out of the column the
   * query carries for exactly that. Undefined for every ordinary query, where
   * the table is a property of the column instead of of the row.
   */
  const rowSourceOf = (sourceIndex) => {
    const column = sharedEditable?.rowTargets?.sourceColumn;
    if (!column) return undefined;
    const index = baseNameToIndex.get(column);
    return index === undefined ? undefined : result?.rows?.[sourceIndex]?.[index];
  };

  const editPkValueOf = (sourceIndex, column) => {
    const target = writeTargetFor(sharedEditable, column, rowSourceOf(sourceIndex));
    const index = baseNameToIndex.get(target.pk);
    return index === undefined ? undefined : result?.rows?.[sourceIndex]?.[index];
  };

  const peekCell = async (sourceIndex, column) => {
    const pkValue = editPkValueOf(sourceIndex, column);
    if (pkValue === undefined || pkValue === null) return undefined;
    const rowSource = rowSourceOf(sourceIndex);
    const params = new URLSearchParams({ pkValue: String(pkValue), column });
    if (rowSource !== undefined && rowSource !== null) params.set("rowSource", String(rowSource));
    if (activeViewId) params.set("viewId", String(activeViewId));
    const data = await apiJson(`/api/queries/${query.id}/cell?${params.toString()}`, {
      fallbackError: "โหลดค่าล่าสุดไม่สำเร็จ",
    });
    return data.value;
  };

  const editCell = async ({ sourceIndex, colId, colIndex, value, original }) => {
    const col = visibleColumns[colIndex];
    if (!col || col.kind !== "base") return;
    if (String(original ?? "") === String(value ?? "")) return;

    const pkValue = editPkValueOf(sourceIndex, col.column.name);
    if (pkValue === undefined || pkValue === null) {
      setEditError(
        `แก้ไม่ได้ — ผลลัพธ์ไม่มีค่า key ของตารางที่คอลัมน์ "${col.column.name}" อยู่`
      );
      return;
    }

    // `expectedValue` undefined means "write regardless" -- used only for the
    // retry after a conflict is confirmed, below.
    const applyEdit = async (expectedValue) => {
      const data = await apiJson(`/api/queries/${query.id}/cell`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pkValue,
          column: col.column.name,
          value,
          viewId: activeViewId,
          rowSource: rowSourceOf(sourceIndex),
          ...(expectedValue === undefined ? {} : { expectedValue }),
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
      // A lookup column stores an id but shows whatever the JOIN made of it, so
      // writing the id back into the cell would leave a bare number on screen.
      // Only the query knows the name that goes with it.
      if (lookupColumns.includes(col.column.name)) await runQuery({ silent: true });
      return data.newValue;
    };

    // What "put it back" would have to write, and what it may safely replace
    // -- captured before the write so an undo can never depend on the row
    // still sitting at the same index afterwards.
    const rememberUndo = (writtenValue) =>
      setLastEdit({
        pkValue,
        column: col.column.name,
        colId,
        sourceIndex,
        label: col.label || col.column.name,
        previousValue: original,
        writtenValue,
        // Captured with the rest: the undo has to land on the same table the
        // edit did, and by then the row may not be at the same index.
        rowSource: rowSourceOf(sourceIndex),
      });

    setEditPending({ sourceIndex, colId });
    setEditError("");
    try {
      // `original` is what the editor opened with (freshly peeked, see
      // onPeekCell) -- sent as the value the write is only allowed to
      // replace, so someone else's edit landed in the gap between opening
      // the box and hitting save is caught here, not silently overwritten.
      rememberUndo(await applyEdit(original));
    } catch (err) {
      if (err.status === 409) {
        const overwrite = window.confirm(
          `${err.message}\n\nต้องการเขียนทับด้วยค่าที่คุณพิมพ์ไว้ไหม?`
        );
        if (overwrite) {
          try {
            rememberUndo(await applyEdit(undefined));
          } catch (err2) {
            setEditError(err2.message);
          }
        } else {
          await runQuery({ silent: true });
        }
      } else {
        setEditError(err.message);
      }
    } finally {
      setEditPending(null);
    }
  };

  const undoLastEdit = async () => {
    if (!lastEdit) return;
    setUndoing(true);
    setEditError("");
    try {
      await apiJson(`/api/queries/${query.id}/cell`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pkValue: lastEdit.pkValue,
          column: lastEdit.column,
          value: lastEdit.previousValue,
          viewId: activeViewId,
          rowSource: lastEdit.rowSource,
          // Only undo what this edit actually wrote: if someone else has
          // since changed the same cell, putting the old value back would
          // quietly throw their work away, so let the 409 surface instead.
          expectedValue: lastEdit.writtenValue,
        }),
        fallbackError: "เลิกทำไม่สำเร็จ",
      });
      setLastEdit(null);
      await runQuery({ silent: true });
    } catch (err) {
      setEditError(
        err.status === 409
          ? `เลิกทำไม่ได้ — มีคนแก้ช่องนี้ต่อไปแล้วหลังจากคุณ (${err.message})`
          : err.message
      );
    } finally {
      setUndoing(false);
    }
  };

  // Long enough to notice the mistake and reach the button, short enough that
  // it never reads as a permanent undo history.
  useEffect(() => {
    if (!lastEdit) return undefined;
    const timer = setTimeout(() => setLastEdit(null), 20000);
    return () => clearTimeout(timer);
  }, [lastEdit]);

  const openRowHistory = async (row) => {
    const pkValue = result.rows[row.sourceIndex][baseNameToIndex.get(sharedEditable.pk)];
    setRowHistory({ pkValue, loading: true, entries: [], error: "" });
    try {
      const data = await apiJson(
        `/api/queries/${query.id}/row-history?pkValue=${encodeURIComponent(String(pkValue))}`,
        { fallbackError: "โหลดประวัติของแถวนี้ไม่สำเร็จ" }
      );
      setRowHistory({ pkValue, loading: false, entries: data.entries || [], error: "" });
    } catch (err) {
      setRowHistory({ pkValue, loading: false, entries: [], error: err.message });
    }
  };

  const deleteRow = async (row) => {
    const pkValue = result.rows[row.sourceIndex][baseNameToIndex.get(sharedEditable.pk)];
    const confirmed = window.confirm(
      `ลบแถวที่ ${sharedEditable.pk} = ${pkValue} ออกจากตาราง ${sharedEditable.table}?\n` +
        "ลบแล้วเอากลับไม่ได้"
    );
    if (!confirmed) return;
    setEditError("");
    try {
      await apiJson(`/api/queries/${query.id}/row`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pkValue, viewId: activeViewId }),
        fallbackError: "ลบแถวไม่สำเร็จ",
      });
      await runQuery({ silent: true });
    } catch (err) {
      setEditError(err.message);
    }
  };

  const startDraftRow = () => {
    setEditError("");
    // Typing today's date into a date column by hand on every single row
    // added is exactly the busywork this button exists to avoid, so a date/
    // datetime/time column starts pre-filled with "right now" -- and an
    // admin-configured default (including "@today"/"@now"/"@time") wins over
    // that guess when one is set.
    const defaults = {};
    for (const columnName of editableColumns) {
      const input = (sharedEditable?.inputs || []).find((item) => item.column === columnName);
      const columnMeta = result?.columns?.[baseNameToIndex.get(columnName)];
      const widget = input?.widget || widgetForColumn(columnMeta);
      const configured = input?.defaultValue ? resolveInputDefault(input.defaultValue) : "";
      const guessed =
        widget === "date"
          ? resolveInputDefault("@today")
          : widget === "datetime"
            ? resolveInputDefault("@now")
            : widget === "time"
              ? resolveInputDefault("@time")
              : "";
      const value = configured || guessed;
      if (value) defaults[columnName] = value;
    }
    draftInitialRef.current = defaults;
    setDraftRow(defaults);
  };

  const changeDraftValue = (column, value) => {
    setDraftRow((prev) => ({ ...(prev || {}), [column]: value }));
  };

  // A draft row is only ever shown pinned to the top of whichever page is on
  // screen — it has no page of its own — so switching pages while one is open
  // would make it look like it silently jumped or duplicated. Anything that
  // would move the row out from under what's being typed goes through here.
  // Compared against what it started as, not against blank, so an untouched
  // auto-filled date doesn't itself count as "something typed".
  const draftRowTouched = () => {
    const initial = draftInitialRef.current || {};
    const current = draftRow || {};
    const keys = new Set([...Object.keys(initial), ...Object.keys(current)]);
    for (const key of keys) {
      if (String(current[key] ?? "").trim() !== String(initial[key] ?? "").trim()) return true;
    }
    return false;
  };

  const confirmDiscardDraft = (message) => {
    if (!draftRow) return true;
    if (!draftRowTouched()) {
      setDraftRow(null);
      return true;
    }
    if (!window.confirm(message)) return false;
    setDraftRow(null);
    setEditError("");
    return true;
  };

  const cancelDraftRow = () => {
    if (
      !confirmDiscardDraft("ยังไม่ได้บันทึก — ยกเลิกแล้วข้อมูลที่กรอกไว้จะหายไป ยืนยันยกเลิกไหม?")
    ) {
      return;
    }
    setDraftRow(null);
    setEditError("");
  };

  const saveDraftRow = async () => {
    setDraftSaving(true);
    setEditError("");
    try {
      await apiJson(`/api/queries/${query.id}/row`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values: draftRow || {}, viewId: activeViewId }),
        fallbackError: "เพิ่มแถวไม่สำเร็จ",
      });
      setDraftRow(null);
      await runQuery({ silent: true });
    } catch (err) {
      setEditError(err.message);
    } finally {
      setDraftSaving(false);
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
          body: JSON.stringify({ ...edit, viewId: activeViewId }),
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
      setPage(1);
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
      // Whether a cell can be edited is read from the query's shared layout,
      // not from this component's copy, so the list has to learn about the save
      // or the panel goes on using the layout it was mounted with.
      else onSharedLayoutSaved?.(query.id, data.layout);
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

  const bodyHeight = docked ? "100%" : panel.height;
  const chartHeight = docked ? dockedChartHeight : panel.height;
  const panelHeaderTone = toneStyle(layout.tableTone, "head");
  // A separate border tone, when set, always wins — otherwise the border
  // keeps following the table's header tint like before.
  const panelBorderTone = toneStyle(layout.tableBorderTone, "head");
  const panelBorderColor = panelBorderTone?.backgroundColor || panelHeaderTone?.backgroundColor;
  // The table's own rows already tint to this tone (see tableBodyTone in
  // panel-table.js) -- without this, the card's own frame around them (the
  // toolbar strip aside) stayed plain white, so a themed table's colour
  // stopped right at the table's edge instead of reading as one themed card.
  const panelBodyTone = toneStyle(layout.tableTone);
  const panelBodyColor = panelBodyTone?.backgroundColor;

  return (
    <section
      ref={sectionRef}
      onPointerDown={() => {
        onSelect?.();
        if (canCustomizeLayout) {
          setFrameSelected(true);
          onBringToFront?.(query.id);
        }
      }}
      style={{
        ...(docked
          ? { position: "relative", width: "100%", height: "100%" }
          : {
              position: "absolute",
              left: panel.x || 0,
              top: panel.y || 0,
              width: panel.width,
            }),
        ...(panelBorderColor ? { borderColor: panelBorderColor } : {}),
        ...(panelBodyColor ? { backgroundColor: panelBodyColor } : {}),
      }}
      className={`flex min-w-0 flex-col border border-zinc-200 bg-white shadow-sm transition-shadow ${
        panelDrag || frameDrag
          ? "z-30 shadow-xl ring-1 ring-red-500"
          : frameSelected || isSelected
            ? "z-10 ring-1 ring-red-500"
            : "z-10"
      }`}
    >
      {canCustomizeLayout && (panelDrag || frameDrag) && (
        <div
          className="pointer-events-none absolute right-2 top-2 z-50 rounded-sm bg-zinc-900/90 px-2 py-1 font-mono text-[9px] font-bold text-white shadow-lg"
          aria-live="polite"
        >
          {panelDrag
            ? `X ${Math.round(panel.x || 0)} · Y ${Math.round(panel.y || 0)}`
            : `${Math.round(panel.width || 0)} × ${Math.round(panel.height || 0)} px`}
        </div>
      )}

      <div
        className="flex flex-wrap items-center gap-2 border-b border-zinc-100 px-3 py-1.5"
        style={panelHeaderTone || undefined}
      >
        {canCustomizeLayout && !docked ? <button
          type="button"
          onPointerDown={startPanelMove}
          className="flex h-8 w-8 shrink-0 cursor-grab items-center justify-center rounded-sm border border-transparent text-zinc-300 transition hover:border-zinc-200 hover:bg-zinc-100 hover:text-zinc-600 active:cursor-grabbing"
          title="ลากเพื่อย้ายกล่องไปวางตำแหน่งที่ต้องการ"
          aria-label={`ย้ายกล่อง ${query.name}`}
        >
          <GripVertical size={14} />
        </button> : docked ? null : (
          <span
            className="rounded-sm p-1 text-zinc-300"
            title="บัญชีนี้ใช้ layout จาก template"
          >
            <Lock size={14} />
          </span>
        )}
        {canCustomizeLayout && <button
          type="button"
          onClick={onToggleCollapse}
          className="rounded-sm p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
          title={panel.collapsed ? "ขยายตาราง" : "ย่อตาราง"}
        >
          {panel.collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>}

        {/* Name and counters share a line when there is room for one: two
            stacked lines of chrome cost more height than the numbers are worth. */}
        <div className="flex min-w-48 flex-[1_1_16rem] flex-wrap items-baseline gap-x-2">
          <p className="truncate text-xs font-black" title={query.name}>
            {query.name}
            {refreshing && (
              <Loader2 size={11} className="ml-1.5 inline animate-spin text-zinc-400" />
            )}
          </p>
          <p className="min-w-0 flex-1 truncate text-[10px] font-semibold text-zinc-400">
            {result ? (
              <>
                {displayRows.length.toLocaleString("th-TH")} แถว
                {rowFilter.trim() || lookupRowFilter || activeColumnFilterIds.length
                  ? ` (กรองจาก ${result.rowCount.toLocaleString("th-TH")})`
                  : ""}
                {lookupRowFilter
                  ? ` · แสดงเฉพาะ${lookupRowFilter.matched ? "จับคู่ได้" : "ไม่พบคู่"}กับ ${
                      lookupSummaries.find((item) => item.id === lookupRowFilter.lookupId)?.name || ""
                    }`
                  : ""}
                {" · "}ใช้เวลา {result.durationMs} ms
                {" · DB: "}
                {query.connectionName || "หลัก (inblackm)"}
                {result.truncated ? " · แสดงสูงสุด 1,000 แถวแรก" : ""}
                {lastRunAt
                  ? ` · อัปเดต ${lastRunAt.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
                  : ""}
                {lookupSummaries.length > 0
                  ? ` · ${lookupSummaries
                      .map(
                        (item) =>
                          `จับคู่กับ ${item.name} ได้ ${item.matched.toLocaleString("th-TH")}/${item.total.toLocaleString("th-TH")}`
                      )
                      .join(" · ")}`
                  : ""}
              </>
            ) : (
              query.description || "—"
            )}
          </p>
        </div>

        {activeColumnFilterIds.length > 0 && (
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-black text-zinc-400">กรองอยู่:</span>
            {activeColumnFilterIds.map((colId) => (
              <button
                key={colId}
                type="button"
                onClick={() =>
                  setColumnValueFilters((prev) => {
                    const next = { ...prev };
                    delete next[colId];
                    return next;
                  })
                }
                className="flex items-center gap-1 rounded-sm border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-black text-red-600 transition hover:bg-red-100"
                title="เอาตัวกรองของคอลัมน์นี้ออก"
              >
                {visibleColumns.find((col) => col.id === colId)?.label || colId} (
                {columnValueFilters[colId].length})
                <X size={10} />
              </button>
            ))}
            <button
              type="button"
              onClick={() => setColumnValueFilters({})}
              className="text-[10px] font-black text-zinc-500 underline underline-offset-2 hover:text-zinc-700"
            >
              ล้างทั้งหมด
            </button>
          </div>
        )}

        {canCustomizeLayout && hiddenColumns.length > 0 && (
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
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
                className="flex items-center gap-1 rounded-sm border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-bold text-zinc-500 transition hover:bg-zinc-100"
                title="กดเพื่อแสดงคอลัมน์นี้"
              >
                <Eye size={10} /> {col.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex min-w-0 flex-[1_1_auto] flex-wrap items-center justify-end gap-1">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={rowFilter}
            onChange={(e) => {
              setRowFilter(e.target.value);
              setPage(1);
            }}
            placeholder="ค้นหาในผลลัพธ์..."
            className="h-8 w-36 rounded-sm border border-zinc-200 bg-zinc-50 pl-8 pr-2 text-[11px] font-semibold outline-none focus:border-red-600 focus:bg-white"
          />
        </div>

        {filterViews.length > 0 && (
          <select
            value={selectedFilterViewId}
            onChange={(e) => {
              const id = e.target.value;
              setSelectedFilterViewId(id);
              const view = filterViews.find((item) => String(item.id) === id);
              if (view) applyFilterView(view);
            }}
            className="h-8 max-w-[140px] rounded-sm border border-zinc-200 bg-zinc-50 px-1.5 text-[10px] font-bold outline-none focus:border-red-600"
            title="เลือกชุดตัวกรองที่บันทึกไว้"
          >
            <option value="">— ชุดตัวกรอง —</option>
            {filterViews.map((view) => (
              <option key={view.id} value={view.id}>
                {view.name}
              </option>
            ))}
          </select>
        )}
        {selectedFilterViewId && (
          <button
            type="button"
            onClick={() => {
              deleteFilterView(Number(selectedFilterViewId));
              setSelectedFilterViewId("");
            }}
            title="ลบชุดตัวกรองที่เลือก"
            className="rounded-sm p-1.5 text-zinc-400 transition hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 size={13} />
          </button>
        )}
        <button
          type="button"
          onClick={saveFilterView}
          title="บันทึกตัวกรองปัจจุบัน (คำค้นหา + จับคู่ lookup + ค่าพารามิเตอร์) เป็นชุดใหม่"
          className="rounded-sm p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
        >
          <BookmarkPlus size={14} />
        </button>

        {/* Available whether or not anything has changed: waiting for the panel
            to decide something counts as an edit made saving feel like a trap.
            The dot is what says there is something unsaved. There is one save
            now — a layout is either how the table looks or it is nothing, and a
            private copy of it only ever meant two people describing the same
            table differently. */}
        {canCustomizeLayout && (
          <>
            {canManage && (
              <button
                type="button"
                onClick={() => saveLayout("shared")}
                disabled={savingLayout}
                className={`flex h-8 items-center gap-1.5 rounded-sm px-3 text-[11px] font-black transition disabled:opacity-50 ${
                  layoutDirty
                    ? "bg-red-600 text-white hover:bg-red-700"
                    : "border border-zinc-300 text-zinc-600 hover:bg-zinc-50"
                }`}
                title={
                  layoutDirty
                    ? "มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก — บันทึกแล้วทุกคนเห็น"
                    : "ตั้งเป็นค่าเริ่มต้นที่ทุกคนเห็น"
                }
              >
                {savingLayout ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                บันทึกรูปแบบ
                {layoutDirty && (
                  <span
                    className="h-1.5 w-1.5 rounded-sm bg-white"
                    aria-label="ยังไม่ได้บันทึก"
                  />
                )}
              </button>
            )}
            <button type="button" onClick={resetLayout} disabled={savingLayout} className={iconButtonClass} title="ล้าง layout กลับเป็นค่าเริ่มต้น">
              <Eraser size={13} />
            </button>
          </>
        )}
        {canCustomizeLayout && personalLayout && (
          <button
            type="button"
            onClick={dropPersonalLayout}
            disabled={savingLayout}
            className="flex h-8 items-center gap-1.5 rounded-sm border border-sky-200 bg-sky-50 px-2.5 text-[10px] font-black text-sky-700 transition hover:bg-sky-100 disabled:opacity-50"
            title="ตอนนี้ใช้ layout ส่วนตัวอยู่ — กดเพื่อกลับไปใช้ค่ากลาง"
          >
            <User size={11} /> ของฉัน
          </button>
        )}

        {canUseInsertForm && (
          <button
            type="button"
            onClick={() => setModal("insertRun")}
            disabled={Boolean(viewingSnapshot)}
            className="flex h-8 items-center gap-1.5 rounded-sm bg-red-600 px-2.5 text-[10px] font-black text-white transition hover:bg-red-700 disabled:opacity-50"
            title={viewingSnapshot ? "ออกจาก snapshot ก่อนถึงจะเพิ่มข้อมูลได้" : "เพิ่มข้อมูลด้วยฟอร์มที่ Admin ตั้งไว้"}
          >
            <Plus size={12} /> {sharedInsertForm.label || "เพิ่มข้อมูล"}
          </button>
        )}
        {canAddRow && (
          <button
            type="button"
            onClick={startDraftRow}
            disabled={Boolean(viewingSnapshot) || draftRow !== null}
            className="flex h-8 items-center gap-1.5 rounded-sm border border-sky-300 bg-sky-50 px-2.5 text-[10px] font-black text-sky-700 transition hover:bg-sky-100 disabled:opacity-50"
            title={
              viewingSnapshot
                ? "ออกจาก snapshot ก่อนถึงจะเพิ่มแถวได้"
                : "เพิ่มแถวว่างในตาราง แล้วกรอกทีละช่อง"
            }
          >
            <Plus size={12} /> เพิ่มแถว
          </button>
        )}
        <button type="button" onClick={() => runQuery({ validate: true })} disabled={running} className={iconButtonClass} title="รันใหม่">
          <RefreshCw size={13} className={running ? "animate-spin" : ""} />
        </button>
        <div className="flex h-8 items-center gap-1 rounded-sm border border-zinc-200 px-2" title="รันซ้ำอัตโนมัติ">
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
        {/* Someone without the "เพิ่มเติม" menu below (no layout permission)
            has no other way to reach these, so they stay as icon buttons for
            that case; everyone else finds them folded into the menu instead. */}
        {!canCustomizeLayout && (
          <>
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
          </>
        )}

        {canCustomizeLayout && <div ref={moreMenuRef} className="relative">
          <button
            type="button"
            onClick={() => setMoreMenuOpen((open) => !open)}
            className={`flex h-8 items-center gap-1.5 rounded-sm border px-2.5 text-[10px] font-black transition ${
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
              className="absolute right-0 top-full z-50 mt-2 max-h-[min(32rem,70vh)] w-64 overflow-y-auto rounded-sm border border-zinc-200 bg-white p-2 shadow-xl shadow-zinc-900/10"
            >
              <p className="px-2.5 pb-1 pt-1 text-[9px] font-black uppercase tracking-wider text-zinc-400">
                การแสดงผล
              </p>
              <button
                type="button"
                role="menuitem"
                onClick={() =>
                  runMoreAction(() => {
                    setModalColumnId(null);
                    setModal("computed");
                  })
                }
                disabled={!result}
                className={menuItemClass}
              >
                <Calculator size={14} /> เพิ่มคอลัมน์สูตร
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() =>
                  runMoreAction(() => {
                    setModalColumnId(null);
                    setModal("formats");
                  })
                }
                disabled={!result}
                className={menuItemClass}
              >
                <Paintbrush
                  size={14}
                  className={
                    Object.keys(layout.formats).length || layout.freeze || layout.tableTone ? "text-red-600" : ""
                  }
                />
                รูปแบบและสีตาราง
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() =>
                  runMoreAction(() => {
                    setModalColumnId(null);
                    setModal("rules");
                  })
                }
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
              <button
                type="button"
                role="menuitem"
                onClick={() =>
                  runMoreAction(() => setView((prev) => (prev === "table" ? "chart" : "table")))
                }
                disabled={!result}
                className={menuItemClass}
              >
                <ChartColumn size={14} className={view === "chart" ? "text-red-600" : ""} />
                {view === "chart" ? "กลับไปดูตาราง" : "ดูเป็นกราฟ"}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() =>
                  runMoreAction(() => setView((prev) => (prev === "kpi" ? "table" : "kpi")))
                }
                disabled={!result}
                className={menuItemClass}
              >
                <Sigma size={14} className={view === "kpi" ? "text-red-600" : ""} />
                {view === "kpi" ? "กลับไปดูตาราง" : "ดูเป็นตัวเลขใหญ่ (สรุป)"}
              </button>

              <div className="my-1 border-t border-zinc-100" />
              <p className="px-2.5 pb-1 pt-1 text-[9px] font-black uppercase tracking-wider text-zinc-400">
                ข้อมูล
              </p>
              <button
                type="button"
                role="menuitem"
                onClick={() => runMoreAction(exportCsv)}
                disabled={!result}
                className={menuItemClass}
              >
                <Download size={14} /> ดาวน์โหลด CSV
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() =>
                  runMoreAction(() => {
                    setModalColumnId(null);
                    setModal("lookups");
                  })
                }
                disabled={!result}
                className={menuItemClass}
              >
                <Combine size={14} className={layout.lookups.length ? "text-red-600" : ""} />
                ดึงคอลัมน์จาก Query อื่น
                {layout.lookups.length > 0 ? ` (${layout.lookups.length})` : ""}
              </button>
              {lookupSummaries.length > 0 && (
                <div className="space-y-1 px-2.5 py-1.5">
                  <p className="text-[9px] font-black text-zinc-400">กรองตามผลจับคู่</p>
                  {lookupSummaries.map((item) => (
                    <label key={item.id} className="flex items-center gap-1.5">
                      <span className="min-w-0 flex-1 truncate text-[10px] font-bold text-zinc-500" title={item.name}>
                        {item.name} ({item.matched}/{item.total})
                      </span>
                      <select
                        value={
                          lookupRowFilter?.lookupId === item.id
                            ? String(lookupRowFilter.matched)
                            : "all"
                        }
                        onChange={(event) => {
                          const value = event.target.value;
                          setLookupRowFilter(value === "all" ? null : { lookupId: item.id, matched: value === "true" });
                        }}
                        className="h-7 shrink-0 rounded-sm border border-zinc-200 bg-white px-1.5 text-[9px] font-bold text-zinc-600 outline-none focus:border-red-500"
                      >
                        <option value="all">ทั้งหมด</option>
                        <option value="true">เฉพาะจับคู่ได้</option>
                        <option value="false">เฉพาะไม่พบคู่</option>
                      </select>
                    </label>
                  ))}
                </div>
              )}
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
                    className="h-8 w-full rounded-sm border border-zinc-200 bg-white px-2 text-[10px] font-bold text-zinc-600 outline-none focus:border-red-500"
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
                    onClick={() => runMoreAction(() => setModal("share"))}
                    className={menuItemClass}
                  >
                    <Link2 size={14} /> แชร์เป็นลิงก์ (ดูอย่างเดียว)
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => runMoreAction(() => setModal("insertForm"))}
                    className={menuItemClass}
                  >
                    <Plus size={14} className={layout.insertForm ? "text-red-600" : ""} />
                    ตั้งค่าฟอร์มเพิ่มข้อมูล
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
                  {editableNotShared && (
                    <p className="px-3 py-1.5 text-[10px] font-bold leading-relaxed text-amber-700">
                      ตั้งค่าแก้ไขข้อมูลไว้แล้ว แต่ยังไม่ได้บันทึกให้ทุกคน —
                      กด &quot;บันทึกให้ทุกคน&quot; ก่อน ถึงจะแก้ข้อมูลได้
                    </p>
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
                  {canEditCells && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => runMoreAction(() => setModal("findReplace"))}
                      className={menuItemClass}
                    >
                      <Search size={14} /> ค้นหา/แทนที่ในตาราง
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
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => runMoreAction(onDuplicateQuery)}
                    className={menuItemClass}
                  >
                    <Copy size={14} /> ทำสำเนา Query
                  </button>
                </>
              )}

            </div>
          )}
        </div>}

        {/* A button + modal instead of the params bar sitting permanently
            across the top of the panel -- on a narrow panel that strip ate
            enough height to cover the table underneath it. */}
        {effectiveParams.length > 0 && (
          <button
            type="button"
            onClick={() => setModal("paramsInput")}
            className={`flex h-8 items-center gap-1 rounded-sm border px-2 text-[10px] font-black transition ${
              Object.keys(paramErrors).length > 0
                ? "border-red-300 bg-red-50 text-red-600 hover:bg-red-100"
                : "border-zinc-200 text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700"
            }`}
            title="กรอกค่าตัวกรองของ Query นี้"
          >
            <SlidersHorizontal size={13} /> Input
          </button>
        )}
        {canCustomizeLayout && <button type="button" onClick={onToggleFullWidth} className={iconButtonClass} title={isFullWidth ? "คืนความกว้างอัตโนมัติ" : "ขยายเต็มความกว้าง"}>
          {isFullWidth ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        </button>}
        {/* Closing is not editing the layout. A template account can open a
            table by drilling into it, so it must be able to put it away again;
            nothing it does here is saved, and a reload brings the template
            back exactly as it was. */}
        {canClose && <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-sm border border-zinc-200 text-zinc-500 transition hover:bg-red-50 hover:text-red-600"
          title="ปิดตารางนี้"
        >
          <X size={13} />
        </button>}
        {workspaceToolbar}
        </div>
      </div>

      {!panel.collapsed && (
        <>
          {modal === "paramsInput" && effectiveParams.length > 0 && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-4 backdrop-blur-sm"
              onClick={() => setModal(null)}
            >
            <div
              className="relative flex max-h-[85vh] w-full flex-col gap-2 overflow-y-auto rounded-sm bg-white p-4 shadow-xl"
              style={{ maxWidth: paramsModalWidth }}
              onClick={(e) => e.stopPropagation()}
            >
              <ModalResizeHandle onPointerDown={startParamsModalResize} active={paramsModalResizing} />
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-sm font-black text-zinc-700">
                  <SlidersHorizontal size={15} className="text-red-600" /> ตัวกรอง Query
                </span>
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  className="rounded-sm border border-zinc-200 p-1.5 text-zinc-500 transition hover:bg-zinc-50"
                  aria-label="ปิด"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
              <div className="flex w-full flex-wrap items-center justify-between gap-2 pb-1">
                <div className="flex flex-wrap items-center gap-1.5">
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
              {resolvedParams.map((param) => {
                const guide = paramInputGuide(param);
                const isColumnSourced = param.type === "select" && param.optionsSource === "column";
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
                        className={`flex h-8 min-w-28 items-center gap-2 rounded-sm border px-2 text-[11px] font-black transition ${
                          (paramValues[param.name] ?? "false") === "true"
                            ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                            : "border-zinc-200 bg-white text-zinc-500"
                        }`}
                      >
                        <span
                          className={`relative h-4 w-7 rounded-sm transition ${
                            (paramValues[param.name] ?? "false") === "true"
                              ? "bg-emerald-500"
                              : "bg-zinc-300"
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 h-3 w-3 rounded-sm bg-white shadow transition ${
                              (paramValues[param.name] ?? "false") === "true"
                                ? "left-3.5"
                                : "left-0.5"
                            }`}
                          />
                        </span>
                        {(paramValues[param.name] ?? "false") === "true" ? "ใช่" : "ไม่ใช่"}
                      </button>
                    ) : param.type === "select" ? (
                      isColumnSourced && columnParamOptionsLoading ? (
                        <p className="flex h-8 items-center gap-1.5 text-[10px] font-semibold text-zinc-400">
                          <Loader2 size={12} className="animate-spin" /> กำลังโหลดตัวเลือก...
                        </p>
                      ) : (
                        <SearchableSelect
                          id={inputId}
                          value={paramValues[param.name] ?? ""}
                          onChange={(next) =>
                            setParamValues((prev) => ({ ...prev, [param.name]: next }))
                          }
                          options={param.options.map((option) => ({ value: option, label: option }))}
                          emptyLabel="— เลือกค่า —"
                          placeholder="พิมพ์เพื่อค้นหา..."
                          aria-invalid={Boolean(error)}
                          aria-describedby={error ? errorId : hintId}
                          className={`h-8 min-w-40 rounded-sm border bg-white px-2 text-[11px] font-semibold outline-none ${
                            error
                              ? "border-red-400 bg-red-50/50 focus:border-red-600"
                              : "border-zinc-200 focus:border-red-600"
                          }`}
                        />
                      )
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
                          if (e.key !== "Enter") return;
                          runQuery({ validate: true });
                          if (Object.keys(paramErrors).length === 0) setModal(null);
                        }}
                        placeholder={guide.placeholder}
                        aria-invalid={Boolean(error)}
                        aria-describedby={error ? errorId : hintId}
                        className={`h-8 ${guide.widthClass} rounded-sm border bg-white px-2 text-[11px] font-semibold outline-none placeholder:text-zinc-300 ${
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
              {/* The spacer stands in for a label so the button lines up with the
                  inputs rather than with the hint text underneath them. */}
              <div>
                <span aria-hidden="true" className="mb-0.5 block text-[9px] font-black">
                  &nbsp;
                </span>
                <button
                  type="button"
                  onClick={() => {
                    runQuery({ validate: true });
                    // Closes on a valid submit only -- an invalid one leaves the
                    // modal open so the highlighted field stays visible.
                    if (Object.keys(paramErrors).length === 0) setModal(null);
                  }}
                  disabled={running}
                  className="flex h-8 items-center gap-1.5 rounded-sm bg-zinc-800 px-3 text-[11px] font-black text-white transition hover:bg-zinc-900 disabled:opacity-50"
                >
                  <Play size={11} /> ใช้ค่านี้
                </button>
              </div>
              </div>
            </div>
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
                className="shrink-0 rounded-sm border border-amber-300 bg-white px-2.5 py-1 text-[10px] font-black text-amber-800 transition hover:bg-amber-100"
              >
                กลับไปข้อมูลล่าสุด
              </button>
            </div>
          )}

          {(saveError || editError || mergeSourceErrorText) && (
            <div className="mx-3 mt-3 rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-bold text-red-600">
              {saveError || editError || `ดึงคอลัมน์จาก Query อื่นไม่สำเร็จ: ${mergeSourceErrorText}`}
            </div>
          )}

          {lastEdit && (
            <div className="mx-3 mt-3 flex flex-wrap items-center justify-between gap-2 rounded-sm border border-emerald-200 bg-emerald-50 px-3 py-2">
              <span className="min-w-0 text-[11px] font-bold text-emerald-800">
                บันทึกแล้ว — แก้ &quot;{lastEdit.label}&quot; เป็น{" "}
                <span className="font-mono">{String(lastEdit.writtenValue ?? "") || "(ว่าง)"}</span>
              </span>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={undoLastEdit}
                  disabled={undoing}
                  className="flex items-center gap-1 rounded-sm border border-emerald-300 bg-white px-2.5 py-1 text-[10px] font-black text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-50"
                >
                  {undoing ? <Loader2 size={11} className="animate-spin" /> : <Undo2 size={11} />}
                  เลิกทำ
                </button>
                <button
                  type="button"
                  onClick={() => setLastEdit(null)}
                  className="rounded-sm p-1 text-emerald-600 transition hover:bg-emerald-100"
                  aria-label="ปิด"
                >
                  <X size={11} />
                </button>
              </div>
            </div>
          )}

          {/* In sheet mode this fills the space between the panel header and the
              sheet tabs. The table scrolls inside it while pagination stays at
              the bottom edge. */}
          <div
            ref={docked ? dockedBodyRef : null}
            className={`flex min-w-0 flex-col ${docked ? "min-h-0 flex-1" : ""}`}
          >
          {running ? (
            <p className="flex items-center justify-center gap-2 py-16 text-xs font-semibold text-zinc-400">
              <Loader2 size={16} className="animate-spin" /> กำลังรัน Query...
            </p>
          ) : runError ? (
            <div className="m-3 rounded-sm border border-red-200 bg-red-50 px-4 py-3 text-xs font-bold text-red-600">
              {runError}
            </div>
          ) : Object.keys(paramErrors).length > 0 && !result ? (
            <p className="px-4 py-12 text-center text-xs font-semibold text-zinc-400">
              ยังไม่มีข้อมูล — กด{" "}
              <button
                type="button"
                onClick={() => setModal("paramsInput")}
                className="font-black text-red-600 underline underline-offset-2 hover:text-red-700"
              >
                &quot;Input&quot;
              </button>{" "}
              ด้านบนเพื่อกรอกค่าตัวกรอง
            </p>
          ) : result ? (
            <>
              {view === "kpi" ? (
                <div className="overflow-auto p-3" style={{ height: chartHeight }}>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {kpiCards.map((card) => (
                      <div
                        key={card.id}
                        className="rounded-sm border border-zinc-200 bg-white p-4 shadow-sm"
                      >
                        <p className="truncate text-[10px] font-black uppercase tracking-wide text-zinc-400">
                          {SUMMARY_LABELS[card.kind]} · {card.label}
                        </p>
                        <p className="mt-1 truncate text-3xl font-black tabular-nums text-zinc-800">
                          {card.value === null ? "—" : formatCell(card.value, "number")}
                        </p>
                      </div>
                    ))}
                  </div>
                  {kpiCards.length === 1 && (
                    <p className="mt-3 rounded-sm border border-dashed border-zinc-200 px-3 py-4 text-center text-[10px] font-semibold text-zinc-400">
                      อยากเห็นตัวเลขอื่นด้วย? กลับไปดูเป็นตาราง แล้วชี้ที่หัวคอลัมน์ที่เป็นตัวเลข
                      กดปุ่ม Σ เพื่อเลือกว่าจะ รวม / เฉลี่ย / ต่ำสุด / สูงสุด — คอลัมน์นั้นจะขึ้นเป็นการ์ดตรงนี้
                    </p>
                  )}
                </div>
              ) : view === "chart" && layout.chart ? (
                <PanelChart
                  chart={layout.chart}
                  columns={visibleColumns}
                  rows={displayRows}
                  height={chartHeight}
                />
              ) : view === "chart" ? (
                <div
                  className="flex items-center justify-center px-4 text-[11px] font-semibold text-zinc-400"
                  style={{ height: chartHeight }}
                >
                  ยังไม่ได้ตั้งค่ากราฟ — กดปุ่มตั้งค่ากราฟเพื่อเลือกแกน X/Y
                </div>
              ) : (
                <PanelTable
                  columns={visibleColumns}
                  allColumns={displayColumns}
                  rows={pagedRows}
                  layout={layout}
                  mutateLayout={mutateLayout}
                  canCustomizeLayout={canCustomizeLayout}
                  height={bodyHeight}
                  viewportHeight={chartHeight}
                  canEdit={canEditCells}
                  editableColumns={editableColumns}
                  editableInputs={sharedEditable?.inputs || []}
                  lookupOptions={lookupOptions}
                  editPending={editPending}
                  onEditCell={editCell}
                  changedKeys={changedCellKeys}
                  onDeleteRow={
                    canDeleteRows && sharedEditable.allowDelete && !viewingSnapshot
                      ? deleteRow
                      : null
                  }
                  // Only a query that writes somewhere has a history worth
                  // showing -- everything else has never been edited here.
                  onRowHistory={sharedEditable && !viewingSnapshot ? openRowHistory : null}
                  columnValueFilters={columnValueFilters}
                  columnValueOptions={columnValueOptions}
                  onSetColumnFilter={(colId, values) => {
                    setColumnValueFilters((prev) => {
                      const next = { ...prev };
                      if (values.length) next[colId] = values;
                      else delete next[colId];
                      return next;
                    });
                    setPage(1);
                  }}
                  onOpenColumnFormat={(column) => openColumnModal("formats", column)}
                  onOpenColumnRules={(column) => openColumnModal("rules", column)}
                  onEditComputedColumn={(column) => openColumnModal("computed", column)}
                  onDrill={layout.drill && onDrill ? drillRow : null}
                  drillLabel={`เปิด ${
                    queries.find((item) => item.id === layout.drill?.queryId)?.name || "Query"
                  } ด้วยค่าจากแถวนี้`}
                  canvasScale={canvasScale}
                  canUseGameinfoTools={canCustomizeLayout}
                  rowOffset={pageOffset}
                  draftRow={!viewingSnapshot ? draftRow : null}
                  onDraftChange={changeDraftValue}
                  onDraftSave={saveDraftRow}
                  onDraftCancel={cancelDraftRow}
                  draftSaving={draftSaving}
                  cellNotes={notesEnabled ? cellNotes : null}
                  pkValueOf={pkValueOf}
                  onSaveNote={notesEnabled && !viewingSnapshot ? saveNote : null}
                  onPeekCell={peekCell}
                />
              )}

              {view === "table" && (
                <PaginationBar
                  rowCount={displayRows.length}
                  page={activePage}
                  pageCount={pageCount}
                  pageSize={pageSize}
                  tableTone={layout.tableTone}
                  onPageChange={(next) => {
                    if (
                      confirmDiscardDraft(
                        "ยังไม่ได้บันทึกแถวที่กำลังกรอก — เปลี่ยนหน้าแล้วข้อมูลนี้จะหายไป ยืนยันไหม?"
                      )
                    ) {
                      setPage(next);
                    }
                  }}
                  onPageSizeChange={(next) => {
                    if (
                      confirmDiscardDraft(
                        "ยังไม่ได้บันทึกแถวที่กำลังกรอก — เปลี่ยนขนาดหน้าแล้วข้อมูลนี้จะหายไป ยืนยันไหม?"
                      )
                    ) {
                      setPageSize(next);
                      setPage(1);
                    }
                  }}
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
          </div>
        </>
      )}

      {canCustomizeLayout && !docked && FRAME_HANDLES.filter((handle) => !panel.collapsed || handle.dirY === 0).map((handle) => (
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

      {/* Every settings modal is a `fixed inset-0` overlay, and the panel sits on a
          transformed, zoomable canvas -- which would make `fixed` resolve against the
          canvas and scale with it. Portal to the body so they stay viewport-sized. */}
      {modal &&
        createPortal(
          <>
      {modal === "computed" && result && (
        <ComputedColumnModal
          // Columns pulled in from another query, and every other formula
          // column, are offered by the same label the table shows for them --
          // so a formula can read `[ราคาทุน · ราคาทุนสินค้า]` or another
          // computed column's name the same way it reads a plain result
          // column.
          availableNames={computedFormulaRefNames.available}
          sampleRow={computedFormulaSampleRow}
          initialColumn={modalComputedColumn}
          onClose={closeColumnModal}
          onAdd={({ label, formula, type }) => {
            const key = `calc_${Date.now()}`;
            mutateLayout((prev) => ({
              ...prev,
              computed: [...prev.computed, { key, label, formula, type }],
            }));
            closeColumnModal();
          }}
          onSave={({ label, formula, type }) => {
            mutateLayout((prev) => ({
              ...prev,
              labels: Object.fromEntries(
                Object.entries(prev.labels).filter(([colId]) => colId !== modalColumnId)
              ),
              computed: prev.computed.map((item) =>
                `#${item.key}` === modalColumnId
                  ? { ...item, label, formula, type }
                  : item
              ),
            }));
            closeColumnModal();
          }}
        />
      )}
      {modal === "share" && (
        <ShareLinkModal queryId={query.id} onClose={() => setModal(null)} />
      )}
      {rowHistory && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-4 backdrop-blur-sm"
          onClick={() => setRowHistory(null)}
        >
          <div
            className="flex max-h-[80vh] w-full max-w-xl flex-col rounded-sm bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-black text-zinc-700">
                  <History size={15} className="text-red-600" /> ประวัติการแก้ไขของแถวนี้
                </p>
                <p className="truncate text-[10px] font-semibold text-zinc-400">
                  {sharedEditable?.pk} = {String(rowHistory.pkValue)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRowHistory(null)}
                className="shrink-0 rounded-sm border border-zinc-200 p-1.5 text-zinc-500 transition hover:bg-zinc-50"
                aria-label="ปิด"
              >
                <X size={14} />
              </button>
            </div>
            {rowHistory.loading ? (
              <p className="flex items-center gap-2 py-10 text-xs font-bold text-zinc-400">
                <Loader2 size={14} className="animate-spin" /> กำลังโหลด...
              </p>
            ) : rowHistory.error ? (
              <p className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-bold text-red-600">
                {rowHistory.error}
              </p>
            ) : rowHistory.entries.length === 0 ? (
              <p className="rounded-sm border border-dashed border-zinc-200 px-3 py-10 text-center text-[11px] font-semibold text-zinc-400">
                แถวนี้ยังไม่เคยถูกแก้ไขผ่านระบบนี้
              </p>
            ) : (
              <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
                {rowHistory.entries.map((entry) => (
                  <div key={entry.id} className="rounded-sm border border-zinc-200 bg-zinc-50 p-2.5">
                    <div className="mb-1 flex flex-wrap items-center justify-between gap-1">
                      <span className="text-[10px] font-black text-zinc-700">{entry.column}</span>
                      <span className="text-[9px] font-semibold text-zinc-400">
                        {entry.actor || "ไม่ทราบผู้แก้"} ·{" "}
                        {new Date(entry.createdAt).toLocaleString("th-TH")}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-semibold">
                      <span className="rounded-sm bg-red-50 px-1.5 py-0.5 font-mono text-red-600 line-through">
                        {entry.oldValue === null || entry.oldValue === "" ? "(ว่าง)" : entry.oldValue}
                      </span>
                      <span className="text-zinc-400">→</span>
                      <span className="rounded-sm bg-emerald-50 px-1.5 py-0.5 font-mono text-emerald-700">
                        {entry.newValue === null || entry.newValue === "" ? "(ว่าง)" : entry.newValue}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {modal === "params" && (
        <ParamsSettingsModal
          sqlText={query.sqlText}
          params={layout.params}
          connectionId={query.connectionId}
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
            // The set of column-sourced params may have just changed --
            // forget what was cached so the next fetch picks up the new config.
            columnParamOptionsLoadedForRef.current = null;
            setColumnParamOptions({});
            setModal(null);
          }}
        />
      )}
      {modal === "editable" && result && (
        <EditableSettingsModal
          queryId={query.id}
          connectionId={query.connectionId}
          columnNames={result.columns.map((col) => col.name)}
          editable={layout.editable}
          sqlText={query.sqlText}
          onClose={() => setModal(null)}
          onSave={(editable) => {
            mutateLayout((prev) => ({ ...prev, editable }));
            setModal(null);
          }}
        />
      )}
      {modal === "lookups" && result && (
        <LookupsListModal
          lookups={layout.lookups}
          queries={queries}
          onEdit={(lookupId) => {
            setModalColumnId(lookupId);
            setModal("lookup");
          }}
          onRemove={(lookupId) =>
            mutateLayout((prev) => ({
              ...prev,
              lookups: prev.lookups.filter((item) => item.id !== lookupId),
            }))
          }
          onClose={closeColumnModal}
        />
      )}
      {modal === "lookup" && result && (
        <MergeModal
          query={query}
          queries={queries}
          columnNames={result.columns.map((col) => col.name)}
          merge={layout.lookups.find((item) => item.id === modalColumnId) || null}
          // Back to the list rather than closed outright: adding several
          // sources is the point of there being a list at all.
          onClose={() => setModal("lookups")}
          onRemove={
            modalColumnId
              ? () => {
                  mutateLayout((prev) => ({
                    ...prev,
                    lookups: prev.lookups.filter((item) => item.id !== modalColumnId),
                  }));
                  setModal("lookups");
                }
              : null
          }
          onSave={(value) => {
            mutateLayout((prev) => {
              if (modalColumnId && prev.lookups.some((item) => item.id === modalColumnId)) {
                return {
                  ...prev,
                  lookups: prev.lookups.map((item) =>
                    item.id === modalColumnId ? { ...value, id: modalColumnId } : item
                  ),
                };
              }
              if (prev.lookups.length >= MAX_LOOKUPS) return prev;
              return {
                ...prev,
                lookups: [...prev.lookups, { ...value, id: `lk_${Date.now()}` }],
              };
            });
            setModal("lookups");
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
      {modal === "insertForm" && (
        <InsertFormModal
          insertForm={layout.insertForm}
          connectionId={query.connectionId}
          sqlText={query.sqlText}
          onSave={(insertForm) => mutateLayout((prev) => ({ ...prev, insertForm }))}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "insertRun" && sharedInsertForm && (
        <InsertRunModal
          queryId={query.id}
          insertForm={sharedInsertForm}
          // The table can have defaults, triggers and an ordering of its own,
          // so the row is fetched back rather than guessed at.
          onDone={() => runQuery({ silent: true })}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "bulk" && result && sharedEditable && (
        <BulkEditModal
          editable={baseTableEditable}
          columnNames={result.columns.map((col) => col.name)}
          onApply={applyBulkEdits}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "findReplace" && result && sharedEditable && (
        <FindReplaceModal
          editable={baseTableEditable}
          rows={findReplaceRows}
          onApply={applyBulkEdits}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "formats" && result && (
        <FormatsModal
          columns={visibleColumns}
          formats={layout.formats}
          freeze={layout.freeze}
          tableTone={layout.tableTone}
          tableBorderTone={layout.tableBorderTone}
          initialColId={modalColumnId}
          onClose={closeColumnModal}
          onSave={({ formats, freeze, tableTone, tableBorderTone }) => {
            mutateLayout((prev) => ({ ...prev, formats, freeze, tableTone, tableBorderTone }));
            closeColumnModal();
          }}
        />
      )}
      {modal === "rules" && result && (
        <RulesModal
          columns={visibleColumns}
          rules={layout.rules}
          initialColId={modalColumnId}
          onClose={closeColumnModal}
          onSave={(rules) => {
            mutateLayout((prev) => ({ ...prev, rules }));
            closeColumnModal();
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
          </>,
          document.body
        )}
    </section>
  );
}
