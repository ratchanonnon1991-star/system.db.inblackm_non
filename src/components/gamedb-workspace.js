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
  Activity,
  ChevronDown,
  Database,
  FileSpreadsheet,
  Eye,
  Gamepad2,
  History,
  Layers,
  LayoutGrid,
  Loader2,
  Lock,
  LogOut,
  Moon,
  Pencil,
  Plus,
  Redo2,
  Search,
  Server,
  Star,
  Sun,
  Table,
  Trash2,
  Undo2,
  User,
  Users,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { createPortal } from "react-dom";
import NextLink from "next/link";
import { apiJson } from "@/lib/api-json";
import { buildXlsxBlob } from "@/lib/gamedb-xlsx";
import QueryPanel from "@/components/query-panel";
import {
  ConnectionsModal,
  QueryEditorModal,
  UsersModal,
} from "@/components/gamedb-modals";
import ViewsModal from "@/components/views-modal";
import { EditLogModal, HealthModal } from "@/components/admin-modals";

const WORKSPACE_STORAGE_KEY = "gamedb.workspace.v1";
const DEFAULT_PANEL_HEIGHT = 420;
const DEFAULT_PANEL_WIDTH = 720;
const MIN_PANEL_HEIGHT = 140;
const MAX_PANEL_HEIGHT = 1600;
const MIN_PANEL_WIDTH = 280;
// The canvas scrolls, so a panel may be wider than the viewport it is seen through.
const MAX_PANEL_WIDTH = 6000;
const PANEL_GAP = 16;
const PANEL_CHROME_ESTIMATE = 300;
const CANVAS_MIN_HEIGHT = 520;

// A description that only restates the name earns no room in the list.
function subtitleOf(query) {
  const description = String(query.description || "").trim();
  return description && description !== String(query.name || "").trim() ? description : "";
}

function clampPanelHeight(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return DEFAULT_PANEL_HEIGHT;
  return Math.round(Math.min(MAX_PANEL_HEIGHT, Math.max(MIN_PANEL_HEIGHT, num)));
}

function clampPanelWidth(value, containerWidth) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return Math.min(DEFAULT_PANEL_WIDTH, containerWidth || DEFAULT_PANEL_WIDTH);
  }
  return Math.round(Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, num)));
}

// The canvas has no edges in any direction. A negative x or y is a real place --
// the canvas origin travels with the leftmost and topmost panel, so scrolling
// still reaches it.
function clampPanelPosition(value) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.round(num) : null;
}

function panelEstimatedHeight(panel) {
  return panel.collapsed ? 72 : clampPanelHeight(panel.height) + PANEL_CHROME_ESTIMATE;
}

function makePanel(queryId, position = {}) {
  return {
    queryId,
    x: clampPanelPosition(position.x),
    y: clampPanelPosition(position.y),
    width: clampPanelWidth(position.width, 0),
    height: DEFAULT_PANEL_HEIGHT,
    collapsed: false,
  };
}

function arrangeUnpositionedPanels(panels, containerWidth) {
  const width = Math.max(MIN_PANEL_WIDTH, containerWidth || DEFAULT_PANEL_WIDTH);
  const columns = width >= 1100 ? 2 : 1;
  const columnWidth =
    columns === 2
      ? Math.max(MIN_PANEL_WIDTH, Math.floor((width - PANEL_GAP) / 2))
      : width;
  const columnBottoms = Array(columns).fill(0);
  const occupiedBottom = panels.reduce(
    (bottom, panel) =>
      panel.x !== null && panel.y !== null
        ? Math.max(bottom, panel.y + panelEstimatedHeight(panel) + PANEL_GAP)
        : bottom,
    0
  );
  if (occupiedBottom > 0) columnBottoms.fill(occupiedBottom);

  return panels.map((panel) => {
    const panelWidth = clampPanelWidth(panel.width || columnWidth, width);
    if (panel.x !== null && panel.y !== null) return { ...panel, width: panelWidth };
    const column = columnBottoms.indexOf(Math.min(...columnBottoms));
    const placed = {
      ...panel,
      x: column * (columnWidth + PANEL_GAP),
      y: columnBottoms[column],
      width: Math.min(panelWidth, columnWidth),
    };
    columnBottoms[column] += panelEstimatedHeight(placed) + PANEL_GAP;
    return placed;
  });
}

function arrangePanelsByMode(panels, mode, containerWidth, renderedHeights) {
  const canvasWidth = containerWidth || DEFAULT_PANEL_WIDTH;
  const panelHeight = (panel) =>
    renderedHeights[panel.queryId] || panelEstimatedHeight(panel);

  if (mode === "vertical") {
    let y = 0;
    return panels.map((panel) => {
      const placed = {
        ...panel,
        x: 0,
        y,
        width: Math.min(canvasWidth, panel.width || DEFAULT_PANEL_WIDTH),
      };
      y += panelHeight(panel) + PANEL_GAP;
      return placed;
    });
  }

  if (mode === "horizontal") {
    let x = 0;
    let y = 0;
    let rowHeight = 0;
    return panels.map((panel) => {
      const width = Math.min(panel.width || DEFAULT_PANEL_WIDTH, canvasWidth);
      const height = panelHeight(panel);
      if (x > 0 && x + width > canvasWidth) {
        x = 0;
        y += rowHeight + PANEL_GAP;
        rowHeight = 0;
      }
      const placed = { ...panel, x, y, width };
      x += width + PANEL_GAP;
      rowHeight = Math.max(rowHeight, height);
      return placed;
    });
  }

  const columns = canvasWidth >= 1100 && panels.length > 1 ? 2 : 1;
  const columnWidth =
    columns === 2
      ? Math.floor((canvasWidth - PANEL_GAP) / 2)
      : Math.min(canvasWidth, DEFAULT_PANEL_WIDTH);
  const rowHeights = [];
  panels.forEach((panel, index) => {
    const row = Math.floor(index / columns);
    rowHeights[row] = Math.max(rowHeights[row] || 0, panelHeight(panel));
  });
  const rowTops = rowHeights.map((_, row) =>
    rowHeights
      .slice(0, row)
      .reduce((top, height) => top + height + PANEL_GAP, 0)
  );

  return panels.map((panel, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    return {
      ...panel,
      x: column * (columnWidth + PANEL_GAP),
      y: rowTops[row],
      width: columnWidth,
    };
  });
}

function readStoredPanels() {
  try {
    const raw = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && Number.isFinite(Number(item.queryId)))
      .map((item) => ({
        queryId: Number(item.queryId),
        x: clampPanelPosition(item.x),
        y: clampPanelPosition(item.y),
        width: clampPanelWidth(item.width, 0),
        height: clampPanelHeight(item.height),
        collapsed: Boolean(item.collapsed),
      }));
  } catch {
    return [];
  }
}

// Folders are free text with no colour of their own, so the dot on a sheet tab
// is derived from the name: the same folder always lands on the same hue, which
// is all the grouping cue the strip needs.
const TAB_DOT_COLORS = [
  "#dc2626",
  "#ea580c",
  "#ca8a04",
  "#16a34a",
  "#0891b2",
  "#2563eb",
  "#7c3aed",
  "#db2777",
];
function folderColor(folder) {
  const name = (folder || "").trim();
  if (!name) return "#a1a1aa";
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.codePointAt(0)) % 100000;
  return TAB_DOT_COLORS[hash % TAB_DOT_COLORS.length];
}

const THEME_KEY = "gamedb.theme";
const PINNED_KEY = "gamedb.pinned";
const SHEET_MODE_KEY = "gamedb.sheet-mode";
const SHEET_HEIGHT_KEY = "gamedb.sheet-height";
const SELECTED_PANEL_KEY = "gamedb.selected-panel";
const MIN_SHEET_HEIGHT = 288;
const MAX_SHEET_HEIGHT = 2000;

function clampSheetHeight(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const height = Number(value);
  if (!Number.isFinite(height)) return null;
  return Math.round(Math.min(MAX_SHEET_HEIGHT, Math.max(MIN_SHEET_HEIGHT, height)));
}

function CanvasToolbar({
  layoutLocked,
  historyAvailability,
  onUndo,
  onRedo,
  isSuperAdmin,
  activeView,
  templateSaveState,
  onTogglePreview,
  zoom,
  onZoom,
  sheetMode,
}) {
  return (
    <div className="flex shrink-0 items-center gap-1 overflow-x-auto">
      <button
        type="button"
        onClick={onUndo}
        disabled={layoutLocked || !historyAvailability.past}
        title="ย้อนการจัดวาง (Ctrl+Z)"
        className="rounded-sm p-1 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30"
      >
        <Undo2 size={14} />
      </button>
      <button
        type="button"
        onClick={onRedo}
        disabled={layoutLocked || !historyAvailability.future}
        title="ทำซ้ำ (Ctrl+Shift+Z)"
        className="rounded-sm p-1 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30"
      >
        <Redo2 size={14} />
      </button>
      {isSuperAdmin && activeView && (
        <>
          <span
            className={`rounded-sm px-2 py-1 text-[9px] font-black ${
              templateSaveState === "error"
                ? "bg-red-50 text-red-600"
                : ["saving", "pending"].includes(templateSaveState)
                  ? "bg-amber-50 text-amber-700"
                  : "bg-emerald-50 text-emerald-700"
            }`}
          >
            {templateSaveState === "error"
              ? "บันทึกไม่สำเร็จ"
              : templateSaveState === "saving"
                ? "กำลังบันทึก..."
                : templateSaveState === "pending"
                  ? "รอบันทึก..."
                  : "บันทึกแล้ว"}
          </span>
          <button
            type="button"
            onClick={onTogglePreview}
            className="flex h-8 items-center gap-1 rounded-sm border border-zinc-200 px-2 text-[10px] font-black text-zinc-600 hover:bg-zinc-50"
            title="ดูหน้าจอแบบ User"
          >
            <Eye size={12} /> User
          </button>
        </>
      )}
      {!sheetMode && (
        <>
      <span className="mx-0.5 h-5 w-px bg-zinc-200" />
      <button
        type="button"
        onClick={() => onZoom(zoom - 0.1)}
        className="rounded-sm p-1 text-zinc-500 hover:bg-zinc-100"
        title="ซูมออก"
      >
        <ZoomOut size={14} />
      </button>
      <button
        type="button"
        onClick={() => onZoom(1)}
        className="min-w-11 rounded-sm px-1.5 py-1.5 text-[10px] font-black text-zinc-600 hover:bg-zinc-100"
        title="คืน Zoom เป็น 100%"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        type="button"
        onClick={() => onZoom(zoom + 0.1)}
        className="rounded-sm p-1 text-zinc-500 hover:bg-zinc-100"
        title="ซูมเข้า"
      >
        <ZoomIn size={14} />
      </button>
        </>
      )}
    </div>
  );
}

function WorkspaceViewControls({
  layoutLocked,
  historyRevision,
  onArrange,
  sheetMode,
  onToggleSheetMode,
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      {!layoutLocked && (
        <select
          key={historyRevision}
          defaultValue=""
          onChange={(event) => {
            if (event.target.value) onArrange(event.target.value);
            event.target.value = "";
          }}
          className="h-9 rounded-sm border border-zinc-200 bg-white px-2 text-[10px] font-black text-zinc-600"
          title="จัดกล่องทุก Query อัตโนมัติ"
        >
          <option value="">จัดอัตโนมัติ</option>
          <option value="grid">แบบ Grid</option>
          <option value="vertical">เรียงแนวตั้ง</option>
          <option value="horizontal">เรียงต่อกัน</option>
        </select>
      )}
      <button
        type="button"
        onClick={onToggleSheetMode}
        className={`flex h-9 items-center gap-1 rounded-sm border px-3 text-[10px] font-black transition ${
          sheetMode
            ? "border-red-600 bg-red-600 text-white"
            : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
        }`}
        title={
          sheetMode
            ? "กลับไปแบบ Canvas (วางกล่องเองได้)"
            : "สลับเป็นแบบชีต — ทีละตาราง มีแท็บด้านล่าง"
        }
      >
        {sheetMode ? <LayoutGrid size={12} /> : <Table size={12} />}
        {sheetMode ? "Canvas" : "ชีต"}
      </button>
    </div>
  );
}

export default function GamedbWorkspace({ me, onLoggedOut, onBackToMenu, initialViewId = null }) {
  const isSuperAdmin = me.role === "admin";
  const isTemplateUser = me.role === "user";
  const [initialViewNotFound, setInitialViewNotFound] = useState(false);

  const [dark, setDark] = useState(false);
  const [pinned, setPinned] = useState([]);
  // Sheet view: one table at a time with a tab per open table along the bottom,
  // for people who would rather flip between them than arrange them on a canvas.
  const [sheetMode, setSheetMode] = useState(false);
  // Null means automatic: flex fills exactly the viewport space left below the
  // page controls. Once dragged, the browser-specific height is remembered.
  const [sheetHeight, setSheetHeight] = useState(null);
  const sheetHeightRef = useRef(null);
  const sheetFrameRef = useRef(null);
  const [sheetResize, setSheetResize] = useState(null);

  // Theme, pins and sheet-view preferences are per-browser; read them once on mount.
  useEffect(() => {
    try {
      const storedTheme = window.localStorage.getItem(THEME_KEY);
      const prefersDark =
        storedTheme === "dark" ||
        (!storedTheme && window.matchMedia("(prefers-color-scheme: dark)").matches);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading a browser preference is exactly what an effect is for
      setDark(prefersDark);
      setPinned(JSON.parse(window.localStorage.getItem(PINNED_KEY) || "[]"));
      setSheetMode(window.localStorage.getItem(SHEET_MODE_KEY) === "on");
      const storedSheetHeight = clampSheetHeight(
        window.localStorage.getItem(SHEET_HEIGHT_KEY)
      );
      if (storedSheetHeight !== null) {
        sheetHeightRef.current = storedSheetHeight;
        setSheetHeight(storedSheetHeight);
      }
    } catch {
      setDark(false);
    }
  }, []);

  const toggleSheetMode = useCallback(() => {
    setSheetMode((prev) => {
      try {
        window.localStorage.setItem(SHEET_MODE_KEY, prev ? "off" : "on");
      } catch {
        // preference is cosmetic; ignore a blocked storage
      }
      return !prev;
    });
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  const toggleTheme = () => {
    setDark((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(THEME_KEY, next ? "dark" : "light");
      } catch {
        // preference is cosmetic; ignore a blocked storage
      }
      return next;
    });
  };

  const togglePin = (queryId) => {
    setPinned((prev) => {
      const next = prev.includes(queryId)
        ? prev.filter((id) => id !== queryId)
        : [...prev, queryId];
      try {
        window.localStorage.setItem(PINNED_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const logout = async () => {
    try {
      await apiJson("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore — cookie clear is best-effort, drop local state either way
    }
    onLoggedOut();
  };

  const [queries, setQueries] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState("");
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [selectedPanelId, setSelectedPanelId] = useState(null);
  // Which tab was open is part of where the user left off, the same as the
  // theme or the sheet toggle. The stored value must not be written back before
  // it has been read, or the first render's null would erase it.
  const selectionRestoredRef = useRef(false);
  const selectionWrittenRef = useRef(false);
  useEffect(() => {
    try {
      // Stored as JSON so a numeric query id comes back a number and still
      // matches the panels.
      const stored = window.localStorage.getItem(SELECTED_PANEL_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading a browser preference is exactly what an effect is for
      if (stored) setSelectedPanelId(JSON.parse(stored));
    } catch {
      // ignore
    }
    selectionRestoredRef.current = true;
  }, []);
  useEffect(() => {
    // The mount pass still holds the initial null — the restored value only
    // arrives on the render after it, so the first pass writes nothing.
    if (!selectionRestoredRef.current || !selectionWrittenRef.current) {
      selectionWrittenRef.current = true;
      return;
    }
    try {
      if (selectedPanelId === null || selectedPanelId === undefined) {
        window.localStorage.removeItem(SELECTED_PANEL_KEY);
      } else {
        window.localStorage.setItem(SELECTED_PANEL_KEY, JSON.stringify(selectedPanelId));
      }
    } catch {
      // ignore
    }
  }, [selectedPanelId]);
  const [queryListHost, setQueryListHost] = useState(null);

  const [panels, setPanels] = useState([]);
  const panelsStateRef = useRef([]);
  const historyPastRef = useRef([]);
  const historyFutureRef = useRef([]);
  const interactionStartRef = useRef(null);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [historyAvailability, setHistoryAvailability] = useState({
    past: false,
    future: false,
  });
  const hydrated = useRef(false);
  const panelsRef = useRef(null);
  const canvasOriginRef = useRef(null);
  const viewportRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [renderedPanelHeights, setRenderedPanelHeights] = useState({});
  const renderedPanelHeightsRef = useRef({});
  const arrangeFrameRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  // The canvas is panned by scrolling its viewport, not by a transform: the
  // scrollbars, shift+wheel and drag-to-pan then all move the same thing, and
  // nothing can be pushed into negative space where scrolling cannot reach it.
  const panDragRef = useRef(null);
  const [snapGuides, setSnapGuides] = useState({ x: null, y: null });
  const [previewAsUser, setPreviewAsUser] = useState(false);

  useEffect(() => {
    panelsStateRef.current = panels;
  }, [panels]);

  const replacePanels = useCallback((nextOrUpdater, { record = true } = {}) => {
    const current = panelsStateRef.current;
    const next =
      typeof nextOrUpdater === "function" ? nextOrUpdater(current) : nextOrUpdater;
    if (next === current || JSON.stringify(next) === JSON.stringify(current)) return;
    if (record) {
      historyPastRef.current = [...historyPastRef.current.slice(-49), current];
      historyFutureRef.current = [];
      setHistoryRevision((value) => value + 1);
      setHistoryAvailability({ past: true, future: false });
    }
    panelsStateRef.current = next;
    setPanels(next);
  }, []);

  const beginPanelInteraction = useCallback(() => {
    if (!interactionStartRef.current) {
      interactionStartRef.current = panelsStateRef.current;
    }
  }, []);

  const endPanelInteraction = useCallback(() => {
    const start = interactionStartRef.current;
    interactionStartRef.current = null;
    setSnapGuides({ x: null, y: null });
    if (!start || JSON.stringify(start) === JSON.stringify(panelsStateRef.current)) return;
    historyPastRef.current = [...historyPastRef.current.slice(-49), start];
    historyFutureRef.current = [];
    setHistoryRevision((value) => value + 1);
    setHistoryAvailability({ past: true, future: false });
  }, []);

  const undoPanels = useCallback(() => {
    const previous = historyPastRef.current.at(-1);
    if (!previous) return;
    historyPastRef.current = historyPastRef.current.slice(0, -1);
    historyFutureRef.current = [panelsStateRef.current, ...historyFutureRef.current.slice(0, 49)];
    panelsStateRef.current = previous;
    setPanels(previous);
    setHistoryRevision((value) => value + 1);
    setHistoryAvailability({
      past: historyPastRef.current.length > 0,
      future: true,
    });
  }, []);

  const redoPanels = useCallback(() => {
    const next = historyFutureRef.current[0];
    if (!next) return;
    historyFutureRef.current = historyFutureRef.current.slice(1);
    historyPastRef.current = [...historyPastRef.current.slice(-49), panelsStateRef.current];
    panelsStateRef.current = next;
    setPanels(next);
    setHistoryRevision((value) => value + 1);
    setHistoryAvailability({
      past: true,
      future: historyFutureRef.current.length > 0,
    });
  }, []);

  const [editorModal, setEditorModal] = useState(null);
  const [connections, setConnections] = useState([]);
  const [connectionsModal, setConnectionsModal] = useState(false);
  const [usersModal, setUsersModal] = useState(false);
  const [healthModal, setHealthModal] = useState(false);
  const [editLogModal, setEditLogModal] = useState(false);

  // Screen templates: a saved set of panels an admin can hand to other users.
  const [views, setViews] = useState([]);
  const [viewsModal, setViewsModal] = useState(false);
  const [activeView, setActiveView] = useState(null);
  // isTemplateUser/previewAsUser is about who this account IS -- it also
  // hides ever switching away from the assigned template (see the header's
  // view picker below). A template marked "ดูอย่างเดียว" is about what THIS
  // template allows -- everyone it's open for is locked out of editing it
  // while it's open, admin included, but can still switch away from it. Kept
  // as two flags so the read-only lock never accidentally traps someone on
  // the template they can't leave.
  const layoutLocked = isTemplateUser || previewAsUser;
  const editLocked = layoutLocked || Boolean(activeView?.isReadOnly);
  const [panelLayouts, setPanelLayouts] = useState({});
  const [layoutRevision, setLayoutRevision] = useState(0);
  const [templateSaveState, setTemplateSaveState] = useState("idle");
  const lastSavedConfigRef = useRef("");
  // Live layout of every open panel, kept in a ref because it changes on every
  // column drag and only matters when a template is saved.
  const liveLayouts = useRef({});
  const captureLayout = useCallback((queryId, layout) => {
    liveLayouts.current[queryId] = layout;
    setLayoutRevision((value) => value + 1);
  }, []);

  // Layouts this user saved for themselves, which win over the shared ones.
  const [myLayouts, setMyLayouts] = useState({});

  const loadMyLayouts = useCallback(async () => {
    if (isTemplateUser) {
      setMyLayouts({});
      return;
    }
    try {
      const data = await apiJson("/api/my-layouts", {
        fallbackError: "โหลด layout ส่วนตัวไม่สำเร็จ",
      });
      setMyLayouts(data.layouts || {});
    } catch {
      setMyLayouts({});
    }
  }, [isTemplateUser]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setState runs after the fetch resolves
    loadMyLayouts();
  }, [loadMyLayouts]);

  // The shared layout is the one every write endpoint reads, and the panel
  // decides whether a cell is editable from the copy it was handed here. Saving
  // it on the server without putting it back into this list left the panel
  // holding the layout from page load: the config was stored, and editing
  // stayed off until a reload.
  const rememberSharedLayout = useCallback((queryId, layout) => {
    setQueries((prev) =>
      prev.map((query) => (query.id === queryId ? { ...query, layout } : query))
    );
  }, []);

  const rememberPersonalLayout = useCallback((queryId, layout) => {
    setMyLayouts((prev) => {
      const next = { ...prev };
      if (layout) next[queryId] = layout;
      else delete next[queryId];
      return next;
    });
  }, []);

  const loadViews = useCallback(async () => {
    try {
      const data = await apiJson("/api/views", {
        fallbackError: "โหลดเทมเพลตหน้าจอไม่สำเร็จ",
      });
      setViews(data.views || []);
      return data.views || [];
    } catch {
      setViews([]);
      return [];
    }
  }, []);

  const loadConnections = useCallback(async () => {
    try {
      const data = await apiJson("/api/connections", {
        fallbackError: "โหลดรายการฐานข้อมูลไม่สำเร็จ",
      });
      setConnections(data.connections || []);
    } catch {
      setConnections([]);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setState runs after the fetch resolves
    loadConnections();
  }, [loadConnections]);

  const loadQueries = useCallback(async () => {
    setLoadingList(true);
    setListError("");
    try {
      const data = await apiJson("/api/queries", {
        fallbackError: "โหลดรายการ Query ไม่สำเร็จ",
      });
      setQueries(data.queries || []);
      return data.queries || [];
    } catch (err) {
      setListError(err.message);
      return [];
    } finally {
      setLoadingList(false);
    }
  }, []);

  const applyView = useCallback((view) => {
    const panelsFromView = (view.config?.panels || []).map((panel) => ({
      queryId: panel.queryId,
      x: clampPanelPosition(panel.x),
      y: clampPanelPosition(panel.y),
      width: panel.width ?? null,
      height: clampPanelHeight(panel.height),
      collapsed: Boolean(panel.collapsed),
    }));
    const layouts = {};
    for (const panel of view.config?.panels || []) {
      if (panel.layout) layouts[panel.queryId] = panel.layout;
    }
    setPanelLayouts(layouts);
    panelsStateRef.current = panelsFromView;
    setPanels(panelsFromView);
    setActiveView(view);
    lastSavedConfigRef.current = JSON.stringify(view.config || { panels: [] });
    historyPastRef.current = [];
    historyFutureRef.current = [];
    setHistoryRevision((value) => value + 1);
    setHistoryAvailability({ past: false, future: false });
    setTemplateSaveState("saved");
  }, []);

  const leaveView = () => {
    setActiveView(null);
    setPanelLayouts({});
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setState runs after the fetches resolve
    Promise.all([loadQueries(), loadViews()]).then(([list, viewList]) => {
      if (hydrated.current) return;
      hydrated.current = true;
      const ids = new Set(list.map((query) => query.id));

      // A link to /view/<id> opens that template directly, bypassing whatever
      // this browser would otherwise restore -- listViewsFor already filtered
      // viewList to what this user is allowed to see, so anything not in it
      // is either deleted or not shared with them, not a permission bug here.
      if (initialViewId) {
        const requested = viewList.find((view) => Number(view.id) === Number(initialViewId));
        if (requested && requested.config?.panels?.length) {
          applyView(requested);
          return;
        }
        setInitialViewNotFound(true);
      }

      const fallback = viewList.find(
        (view) => view.isDefault && view.config?.panels?.length
      );

      // User accounts never restore a browser-specific workspace. They always
      // start from an admin-owned template, falling back to the first template
      // explicitly available to them when none is marked as default.
      if (isTemplateUser) {
        const assigned =
          viewList.find(
            (view) =>
              Number(view.id) === Number(me.defaultViewId) &&
              view.config?.panels?.length
          ) ||
          fallback ||
          viewList.find((view) => view.config?.panels?.length);
        if (assigned) applyView(assigned);
        return;
      }

      const stored = readStoredPanels().filter((panel) => ids.has(panel.queryId));
      if (stored.length > 0) {
        panelsStateRef.current = stored;
        setPanels(stored);
        return;
      }
      // Nothing of their own yet: hand them the default template if an admin
      // set one up, otherwise just open the first query.
      if (fallback) {
        applyView(fallback);
      } else if (list.length > 0) {
        const initialPanels = [makePanel(list[0].id)];
        panelsStateRef.current = initialPanels;
        setPanels(initialPanels);
      }
    });
  }, [loadQueries, loadViews, applyView, isTemplateUser, me.defaultViewId, initialViewId]);

  useEffect(() => {
    if (!hydrated.current || isTemplateUser) return;
    try {
      window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(panels));
    } catch {
      // storage can be full or blocked — the workspace still works in-memory
    }
  }, [panels, isTemplateUser]);

  const measureContainer = useCallback(() => {
    const element = viewportRef.current;

    return {
      width: Math.round(element?.clientWidth || 0),
      height: Math.round(element?.clientHeight || 0),
    };
  }, []);

  // Panels live on an absolute-positioned canvas. Place legacy panels without
  // x/y into a tidy starting grid sized to what is currently on screen.
  useEffect(() => {
    const measure = () => {
      const { width, height } = measureContainer();
      if (!width || !height) return;
      setContainerWidth(width);
      setPanels((prev) => {
        const arranged = arrangeUnpositionedPanels(prev, width);
        return arranged.some(
          (panel, index) =>
            panel.x !== prev[index]?.x ||
            panel.y !== prev[index]?.y ||
            panel.width !== prev[index]?.width
        )
          ? arranged
          : prev;
      });
    };
    measure();
    // The first pass can land before the layout settles, so take another look
    // on the next frame and whenever the set of open panels changes.
    const raf = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (observer && viewportRef.current) observer.observe(viewportRef.current);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [measureContainer, panels.length]);

  const openIds = useMemo(
    () => new Set(panels.map((panel) => panel.queryId)),
    [panels]
  );

  // Params handed to a panel that was opened by drilling from another one.
  const [drillParams, setDrillParams] = useState({});

  const openDrill = useCallback((queryId, params) => {
    setDrillParams((prev) => ({ ...prev, [queryId]: params }));
    setSelectedPanelId(queryId);
    replacePanels((prev) =>
      prev.some((panel) => panel.queryId === queryId)
        ? prev
        : arrangeUnpositionedPanels([...prev, makePanel(queryId)], containerWidth)
    );
  }, [containerWidth, replacePanels]);

  const togglePanel = (queryId) => {
    const isOpen = panelsStateRef.current.some(
      (panel) => panel.queryId === queryId
    );
    setSelectedPanelId((current) =>
      isOpen ? (current === queryId ? null : current) : queryId
    );
    replacePanels((prev) =>
      prev.some((panel) => panel.queryId === queryId)
        ? prev.filter((panel) => panel.queryId !== queryId)
        : arrangeUnpositionedPanels([...prev, makePanel(queryId)], containerWidth)
    );
  };

  const closePanel = (queryId) => {
    setSelectedPanelId((current) => (current === queryId ? null : current));
    replacePanels((prev) => prev.filter((panel) => panel.queryId !== queryId));
  };

  const updatePanel = (queryId, updater) => {
    replacePanels((prev) =>
      prev.map((panel) => (panel.queryId === queryId ? { ...panel, ...updater(panel) } : panel))
    );
  };

  const movePanelTo = useCallback(
    (queryId, x, y) => {
      const current = panelsStateRef.current;
      const moving = current.find((panel) => panel.queryId === queryId);
      if (!moving) return;
      const width = clampPanelWidth(moving.width, containerWidth);
      const height =
        renderedPanelHeights[queryId] || panelEstimatedHeight(moving);
      let nextX = Math.round(x);
      let nextY = Math.round(y);
      let guideX = null;
      let guideY = null;
      let bestX = 4;
      let bestY = 4;

      for (const other of current) {
        if (other.queryId === queryId) continue;
        const otherWidth = clampPanelWidth(other.width, containerWidth);
        const otherHeight =
          renderedPanelHeights[other.queryId] || panelEstimatedHeight(other);
        const movingXs = [nextX, nextX + width / 2, nextX + width];
        const otherXs = [
          other.x || 0,
          (other.x || 0) + otherWidth / 2,
          (other.x || 0) + otherWidth,
        ];
        const movingYs = [nextY, nextY + height / 2, nextY + height];
        const otherYs = [
          other.y || 0,
          (other.y || 0) + otherHeight / 2,
          (other.y || 0) + otherHeight,
        ];
        movingXs.forEach((edge, edgeIndex) => {
          otherXs.forEach((target) => {
            const delta = target - edge;
            if (Math.abs(delta) < bestX) {
              bestX = Math.abs(delta);
              nextX += delta;
              guideX = target;
              movingXs[edgeIndex] += delta;
            }
          });
        });
        movingYs.forEach((edge, edgeIndex) => {
          otherYs.forEach((target) => {
            const delta = target - edge;
            if (Math.abs(delta) < bestY) {
              bestY = Math.abs(delta);
              nextY += delta;
              guideY = target;
              movingYs[edgeIndex] += delta;
            }
          });
        });
      }
      nextX = Math.round(nextX);
      nextY = Math.round(nextY);
      setSnapGuides({ x: guideX, y: guideY });
      replacePanels(
        current.map((panel) =>
          panel.queryId === queryId
            ? { ...panel, x: nextX, y: nextY, width }
            : panel
        ),
        { record: false }
      );
    },
    [containerWidth, renderedPanelHeights, replacePanels]
  );

  const resizePanel = useCallback(
    (queryId, frame) => {
      replacePanels(
        (prev) =>
          prev.map((panel) => {
            if (panel.queryId !== queryId) return panel;

            const rawX = Math.round(frame.x ?? panel.x ?? 0);
            const rawY = Math.round(frame.y ?? panel.y ?? 0);
            const rawWidth = Number(
              frame.width ?? panel.width ?? DEFAULT_PANEL_WIDTH
            );
            const rawHeight = Number(
              frame.height ?? panel.height ?? DEFAULT_PANEL_HEIGHT
            );

            const width =
              Math.round(
                clampPanelWidth(rawWidth, containerWidth) / 8
              ) * 8;

            const height = clampPanelHeight(
              Math.round(rawHeight / 8) * 8
            );

            let x = rawX;
            let y = rawY;

            // ลากขอบซ้าย ให้ขอบขวาอยู่ตำแหน่งเดิม
            if (frame.dirX === -1) {
              const fixedRight = rawX + rawWidth;
              x = fixedRight - width;
            }

            // ลากขอบบน ให้ขอบล่างอยู่ตำแหน่งเดิม
            if (frame.dirY === -1) {
              const fixedBottom = rawY + rawHeight;
              y = fixedBottom - height;
            }

            return {
              ...panel,
              x: Math.round(x / 8) * 8,
              y: Math.round(y / 8) * 8,
              width,
              height,
            };
          }),
        { record: false }
      );
    },
    [containerWidth, replacePanels]
  );

  const bringPanelToFront = useCallback((queryId) => {
    replacePanels((prev) => {
      const index = prev.findIndex((panel) => panel.queryId === queryId);
      if (index === -1 || index === prev.length - 1) return prev;
      const next = [...prev];
      const [panel] = next.splice(index, 1);
      next.push(panel);
      return next;
    }, { record: false });
  }, [replacePanels]);

  const filteredQueries = useMemo(() => {
    const filter = sidebarSearch.trim().toLowerCase();
    if (!filter) return queries;
    // Searching the SQL too: "orders" should find the query that reads that
    // table even when its name says nothing about it.
    return queries.filter(
      (query) =>
        query.name.toLowerCase().includes(filter) ||
        (query.description || "").toLowerCase().includes(filter) ||
        (query.sqlText || "").toLowerCase().includes(filter)
    );
  }, [queries, sidebarSearch]);

  // Folders come from each query's layout, so no column had to be added to a
  // table this service cannot alter. Pinned queries get their own group on top.
  const groupedQueries = useMemo(() => {
    const folders = new Map();
    const pins = filteredQueries.filter((query) => pinned.includes(query.id));
    for (const query of filteredQueries) {
      if (pinned.includes(query.id)) continue;
      const folder = (query.layout?.folder || "").trim() || "ทั่วไป";
      if (!folders.has(folder)) folders.set(folder, []);
      folders.get(folder).push(query);
    }
    const sorted = [...folders.entries()].sort((a, b) => a[0].localeCompare(b[0], "th"));
    return pins.length > 0 ? [["ปักหมุด", pins], ...sorted] : sorted;
  }, [filteredQueries, pinned]);

  const openAll = () => {
    replacePanels((prev) => {
      const existing = new Map(prev.map((panel) => [panel.queryId, panel]));
      return arrangeUnpositionedPanels(
        filteredQueries.map(
          (query) => existing.get(query.id) || makePanel(query.id)
        ),
        containerWidth
      );
    });
  };

  const deleteQueryById = async (query) => {
    if (!window.confirm(`ลบ Query "${query.name}" ?`)) return;
    try {
      await apiJson(`/api/queries/${query.id}`, {
        method: "DELETE",
        fallbackError: "ลบ Query ไม่สำเร็จ",
      });
      closePanel(query.id);
      await loadQueries();
    } catch (err) {
      window.alert(err.message);
    }
  };

  // What each open panel is currently showing, for the workbook export.
  const liveData = useRef({});
  const captureData = useCallback((queryId, data) => {
    liveData.current[queryId] = data;
  }, []);

  const exportWorkbook = () => {
    const sheets = panels
      .map((panel) => liveData.current[panel.queryId])
      .filter((sheet) => sheet && sheet.headers.length > 0);
    if (sheets.length === 0) return;
    const url = URL.createObjectURL(buildXlsxBlob(sheets));
    const link = document.createElement("a");
    link.href = url;
    link.download = `gamedb-${new Date().toISOString().slice(0, 10)}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Keyboard shortcuts, ignored while typing in a field.
  const searchRef = useRef(null);

  // The list of queries is a picker, not something to keep on screen: it drops
  // out of the search box and folds away again once it has been used.
  const [listOpen, setListOpen] = useState(false);
  const listBoxRef = useRef(null);

  const focusSearch = useCallback(() => {
    setListOpen(true);
    searchRef.current?.focus();
  }, []);

  const setManualSheetHeight = useCallback((value) => {
    const next = clampSheetHeight(value);
    if (next === null) return;
    sheetHeightRef.current = next;
    setSheetHeight(next);
  }, []);

  const rememberSheetHeight = useCallback(() => {
    try {
      if (sheetHeightRef.current === null) {
        window.localStorage.removeItem(SHEET_HEIGHT_KEY);
      } else {
        window.localStorage.setItem(
          SHEET_HEIGHT_KEY,
          String(sheetHeightRef.current)
        );
      }
    } catch {
      // preference is cosmetic; ignore blocked storage
    }
  }, []);

  const resetSheetHeight = useCallback(() => {
    sheetHeightRef.current = null;
    setSheetHeight(null);
    try {
      window.localStorage.removeItem(SHEET_HEIGHT_KEY);
    } catch {
      // preference is cosmetic; ignore blocked storage
    }
  }, []);

  const startSheetResize = (event) => {
    const frame = sheetFrameRef.current;
    if (!frame) return;
    event.preventDefault();
    setSheetResize({
      startY: event.clientY,
      startHeight: frame.getBoundingClientRect().height,
    });
  };

  useEffect(() => {
    if (!sheetResize) return undefined;
    const move = (event) => {
      setManualSheetHeight(
        sheetResize.startHeight + event.clientY - sheetResize.startY
      );
    };
    const stop = () => {
      rememberSheetHeight();
      setSheetResize(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [rememberSheetHeight, setManualSheetHeight, sheetResize]);

  useEffect(() => {
    if (!listOpen) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!listBoxRef.current?.contains(event.target)) setListOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key !== "Escape") return;
      setListOpen(false);
      searchRef.current?.blur();
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [listOpen]);

  useEffect(() => {
    const onKeyDown = (event) => {
      const tag = event.target?.tagName;
      const isTyping =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        event.target?.isContentEditable;
      if (
        !isTyping &&
        !editLocked &&
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "z"
      ) {
        event.preventDefault();
        if (event.shiftKey) redoPanels();
        else undoPanels();
        return;
      }
      if (
        isTyping ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) {
        return;
      }
      if (event.key === "/") {
        event.preventDefault();
        focusSearch();
      } else if (event.key === "r") {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent("gamedb:refresh-all"));
      } else if (event.key === "e") {
        event.preventDefault();
        exportWorkbook();
      } else if (event.key === "d") {
        event.preventDefault();
        toggleTheme();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const buildViewConfig = useCallback(
    () => ({
      panels: panels.map((panel) => ({
        ...panel,
        layout: liveLayouts.current[panel.queryId] || null,
      })),
    }),
    [panels]
  );

  useEffect(() => {
    if (!isSuperAdmin || !activeView || previewAsUser) return undefined;
    const config = buildViewConfig();
    const serialized = JSON.stringify(config);
    if (serialized === lastSavedConfigRef.current) {
      setTemplateSaveState("saved");
      return undefined;
    }
    setTemplateSaveState("pending");
    const timer = setTimeout(async () => {
      setTemplateSaveState("saving");
      try {
        const data = await apiJson(`/api/views/${activeView.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ config }),
          fallbackError: "บันทึก Template อัตโนมัติไม่สำเร็จ",
        });
        lastSavedConfigRef.current = JSON.stringify(data.view?.config || config);
        if (data.view) {
          setActiveView(data.view);
          setViews((current) =>
            current.map((view) => (view.id === data.view.id ? data.view : view))
          );
        }
        setTemplateSaveState("saved");
      } catch {
        setTemplateSaveState("error");
      }
    }, 900);
    return () => clearTimeout(timer);
  }, [
    activeView,
    buildViewConfig,
    isSuperAdmin,
    layoutRevision,
    panels,
    previewAsUser,
  ]);

  useEffect(() => {
    const warnBeforeLeave = (event) => {
      if (!["pending", "saving"].includes(templateSaveState)) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeave);
    return () => window.removeEventListener("beforeunload", warnBeforeLeave);
  }, [templateSaveState]);

  const queryById = useMemo(
    () => new Map(queries.map((query) => [query.id, query])),
    [queries]
  );
  const openPanels = useMemo(
    () => panels.filter((panel) => queryById.has(panel.queryId)),
    [panels, queryById]
  );
  // Sheet view shows one panel; the selection carries over from the canvas, and
  // falls back to the first tab when nothing is selected or the selection closed.
  const activeSheetPanel =
    openPanels.find((panel) => panel.queryId === selectedPanelId) ||
    openPanels[0] ||
    null;

  // Tabs are keyboard-reachable the way a spreadsheet's are: Ctrl+PageUp/Down
  // steps through them and Alt+1..9 jumps straight to one.
  useEffect(() => {
    if (!sheetMode || openPanels.length === 0) return undefined;
    const onKeyDown = (event) => {
      const index = openPanels.findIndex(
        (panel) => panel.queryId === activeSheetPanel?.queryId
      );
      if ((event.ctrlKey || event.metaKey) && !event.altKey) {
        if (event.key !== "PageDown" && event.key !== "PageUp") return;
        event.preventDefault();
        const step = event.key === "PageDown" ? 1 : -1;
        const next =
          (index + step + openPanels.length) % openPanels.length;
        setSelectedPanelId(openPanels[next].queryId);
        return;
      }
      if (event.altKey && !event.ctrlKey && !event.metaKey && /^[1-9]$/.test(event.key)) {
        const target = openPanels[Number(event.key) - 1];
        if (!target) return;
        event.preventDefault();
        setSelectedPanelId(target.queryId);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeSheetPanel, openPanels, sheetMode]);

  // With more tabs than fit, the selected one can sit outside the strip — and a
  // tab picked from the search box would otherwise never come into view.
  const activeTabRef = useRef(null);
  useEffect(() => {
    if (!sheetMode) return;
    activeTabRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeSheetPanel, sheetMode]);

  const [dragTabId, setDragTabId] = useState(null);
  const [tabMenu, setTabMenu] = useState(null);
  useEffect(() => {
    if (!tabMenu) return undefined;
    const close = () => setTabMenu(null);
    document.addEventListener("pointerdown", close);
    window.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", close);
    };
  }, [tabMenu]);

  const reorderTabs = useCallback(
    (fromId, toId) => {
      if (fromId === toId) return;
      replacePanels((prev) => {
        const from = prev.findIndex((panel) => panel.queryId === fromId);
        const to = prev.findIndex((panel) => panel.queryId === toId);
        if (from < 0 || to < 0) return prev;
        const next = [...prev];
        next.splice(to, 0, next.splice(from, 1)[0]);
        return next;
      });
    },
    [replacePanels]
  );

  const closeOtherTabs = useCallback(
    (queryId) => {
      setSelectedPanelId(queryId);
      replacePanels((prev) => prev.filter((panel) => panel.queryId === queryId));
    },
    [replacePanels]
  );

  const selectedPanel = openPanels.find(
    (panel) => panel.queryId === selectedPanelId
  );
  const toolbarPanelId = selectedPanel?.queryId ?? openPanels[0]?.queryId ?? null;
  const captureRenderedPanelHeight = useCallback((queryId, height) => {
    renderedPanelHeightsRef.current = {
      ...renderedPanelHeightsRef.current,
      [queryId]: height,
    };
    setRenderedPanelHeights((prev) =>
      prev[queryId] === height ? prev : { ...prev, [queryId]: height }
    );
  }, []);

  const canvasBounds = useMemo(() => {
    let left = 0;
    let top = 0;
    let right = 0;
    let bottom = 0;

    for (const panel of openPanels) {
      const x = panel.x ?? 0;
      const y = panel.y ?? 0;
      const width = panel.width ?? DEFAULT_PANEL_WIDTH;
      const height =
        renderedPanelHeights[panel.queryId] || panelEstimatedHeight(panel);

      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x + width);
      bottom = Math.max(bottom, y + height);
    }

    return { left, top, right, bottom };
  }, [openPanels, renderedPanelHeights]);

  // A scroll container has no negative side, but a panel is allowed one. So the
  // canvas carries an origin: whatever the leftmost/topmost panel reaches becomes
  // scroll position 0, and the panel keeps its own negative x and y.
  const originX = canvasBounds.left < 0 ? canvasBounds.left - PANEL_GAP : 0;
  const originY = canvasBounds.top < 0 ? canvasBounds.top - PANEL_GAP : 0;

  // Content only, in canvas units. Sizing the canvas to the viewport as well
  // would be circular -- the viewport's client size is what the scrollbars this
  // canvas asks for take away -- and it is what put a scrollbar on a canvas with
  // nothing overflowing it. Panels are never held inside these bounds anyway: one
  // dragged past the edge grows them.
  const canvasWidth = canvasBounds.right + PANEL_GAP - originX;
  const canvasHeight = Math.max(
    CANVAS_MIN_HEIGHT,
    canvasBounds.bottom + PANEL_GAP - originY
  );

  // Growing the canvas to the left or upwards moves every panel on screen. Undo
  // that with the scroll position, or dragging one panel past the origin would
  // slide all the others out from under the pointer.
  const originRef = useRef({ x: 0, y: 0, zoom: 1 });
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const previous = originRef.current;
    originRef.current = { x: originX, y: originY, zoom };
    if (!viewport || previous.zoom !== zoom) return;
    if (previous.x === originX && previous.y === originY) return;
    viewport.scrollLeft += (previous.x - originX) * zoom;
    viewport.scrollTop += (previous.y - originY) * zoom;
  }, [originX, originY, zoom]);

  const setZoomAroundCenter = useCallback((nextZoom) => {
    const clamped = Math.min(2, Math.max(0.4, nextZoom));
    const viewport = viewportRef.current;
    if (!viewport) {
      setZoom(clamped);
      return;
    }
    const centerX = viewport.clientWidth / 2;
    const centerY = viewport.clientHeight / 2;
    const anchorX = (viewport.scrollLeft + centerX) / zoom;
    const anchorY = (viewport.scrollTop + centerY) / zoom;
    setZoom(clamped);
    // The canvas only takes up its new size once React has re-rendered it, and
    // scrollLeft cannot be set past an extent that does not exist yet.
    requestAnimationFrame(() => {
      const el = viewportRef.current;
      if (!el) return;
      el.scrollLeft = anchorX * clamped - centerX;
      el.scrollTop = anchorY * clamped - centerY;
    });
  }, [zoom]);

  const autoArrangePanels = useCallback(
    (mode) => {
      if (editLocked || panelsStateRef.current.length === 0) return;
      const canvasWidth = Math.max(
        MIN_PANEL_WIDTH,
        (containerWidth || DEFAULT_PANEL_WIDTH) - PANEL_GAP * 2
      );
      const next = arrangePanelsByMode(
        panelsStateRef.current,
        mode,
        canvasWidth,
        renderedPanelHeightsRef.current
      );
      replacePanels(next);
      setZoom(1);
      viewportRef.current?.scrollTo({ left: 0, top: 0 });
      // Arranging puts every panel back at a non-negative x and y, so the origin
      // returns to zero. Record that here or the compensation below would read it
      // as a shift and scroll away from the home position we just went to.
      originRef.current = { x: 0, y: 0, zoom: 1 };

      // Changing the panel width can wrap its header and alter its real height.
      // Reflow after the browser has rendered the new widths so row gaps stay exact.
      if (arrangeFrameRef.current) cancelAnimationFrame(arrangeFrameRef.current);
      arrangeFrameRef.current = requestAnimationFrame(() => {
        arrangeFrameRef.current = requestAnimationFrame(() => {
          const settled = arrangePanelsByMode(
            panelsStateRef.current,
            mode,
            canvasWidth,
            renderedPanelHeightsRef.current
          );
          replacePanels(settled, { record: false });
          arrangeFrameRef.current = null;
        });
      });
    },
    [containerWidth, editLocked, replacePanels]
  );

  useEffect(
    () => () => {
      if (arrangeFrameRef.current) cancelAnimationFrame(arrangeFrameRef.current);
    },
    []
  );

  const startCanvasPan = (event) => {
    if (event.button !== 0) return;

    const viewport = viewportRef.current;
    const canvas = panelsRef.current;
    if (!viewport) return;

    // อนุญาตให้ลากเฉพาะพื้นหลัง ไม่ให้แย่ง event ตอนลาก panel
    // (พื้นหลัง = viewport, ตัวกำหนดขนาด, หรือ canvas เอง)
    if (
      event.target !== viewport &&
      event.target !== canvas &&
      event.target !== canvas?.parentElement &&
      event.target !== canvasOriginRef.current
    ) {
      return;
    }

    // A press on the scrollbar also lands on the viewport itself. Leave it to the
    // browser, or the canvas would jump while the scrollbar is being dragged.
    const rect = viewport.getBoundingClientRect();
    if (
      event.clientX - rect.left > viewport.clientWidth ||
      event.clientY - rect.top > viewport.clientHeight
    ) {
      return;
    }

    panDragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      scrollX: viewport.scrollLeft,
      scrollY: viewport.scrollTop,
    };

    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const moveCanvasPan = (event) => {
    const drag = panDragRef.current;
    const viewport = viewportRef.current;
    if (!drag || !viewport) return;
    viewport.scrollLeft = drag.scrollX - (event.clientX - drag.startX);
    viewport.scrollTop = drag.scrollY - (event.clientY - drag.startY);
  };

  const stopCanvasPan = () => {
    panDragRef.current = null;
  };

  const canvasToolbar = (
    <CanvasToolbar
      layoutLocked={editLocked}
      historyAvailability={historyAvailability}
      onUndo={undoPanels}
      onRedo={redoPanels}
      isSuperAdmin={isSuperAdmin}
      activeView={activeView}
      templateSaveState={templateSaveState}
      onTogglePreview={() => setPreviewAsUser((value) => !value)}
      zoom={zoom}
      onZoom={setZoomAroundCenter}
      sheetMode={sheetMode}
    />
  );
  const workspaceViewControls = (
    <WorkspaceViewControls
      layoutLocked={editLocked}
      historyRevision={historyRevision}
      onArrange={autoArrangePanels}
      sheetMode={sheetMode}
      onToggleSheetMode={toggleSheetMode}
    />
  );

  // Shown by both layouts when nothing is open, so it lives outside either.
  const emptyWorkspace = (
    <div className="flex h-full min-h-72 items-center justify-center p-4">
      <div className="flex w-full max-w-md flex-col items-center justify-center gap-1 rounded-sm border border-dashed border-zinc-300 bg-white px-6 py-16 text-center">
        {layoutLocked ? (
          <>
            <Lock size={22} className="text-zinc-300" />
            <p className="text-xs font-black text-zinc-500">
              ยังไม่มี Template สำหรับบัญชีนี้
            </p>
            <p className="text-[11px] font-semibold text-zinc-400">
              กรุณาให้ Admin แชร์ Template หรือกำหนด Template เริ่มต้น
            </p>
          </>
        ) : (
          <>
            <LayoutGrid size={22} className="text-zinc-300" />
            <p className="text-xs font-black text-zinc-500">ยังไม่ได้เปิดตาราง</p>
            <p className="text-[11px] font-semibold text-zinc-400">
              กด Query ด้านบนเพื่อเปิด — จากนั้นลากกล่องไปวางตำแหน่งที่ต้องการได้
            </p>
          </>
        )}
      </div>
    </div>
  );

  // Both layouts render the same panel; the sheet view just hands it a flag
  // that makes it sit in the flow at full width instead of on the canvas.
  const renderPanel = (panel, docked = false) => {
    const query = queryById.get(panel.queryId);
    const isFullWidth =
      panel.width != null &&
      containerWidth > 0 &&
      panel.width >= containerWidth - 8;
    return (
      <QueryPanel
        key={`${panel.queryId}:${query.updatedAt}:${activeView?.id ?? "own"}`}
        query={query}
        queries={queries}
        panel={panel}
        layoutOverride={panelLayouts[panel.queryId] || null}
        personalLayout={
          activeView ? null : myLayouts[panel.queryId] || null
        }
        onPersonalLayoutSaved={rememberPersonalLayout}
        onSharedLayoutSaved={rememberSharedLayout}
        onLayoutChange={captureLayout}
        onDataChange={captureData}
        canManage={isSuperAdmin && !previewAsUser && !activeView?.isReadOnly}
        canCustomizeLayout={!editLocked}
        canWriteData={
          !activeView?.isReadOnly &&
          ((isSuperAdmin && !previewAsUser) || (me.role === "staff" && Boolean(me.canWriteData)))
        }
        canUpdateData={
          !activeView?.isReadOnly &&
          ((isSuperAdmin && !previewAsUser) || (me.role === "staff" && Boolean(me.canUpdateData)))
        }
        isFullWidth={isFullWidth}
        isSelected={selectedPanelId === panel.queryId}
        workspaceToolbar={toolbarPanelId === panel.queryId ? canvasToolbar : null}
        onSelect={() => setSelectedPanelId(panel.queryId)}
        onPositionChange={movePanelTo}
        onFrameChange={resizePanel}
        onBringToFront={bringPanelToFront}
        onInteractionStart={beginPanelInteraction}
        onInteractionEnd={endPanelInteraction}
        canvasScale={docked ? 1 : zoom}
        docked={docked}
        onRenderedHeight={captureRenderedPanelHeight}
        onClose={() => closePanel(panel.queryId)}
        onToggleFullWidth={() => {
          // measureContainer reports both axes; only the width is a
          // panel width. Passing the whole reading made this an
          // object, and every comparison against it went false.
          const { width: available } = measureContainer();
          updatePanel(panel.queryId, (prev) => ({
            x: isFullWidth ? prev.x : 0,
            width: isFullWidth
              ? Math.min(DEFAULT_PANEL_WIDTH, available)
              : available,
          }));
        }}
        onToggleCollapse={() =>
          updatePanel(panel.queryId, (prev) => ({
            collapsed: !prev.collapsed,
          }))
        }
        onResetHeight={() =>
          updatePanel(panel.queryId, () => ({
            height: DEFAULT_PANEL_HEIGHT,
          }))
        }
        onResetWidth={() =>
          updatePanel(panel.queryId, (prev) => {
            const width = Math.min(DEFAULT_PANEL_WIDTH, containerWidth);
            return {
              x: Math.min(
                prev.x || 0,
                Math.max(0, containerWidth - width)
              ),
              width,
            };
          })
        }
        onEditQuery={() => setEditorModal({ mode: "edit", query })}
        onDuplicateQuery={() => setEditorModal({ mode: "duplicate", query })}
        // Following a row into another query is reading, not arranging, so a
        // template account gets it too.
        onDrill={openDrill}
        initialParams={drillParams[panel.queryId] || null}
      />
    );
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-[1900px] flex-col p-1 lg:p-1">
      <header className="mb-1 flex flex-wrap items-center justify-between gap-1">
        <div>
          <h1 className="flex items-center gap-1 text-xl font-black tracking-tight">
            <Database size={20} className="text-red-600" />
            Topup Panel
            <span className="rounded bg-red-600/15 px-1 py-0.5 text-[9px] font-black uppercase tracking-wider text-red-600">
              INBLACKM
            </span>
          </h1>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1">
          {views.length > 0 && (
            <div className="flex items-center gap-1 rounded-sm border border-zinc-200 bg-white px-1 py-1">
              <Layers size={13} className="text-red-600" />
              <select
                value={activeView?.id ?? ""}
                onChange={(e) => {
                  const view = views.find((item) => String(item.id) === e.target.value);
                  if (view) applyView(view);
                  else leaveView();
                }}
                className="bg-transparent text-[11px] font-black text-zinc-600 outline-none"
                title="เลือกเทมเพลตหน้าจอที่ได้รับ"
              >
                {!layoutLocked && <option value="">หน้าจอของฉัน</option>}
                {views.map((view) => (
                  <option key={view.id} value={view.id}>
                    {view.name}
                  </option>
                ))}
              </select>
              {activeView && !layoutLocked && (
                <button
                  type="button"
                  onClick={leaveView}
                  className="rounded-sm p-0.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-red-600"
                  title="ออกจากเทมเพลต กลับไปหน้าจอของฉัน"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          )}
          <div className="flex items-center gap-1 rounded-sm border border-zinc-200 bg-white px-1 py-1">
            <User size={13} className="text-zinc-500" />
            <div className="text-[10px] font-semibold leading-tight">
              <p className="font-black text-zinc-800">{me.displayName || me.username}</p>
              <p className="text-zinc-500">
                {isSuperAdmin ? "Admin" : isTemplateUser ? "User · Template" : "Staff"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onBackToMenu}
            title="กลับเมนู"
            className="rounded-sm border border-zinc-200 bg-white p-1 text-zinc-500 transition hover:bg-zinc-50 hover:text-zinc-700"
          >
            <LayoutGrid size={14} />
          </button>
          <NextLink
            href="/gameinfo/th"
            title="ข้อมูลเกม (GameInfo)"
            className="rounded-sm border border-zinc-200 bg-white p-1 text-zinc-500 transition hover:bg-zinc-50 hover:text-zinc-700"
          >
            <Gamepad2 size={14} />
          </NextLink>
          <button
            type="button"
            onClick={exportWorkbook}
            title="ดาวน์โหลดทุกตารางที่เปิดอยู่เป็น Excel หลายชีต (คีย์ลัด: e)"
            className="rounded-sm border border-zinc-200 bg-white p-1 text-zinc-500 transition hover:bg-zinc-50 hover:text-zinc-700"
          >
            <FileSpreadsheet size={14} />
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            title="สลับโหมดสว่าง/มืด (คีย์ลัด: d)"
            className="rounded-sm border border-zinc-200 bg-white p-1 text-zinc-500 transition hover:bg-zinc-50 hover:text-zinc-700"
          >
            {dark ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          <button
            type="button"
            onClick={logout}
            title="ออกจากระบบ"
            className="rounded-sm border border-zinc-200 bg-white p-1 text-zinc-500 transition hover:bg-red-50 hover:text-red-600"
          >
            <LogOut size={14} />
          </button>
          {isSuperAdmin && (
            <>
              <button
                type="button"
                onClick={() => setViewsModal(true)}
                className="flex items-center gap-1 rounded-sm border border-zinc-200 bg-white px-4 py-1.5 text-xs font-black text-zinc-600 transition hover:bg-zinc-50"
                title="บันทึกหน้าจอนี้เป็นเทมเพลต / ส่งให้คนอื่น"
              >
                <Layers size={14} /> เทมเพลต ({views.length})
              </button>
              <button
                type="button"
                onClick={() => setEditLogModal(true)}
                className="rounded-sm border border-zinc-200 bg-white p-1 text-zinc-500 transition hover:bg-zinc-50 hover:text-zinc-700"
                title="ประวัติการแก้ไขข้อมูล"
              >
                <History size={14} />
              </button>
              <button
                type="button"
                onClick={() => setHealthModal(true)}
                className="rounded-sm border border-zinc-200 bg-white p-1 text-zinc-500 transition hover:bg-zinc-50 hover:text-zinc-700"
                title="ตรวจสุขภาพระบบ / สิทธิ์ฐานข้อมูล"
              >
                <Activity size={14} />
              </button>
              <button
                type="button"
                onClick={() => setUsersModal(true)}
                className="flex items-center gap-1 rounded-sm border border-zinc-200 bg-white px-4 py-1.5 text-xs font-black text-zinc-600 transition hover:bg-zinc-50"
              >
                <Users size={14} /> ผู้ใช้
              </button>
              <button
                type="button"
                onClick={() => setConnectionsModal(true)}
                className="flex items-center gap-1 rounded-sm border border-zinc-200 bg-white px-4 py-1.5 text-xs font-black text-zinc-600 transition hover:bg-zinc-50"
              >
                <Server size={14} /> ฐานข้อมูล ({connections.length + 1})
              </button>
              <button
                type="button"
                onClick={() => setEditorModal({ mode: "create" })}
                className="flex items-center gap-1 rounded-sm bg-red-600 px-4 py-1.5 text-xs font-black text-white transition hover:bg-red-700"
              >
                <Plus size={14} /> เพิ่ม Query
              </button>
            </>
          )}
          {!editLocked && (
            <div ref={listBoxRef} className="relative w-64 min-w-48">
              <Search
                size={13}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
              />
              <input
                ref={searchRef}
                type="text"
                value={sidebarSearch}
                onChange={(event) => {
                  setSidebarSearch(event.target.value);
                  setListOpen(true);
                }}
                onFocus={() => setListOpen(true)}
                placeholder="ค้นหาชื่อ / SQL... (กด /)"
                className="h-9 w-full rounded-sm border border-zinc-200 bg-white pl-8 pr-8 text-xs font-semibold outline-none focus:border-red-600"
              />
              <button
                type="button"
                onClick={() => setListOpen((open) => !open)}
                className="absolute right-1 top-1/2 -translate-y-1/2 rounded-sm p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
                title={listOpen ? "ปิดรายการ Query" : "เปิดรายการ Query"}
                aria-expanded={listOpen}
              >
                <ChevronDown
                  size={14}
                  className={`transition ${listOpen ? "rotate-180" : ""}`}
                />
              </button>
              <div ref={setQueryListHost} className="absolute bottom-0 right-0" />
            </div>
          )}
          {/* The canvas tools normally ride in the toolbar of whichever panel is
              selected. With nothing open there is no panel to carry them, and
              undo, zoom and the view buttons still have work to do. */}
          {openPanels.length === 0 && canvasToolbar}
          {workspaceViewControls}
        </div>
      </header>

      {initialViewNotFound && (
        <div className="mb-1 flex items-center justify-between gap-2 rounded-sm border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-700">
          <span>ลิงก์นี้ชี้ไปเทมเพลตที่ไม่มีอยู่แล้ว หรือไม่ได้แชร์ให้บัญชีนี้ — แสดงหน้าจอเริ่มต้นแทน</span>
          <button
            type="button"
            onClick={() => setInitialViewNotFound(false)}
            className="shrink-0 rounded-sm p-0.5 text-amber-500 transition hover:bg-amber-100 hover:text-amber-700"
            aria-label="ปิด"
          >
            <X size={12} />
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-1">
        {!editLocked && queryListHost && listOpen && createPortal(
          <div className="absolute right-0 top-full z-50 mt-1 flex max-h-[70vh] w-96 max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-sm border border-zinc-200 bg-white shadow-xl">
          <div className="flex shrink-0 items-center justify-between gap-1 border-b border-zinc-100 px-2 py-1.5">
            <span className="text-[10px] font-black text-zinc-400">
              เปิดอยู่ {openPanels.length} ตาราง
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={openAll}
                disabled={filteredQueries.length === 0}
                className="rounded-sm px-1.5 py-0.5 text-[10px] font-black text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-40"
              >
                เปิดทั้งหมด
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedPanelId(null);
                  replacePanels([]);
                }}
                disabled={panels.length === 0}
                className="rounded-sm px-1.5 py-0.5 text-[10px] font-black text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-40"
              >
                ปิดทั้งหมด
              </button>
            </div>
          </div>
          {loadingList ? (
            <p className="flex items-center gap-1 px-2 py-4 text-xs font-semibold text-zinc-400">
              <Loader2 size={14} className="animate-spin" /> กำลังโหลด...
            </p>
          ) : listError ? (
            <p className="px-2 py-4 text-xs font-bold text-red-600">{listError}</p>
          ) : filteredQueries.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs font-semibold text-zinc-400">
              ไม่พบ Query
            </p>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto p-1">
              {groupedQueries.map(([folder, folderQueries]) => (
                <div key={folder}>
                  {groupedQueries.length > 1 && (
                    <p className="px-2 pb-0.5 pt-1.5 text-[9px] font-black uppercase tracking-wider text-zinc-400">
                      {folder}
                    </p>
                  )}
                  {folderQueries.map((query) => {
                const isOpen = openIds.has(query.id);
                return (
                  <div
                    key={query.id}
                    className={`group flex items-center gap-1 rounded-sm border px-2 py-1 transition ${
                      isOpen
                        ? "border-red-600 bg-red-600 text-white"
                        : "border-transparent text-zinc-600 hover:bg-zinc-50"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => togglePanel(query.id)}
                      className="min-w-0 flex-1 text-left"
                      // The card is a list entry, not a summary. Everything under
                      // the name shares one line, and the full text is here.
                      title={`${query.name}${
                        query.description ? ` — ${query.description}` : ""
                      }\n${isOpen ? "กดเพื่อปิดตารางนี้" : "กดเพื่อเปิดตารางนี้"}`}
                    >
                      <p className="truncate text-xs font-black leading-tight">{query.name}</p>
                      {/* A description that only repeats the name is noise, and
                          these two together fit on one line. */}
                      {query.connectionName || subtitleOf(query) ? (
                        <p
                          className={`flex items-center gap-1 truncate text-[9px] font-bold leading-tight ${
                            isOpen ? "text-white/70" : "text-zinc-400"
                          }`}
                        >
                          {query.connectionName ? (
                            <>
                              <Server size={9} className="shrink-0" />
                              <span className={isOpen ? "" : "text-sky-600"}>
                                {query.connectionName}
                              </span>
                            </>
                          ) : null}
                          {query.connectionName && subtitleOf(query) ? <span>·</span> : null}
                          {subtitleOf(query) ? (
                            <span className="truncate">{subtitleOf(query)}</span>
                          ) : null}
                        </p>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      onClick={() => togglePin(query.id)}
                      className={`shrink-0 rounded-sm p-0.5 transition ${
                        pinned.includes(query.id)
                          ? isOpen
                            ? "text-white"
                            : "text-amber-500"
                          : `${isOpen ? "text-white/70" : "text-zinc-300"} opacity-0 group-hover:opacity-100`
                      }`}
                      title={pinned.includes(query.id) ? "เอาหมุดออก" : "ปักหมุดไว้บนสุด"}
                    >
                      <Star size={11} />
                    </button>
                    {isSuperAdmin && (
                      <div
                        className={`flex shrink-0 items-center gap-0.5 ${
                          isOpen ? "" : "opacity-0 group-hover:opacity-100"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setEditorModal({ mode: "edit", query })}
                          className={`rounded-sm p-0.5 transition ${
                            isOpen
                              ? "text-white/80 hover:bg-white/20"
                              : "text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700"
                          }`}
                          title="แก้ไข Query"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteQueryById(query)}
                          className={`rounded-sm p-0.5 transition ${
                            isOpen
                              ? "text-white/80 hover:bg-white/20"
                              : "text-zinc-400 hover:bg-zinc-200 hover:text-red-600"
                          }`}
                          title="ลบ Query"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                );
                  })}
                </div>
              ))}
            </div>
          )}
          </div>,
          queryListHost
        )}

        {previewAsUser && (
          <div className="flex items-center justify-between gap-1 rounded-sm border border-amber-300 bg-amber-50 px-1 py-1 text-[11px] font-bold text-amber-800">
            <span className="flex items-center gap-1">
              <Eye size={13} /> กำลังดูหน้าจอแบบ User
            </span>
            <button
              type="button"
              onClick={() => setPreviewAsUser(false)}
              className="rounded-sm border border-amber-300 bg-white px-3 py-1.5 text-[10px] font-black"
            >
              ออกจาก Preview
            </button>
          </div>
        )}

        {sheetMode ? (
          <div
            ref={sheetFrameRef}
            className={`flex min-h-72 min-w-0 flex-col overflow-hidden rounded-sm border border-zinc-200 bg-zinc-50 ${
              sheetHeight === null ? "flex-1" : "shrink-0"
            }`}
            style={sheetHeight === null ? undefined : { height: sheetHeight }}
          >
            <div className="min-h-0 flex-1 overflow-hidden px-1 pt-1">
              {activeSheetPanel ? renderPanel(activeSheetPanel, true) : emptyWorkspace}
            </div>
            {openPanels.length > 0 && (
              <>
                <div
                  role="separator"
                  aria-label="ปรับความสูงพื้นที่ตาราง"
                  aria-orientation="horizontal"
                  aria-valuemin={MIN_SHEET_HEIGHT}
                  aria-valuemax={MAX_SHEET_HEIGHT}
                  aria-valuenow={sheetHeight ?? undefined}
                  tabIndex={0}
                  onPointerDown={startSheetResize}
                  onDoubleClick={resetSheetHeight}
                  onKeyDown={(event) => {
                    if (event.key === "Home") {
                      event.preventDefault();
                      resetSheetHeight();
                      return;
                    }
                    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
                    event.preventDefault();
                    const current =
                      sheetHeight ?? sheetFrameRef.current?.getBoundingClientRect().height;
                    setManualSheetHeight(
                      Number(current || MIN_SHEET_HEIGHT) +
                        (event.key === "ArrowDown" ? 32 : -32)
                    );
                    requestAnimationFrame(rememberSheetHeight);
                  }}
                  className={`group relative flex h-2 shrink-0 touch-none cursor-row-resize items-center justify-center border-t border-zinc-200 bg-zinc-50 outline-none transition hover:bg-red-50 focus:bg-red-50 ${
                    sheetResize ? "bg-red-50" : ""
                  }`}
                  title="ลากขึ้น/ลงเพื่อปรับความสูง · ดับเบิลคลิกหรือกด Home เพื่อกลับเต็มพื้นที่หน้าจอ"
                >
                  <span className="h-0.5 w-12 rounded-full bg-zinc-300 transition group-hover:bg-red-500 group-focus:bg-red-500" />
                  {sheetResize && (
                    <span className="pointer-events-none absolute bottom-full mb-1 rounded-sm bg-zinc-900 px-2 py-1 font-mono text-[9px] font-bold text-white shadow-lg">
                      {Math.round(sheetHeight || sheetResize.startHeight)} px
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-t border-zinc-200 bg-white px-1 py-1">
                {openPanels.map((panel, index) => {
                  const query = queryById.get(panel.queryId);
                  const isActive = activeSheetPanel?.queryId === panel.queryId;
                  return (
                    <div
                      key={panel.queryId}
                      ref={isActive ? activeTabRef : null}
                      draggable
                      onDragStart={() => setDragTabId(panel.queryId)}
                      onDragEnd={() => setDragTabId(null)}
                      onDragOver={(event) => {
                        if (dragTabId === null) return;
                        event.preventDefault();
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        if (dragTabId !== null) reorderTabs(dragTabId, panel.queryId);
                        setDragTabId(null);
                      }}
                      // Middle-click closes a tab, the way it does in a browser.
                      onAuxClick={(event) => {
                        if (event.button !== 1) return;
                        event.preventDefault();
                        closePanel(panel.queryId);
                      }}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        setTabMenu({ queryId: panel.queryId, x: event.clientX, y: event.clientY });
                      }}
                      className={`group flex shrink-0 cursor-grab items-center gap-1 rounded-t-lg border-b-2 px-1 py-1 transition active:cursor-grabbing ${
                        dragTabId === panel.queryId ? "opacity-40" : ""
                      } ${
                        isActive
                          ? "border-red-600 bg-red-50 text-red-700"
                          : "border-transparent text-zinc-500 hover:bg-zinc-100"
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className="size-1.5 shrink-0 rounded-sm"
                        style={{ background: folderColor(query?.layout?.folder) }}
                      />
                      <button
                        type="button"
                        onClick={() => setSelectedPanelId(panel.queryId)}
                        className="max-w-48 truncate text-[11px] font-black"
                        title={`${query?.name || ""}${index < 9 ? ` · Alt+${index + 1}` : ""}`}
                      >
                        {query?.name}
                      </button>
                      <button
                        type="button"
                        onClick={() => closePanel(panel.queryId)}
                        className="rounded p-0.5 text-zinc-400 opacity-0 transition group-hover:opacity-100 hover:bg-zinc-200 hover:text-red-600"
                        title="ปิดตารางนี้"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  );
                })}
                {/* Opening another table shouldn't mean going back up to the
                    search box when the eye is already down here. */}
                <button
                  type="button"
                  onClick={focusSearch}
                  className="shrink-0 rounded-sm p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-red-600"
                  title="เปิดตารางเพิ่ม"
                >
                  <Plus size={13} />
                  </button>
                </div>
              </>
            )}
            {tabMenu && (
              // Closing happens on pointerdown, which removes this before a
              // click can land, so the items act on pointerdown too.
              <div
                className="fixed z-50 min-w-40 rounded-sm border border-zinc-200 bg-white p-1 shadow-xl"
                style={{ left: tabMenu.x, top: tabMenu.y }}
              >
                <button
                  type="button"
                  onPointerDown={() => closePanel(tabMenu.queryId)}
                  className="flex w-full items-center gap-1 rounded-sm px-2 py-1.5 text-left text-[11px] font-bold text-zinc-600 hover:bg-zinc-100"
                >
                  <X size={11} /> ปิดแท็บนี้
                </button>
                <button
                  type="button"
                  disabled={openPanels.length < 2}
                  onPointerDown={() => closeOtherTabs(tabMenu.queryId)}
                  className="flex w-full items-center gap-1 rounded-sm px-2 py-1.5 text-left text-[11px] font-bold text-zinc-600 hover:bg-zinc-100 disabled:opacity-40"
                >
                  <X size={11} /> ปิดแท็บอื่นทั้งหมด
                </button>
              </div>
            )}
          </div>
        ) : (
        <div
          ref={viewportRef}
          className="relative min-h-72 min-w-0 flex-1 overflow-auto overscroll-contain rounded-sm border border-zinc-200 bg-zinc-50"
          onPointerDown={startCanvasPan}
          onPointerMove={moveCanvasPan}
          onPointerUp={stopCanvasPan}
          onPointerCancel={stopCanvasPan}
          onWheel={(event) => {
            if (event.ctrlKey || event.metaKey) {
              event.preventDefault();
              setZoomAroundCenter(zoom - event.deltaY * 0.001);
            }
          }}
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(113,113,122,.22) 1px, transparent 1px)",
            backgroundSize: `${16 * zoom}px ${16 * zoom}px`,
            // Pin the dots to the canvas rather than to the viewport, so they
            // travel with the panels instead of sliding underneath them.
            backgroundAttachment: "local",
          }}
        >
          {/* The empty state is not a panel and does not belong on the canvas: the
              canvas is sized to the panels, so with none open it is a gap wide
              enough for nothing, and the message wrapped one letter per line. */}
          {openPanels.length === 0 ? (
            emptyWorkspace
          ) : (
          /* `scale` does not change the box the canvas occupies in layout, so the
             scroll extent comes from this sizer instead: without it, zooming out
             leaves the viewport scrollable over empty space. */
          <div style={{ width: canvasWidth * zoom, height: canvasHeight * zoom }}>
            <div
              ref={panelsRef}
              className="relative"
              style={{
                width: canvasWidth,
                minHeight: canvasHeight,
                transform: `scale(${zoom})`,
                transformOrigin: "0 0",
              }}
            >
            {/* The origin is a position, not a transform. A translate would carry
                this layer's own box with it and leave that much empty space
                scrollable off the far side -- measured at 247px of nothing after
                one panel went 240 to the left. Offsetting a wrapper puts the
                panels in the same place with the box left where it belongs. */}
            <div
              ref={canvasOriginRef}
              className="absolute"
              style={{
                left: -originX,
                top: -originY,
                width: canvasWidth + originX,
                height: canvasHeight + originY,
              }}
            >
              {snapGuides.x !== null && (
                <div
                  className="pointer-events-none absolute bottom-0 top-0 z-40 w-px bg-red-500"
                  style={{ left: snapGuides.x }}
                />
              )}
              {snapGuides.y !== null && (
                <div
                  className="pointer-events-none absolute left-0 right-0 z-40 h-px bg-red-500"
                  style={{ top: snapGuides.y }}
                />
              )}
              {openPanels.map((panel) => renderPanel(panel))}
            </div>
            </div>
          </div>
          )}
        </div>
        )}
      </div>

      {editorModal && (
        <QueryEditorModal
          modal={editorModal}
          connections={connections}
          onClose={() => setEditorModal(null)}
          onSaved={async (savedQuery) => {
            setEditorModal(null);
            await loadQueries();
            replacePanels((prev) =>
              prev.some((panel) => panel.queryId === savedQuery.id)
                ? prev
                : [...prev, makePanel(savedQuery.id)]
            );
          }}
        />
      )}

      {connectionsModal && (
        <ConnectionsModal
          connections={connections}
          onClose={() => setConnectionsModal(false)}
          onChanged={async () => {
            await loadConnections();
            await loadQueries();
          }}
        />
      )}

      {usersModal && <UsersModal me={me} onClose={() => setUsersModal(false)} />}
      {healthModal && <HealthModal onClose={() => setHealthModal(false)} />}
      {editLogModal && <EditLogModal onClose={() => setEditLogModal(false)} />}

      {viewsModal && (
        <ViewsModal
          views={views}
          buildConfig={buildViewConfig}
          panelCount={openPanels.length}
          onClose={() => setViewsModal(false)}
          onChanged={loadViews}
          onApply={(view) => {
            applyView(view);
            setViewsModal(false);
          }}
          onPreview={(view) => {
            applyView(view);
            setPreviewAsUser(true);
            setViewsModal(false);
          }}
        />
      )}
    </div>
  );
}
