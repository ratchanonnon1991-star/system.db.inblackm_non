"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Database,
  FileSpreadsheet,
  History,
  Layers,
  LayoutGrid,
  Loader2,
  Lock,
  LogOut,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Search,
  Server,
  Star,
  Sun,
  Trash2,
  User,
  Users,
  X,
} from "lucide-react";
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

export default function GamedbPage() {
  const [me, setMe] = useState(null);
  const [checkingMe, setCheckingMe] = useState(true);

  useEffect(() => {

    apiJson("/api/me", { fallbackError: "ตรวจสอบสิทธิ์ไม่สำเร็จ" })
      .then((data) => setMe(data.user))
      .catch(() => setMe(null))
      .finally(() => setCheckingMe(false));
  }, []);

  if (checkingMe) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="flex animate-pulse items-center gap-2 text-sm font-bold text-zinc-500">
          <Loader2 size={16} className="animate-spin" /> กำลังตรวจสอบสิทธิ์...
        </span>
      </div>
    );
  }

  if (!me) {
    return <LoginScreen onLoggedIn={setMe} />;
  }

  return <GamedbWorkspace me={me} onLoggedOut={() => setMe(null)} />;
}

function LoginScreen({ onLoggedIn }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const data = await apiJson("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
        fallbackError: "เข้าสู่ระบบไม่สำเร็จ",
      });
      onLoggedIn(data.user);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
      >
        <div className="mb-5 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-red-200 bg-red-600/10 text-red-600">
            <Lock size={26} />
          </div>
          <h1 className="text-lg font-black tracking-tight">GameDB</h1>
          <p className="mt-1 text-[11px] font-semibold text-zinc-500">
            เข้าสู่ระบบด้วยบัญชี GameDB
          </p>
        </div>

        <label className="mb-1 block text-[10px] font-black text-zinc-500">Username</label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoFocus
          className="mb-3 h-10 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-xs font-semibold outline-none focus:border-red-600 focus:bg-white"
        />
        <label className="mb-1 block text-[10px] font-black text-zinc-500">รหัสผ่าน</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          className="mb-4 h-10 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-xs font-semibold outline-none focus:border-red-600 focus:bg-white"
        />

        {error && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-bold text-red-600">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || !username.trim() || !password}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-red-600 text-xs font-black text-white transition hover:bg-red-700 disabled:opacity-50"
        >
          {submitting ? <Loader2 size={14} className="animate-spin" /> : <Lock size={13} />}
          เข้าสู่ระบบ
        </button>
      </form>
    </div>
  );
}

// Open panels and their free-form canvas position are per-browser preferences,
// so they live in localStorage instead of the shared query layout.
const WORKSPACE_STORAGE_KEY = "gamedb.workspace.v1";
const DEFAULT_PANEL_HEIGHT = 420;
const DEFAULT_PANEL_WIDTH = 720;
const MIN_PANEL_HEIGHT = 140;
const MAX_PANEL_HEIGHT = 1600;
const MIN_PANEL_WIDTH = 280;
const PANEL_GAP = 16;
const PANEL_CHROME_ESTIMATE = 300;
const CANVAS_MIN_HEIGHT = 520;

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
  const max = containerWidth || MAX_PANEL_HEIGHT * 2;
  return Math.round(Math.min(max, Math.max(MIN_PANEL_WIDTH, num)));
}

function clampPanelPosition(value) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.max(0, Math.round(num)) : null;
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
    if (panel.x !== null && panel.y !== null) {
      const x = Math.min(panel.x, Math.max(0, width - panelWidth));
      return { ...panel, x, y: panel.y, width: panelWidth };
    }
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

const THEME_KEY = "gamedb.theme";
const PINNED_KEY = "gamedb.pinned";
const SIDEBAR_KEY = "gamedb.sidebar";

function GamedbWorkspace({ me, onLoggedOut }) {
  const isSuperAdmin = me.role === "admin";
  const isTemplateUser = me.role === "user";

  const [dark, setDark] = useState(false);
  const [pinned, setPinned] = useState([]);
  // The query picker sits above the canvas and can collapse to a compact bar.
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Theme, pins and the sidebar are per-browser preferences; read them once on mount.
  useEffect(() => {
    try {
      const storedTheme = window.localStorage.getItem(THEME_KEY);
      const prefersDark =
        storedTheme === "dark" ||
        (!storedTheme && window.matchMedia("(prefers-color-scheme: dark)").matches);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading a browser preference is exactly what an effect is for
      setDark(prefersDark);
      setPinned(JSON.parse(window.localStorage.getItem(PINNED_KEY) || "[]"));
      setSidebarOpen(window.localStorage.getItem(SIDEBAR_KEY) !== "closed");
    } catch {
      setDark(false);
    }
  }, []);

  const toggleSidebar = useCallback((next) => {
    setSidebarOpen((prev) => {
      const value = typeof next === "boolean" ? next : !prev;
      try {
        window.localStorage.setItem(SIDEBAR_KEY, value ? "open" : "closed");
      } catch {
        // preference is cosmetic; ignore a blocked storage
      }
      return value;
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

  const [panels, setPanels] = useState([]);
  const hydrated = useRef(false);
  const panelsRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [renderedPanelHeights, setRenderedPanelHeights] = useState({});

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
  const [panelLayouts, setPanelLayouts] = useState({});
  // Live layout of every open panel, kept in a ref because it changes on every
  // column drag and only matters when a template is saved.
  const liveLayouts = useRef({});
  const captureLayout = useCallback((queryId, layout) => {
    liveLayouts.current[queryId] = layout;
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
    setPanels(panelsFromView);
    setActiveView(view);
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
      const fallback = viewList.find(
        (view) => view.isDefault && view.config?.panels?.length
      );

      // User accounts never restore a browser-specific workspace. They always
      // start from an admin-owned template, falling back to the first template
      // explicitly available to them when none is marked as default.
      if (isTemplateUser) {
        const assigned =
          fallback || viewList.find((view) => view.config?.panels?.length);
        if (assigned) applyView(assigned);
        return;
      }

      const stored = readStoredPanels().filter((panel) => ids.has(panel.queryId));
      if (stored.length > 0) {
        setPanels(stored);
        return;
      }
      // Nothing of their own yet: hand them the default template if an admin
      // set one up, otherwise just open the first query.
      if (fallback) {
        applyView(fallback);
      } else if (list.length > 0) {
        setPanels([makePanel(list[0].id)]);
      }
    });
  }, [loadQueries, loadViews, applyView, isTemplateUser]);

  useEffect(() => {
    if (!hydrated.current || isTemplateUser) return;
    try {
      window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(panels));
    } catch {
      // storage can be full or blocked — the workspace still works in-memory
    }
  }, [panels, isTemplateUser]);

  const measureContainer = useCallback(() => {
    return Math.round(panelsRef.current?.getBoundingClientRect().width || 0);
  }, []);

  // Panels live on an absolute-positioned canvas. Keep them within its current
  // width and place legacy panels without x/y into a tidy starting grid.
  useEffect(() => {
    const measure = () => {
      const width = measureContainer();
      if (!width) return;
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
    if (observer && panelsRef.current) observer.observe(panelsRef.current);
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
    setPanels((prev) =>
      prev.some((panel) => panel.queryId === queryId)
        ? prev
        : arrangeUnpositionedPanels([...prev, makePanel(queryId)], containerWidth)
    );
  }, [containerWidth]);

  const togglePanel = (queryId) => {
    setPanels((prev) =>
      prev.some((panel) => panel.queryId === queryId)
        ? prev.filter((panel) => panel.queryId !== queryId)
        : arrangeUnpositionedPanels([...prev, makePanel(queryId)], containerWidth)
    );
  };

  const closePanel = (queryId) => {
    setPanels((prev) => prev.filter((panel) => panel.queryId !== queryId));
  };

  const updatePanel = (queryId, updater) => {
    setPanels((prev) =>
      prev.map((panel) => (panel.queryId === queryId ? { ...panel, ...updater(panel) } : panel))
    );
  };

  const movePanelTo = useCallback(
    (queryId, x, y) => {
      setPanels((prev) =>
        prev.map((panel) => {
          if (panel.queryId !== queryId) return panel;
          const width = clampPanelWidth(panel.width, containerWidth);
          return {
            ...panel,
            x: Math.min(Math.max(0, Math.round(x)), Math.max(0, containerWidth - width)),
            y: Math.max(0, Math.round(y)),
            width,
          };
        })
      );
    },
    [containerWidth]
  );

  const resizePanel = useCallback(
    (queryId, frame) => {
      setPanels((prev) =>
        prev.map((panel) => {
          if (panel.queryId !== queryId) return panel;
          const canvasWidth = containerWidth || DEFAULT_PANEL_WIDTH;
          const minWidth = Math.min(MIN_PANEL_WIDTH, canvasWidth);
          let width = clampPanelWidth(frame.width ?? panel.width, canvasWidth);
          const height = clampPanelHeight(frame.height ?? panel.height);
          let x = Math.min(
            Math.max(0, Math.round(frame.x ?? panel.x ?? 0)),
            Math.max(0, canvasWidth - minWidth)
          );
          let y = Math.max(0, Math.round(frame.y ?? panel.y ?? 0));

          // Keep the opposite edge anchored, including when the pointer reaches
          // the canvas boundary. Without this, resizing past an edge can make
          // the entire frame jump sideways.
          if (frame.dirX === 1) {
            width = Math.min(width, Math.max(minWidth, canvasWidth - x));
          } else if (frame.dirX === -1) {
            const fixedRight = Math.min(
              canvasWidth,
              Math.max(
                minWidth,
                Math.round(
                  Number(frame.x ?? panel.x ?? 0) +
                    Number(frame.width ?? panel.width ?? DEFAULT_PANEL_WIDTH)
                )
              )
            );
            width = Math.min(width, fixedRight);
            x = fixedRight - width;
          } else {
            x = Math.min(x, Math.max(0, canvasWidth - width));
          }

          if (frame.dirY === -1) {
            const fixedBottom = Math.max(
              MIN_PANEL_HEIGHT,
              Math.round(
                Number(frame.y ?? panel.y ?? 0) +
                  Number(frame.height ?? panel.height ?? DEFAULT_PANEL_HEIGHT)
              )
            );
            const anchoredHeight = Math.min(height, fixedBottom);
            y = fixedBottom - anchoredHeight;
          }

          return {
            ...panel,
            x,
            y,
            width,
            height,
          };
        })
      );
    },
    [containerWidth]
  );

  const bringPanelToFront = useCallback((queryId) => {
    setPanels((prev) => {
      const index = prev.findIndex((panel) => panel.queryId === queryId);
      if (index === -1 || index === prev.length - 1) return prev;
      const next = [...prev];
      const [panel] = next.splice(index, 1);
      next.push(panel);
      return next;
    });
  }, []);

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
    setPanels((prev) => {
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
  // Focusing the search box may have to wait for the sidebar to open again, and
  // that render is scheduled by React rather than happening on the spot.
  const wantSearchFocus = useRef(false);

  const focusSearch = useCallback(() => {
    if (!sidebarOpen) {
      wantSearchFocus.current = true;
      toggleSidebar(true);
      return;
    }
    searchRef.current?.focus();
  }, [sidebarOpen, toggleSidebar]);

  useEffect(() => {
    if (!sidebarOpen || !wantSearchFocus.current) return;
    wantSearchFocus.current = false;
    searchRef.current?.focus();
  }, [sidebarOpen]);
  useEffect(() => {
    const onKeyDown = (event) => {
      const tag = event.target?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        event.target?.isContentEditable ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) {
        return;
      }
      if (event.key === "/") {
        event.preventDefault();
        focusSearch();
      } else if (event.key === "b") {
        event.preventDefault();
        toggleSidebar();
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

  const queryById = useMemo(
    () => new Map(queries.map((query) => [query.id, query])),
    [queries]
  );
  const openPanels = useMemo(
    () => panels.filter((panel) => queryById.has(panel.queryId)),
    [panels, queryById]
  );
  const captureRenderedPanelHeight = useCallback((queryId, height) => {
    setRenderedPanelHeights((prev) =>
      prev[queryId] === height ? prev : { ...prev, [queryId]: height }
    );
  }, []);
  const canvasHeight = useMemo(
    () =>
      Math.max(
        CANVAS_MIN_HEIGHT,
        ...openPanels.map(
          (panel) =>
            (panel.y || 0) +
            (renderedPanelHeights[panel.queryId] || panelEstimatedHeight(panel)) +
            PANEL_GAP
        )
      ),
    [openPanels, renderedPanelHeights]
  );

  return (
    <div className="mx-auto max-w-[1900px] p-4 lg:p-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-black tracking-tight">
            <Database size={20} className="text-red-600" />
            GameDB
            <span className="rounded bg-red-600/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-red-600">
              INBLACKM
            </span>
          </h1>
          <p className="mt-1 text-xs font-semibold text-zinc-500">
            {isTemplateUser
              ? "รัน Query และใช้งานข้อมูลตาม Template ที่ผู้ดูแลกำหนด"
              : "เลือกได้หลาย Query พร้อมกัน — ลากขอบตารางเพื่อขยายทุกด้าน ลากที่จุดจับเพื่อสลับตำแหน่ง และเพิ่มคอลัมน์สูตรได้เอง"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {views.length > 0 && (
            <div className="flex items-center gap-1 rounded-xl border border-zinc-200 bg-white px-2.5 py-2">
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
                {!isTemplateUser && <option value="">หน้าจอของฉัน</option>}
                {views.map((view) => (
                  <option key={view.id} value={view.id}>
                    {view.name}
                  </option>
                ))}
              </select>
              {activeView && !isTemplateUser && (
                <button
                  type="button"
                  onClick={leaveView}
                  className="rounded-md p-0.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-red-600"
                  title="ออกจากเทมเพลต กลับไปหน้าจอของฉัน"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          )}
          <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2">
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
            onClick={exportWorkbook}
            title="ดาวน์โหลดทุกตารางที่เปิดอยู่เป็น Excel หลายชีต (คีย์ลัด: e)"
            className="rounded-xl border border-zinc-200 bg-white p-2.5 text-zinc-500 transition hover:bg-zinc-50 hover:text-zinc-700"
          >
            <FileSpreadsheet size={14} />
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            title="สลับโหมดสว่าง/มืด (คีย์ลัด: d)"
            className="rounded-xl border border-zinc-200 bg-white p-2.5 text-zinc-500 transition hover:bg-zinc-50 hover:text-zinc-700"
          >
            {dark ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          <button
            type="button"
            onClick={logout}
            title="ออกจากระบบ"
            className="rounded-xl border border-zinc-200 bg-white p-2.5 text-zinc-500 transition hover:bg-red-50 hover:text-red-600"
          >
            <LogOut size={14} />
          </button>
          {isSuperAdmin && (
            <>
              <button
                type="button"
                onClick={() => setViewsModal(true)}
                className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-xs font-black text-zinc-600 transition hover:bg-zinc-50"
                title="บันทึกหน้าจอนี้เป็นเทมเพลต / ส่งให้คนอื่น"
              >
                <Layers size={14} /> เทมเพลต ({views.length})
              </button>
              <button
                type="button"
                onClick={() => setEditLogModal(true)}
                className="rounded-xl border border-zinc-200 bg-white p-2.5 text-zinc-500 transition hover:bg-zinc-50 hover:text-zinc-700"
                title="ประวัติการแก้ไขข้อมูล"
              >
                <History size={14} />
              </button>
              <button
                type="button"
                onClick={() => setHealthModal(true)}
                className="rounded-xl border border-zinc-200 bg-white p-2.5 text-zinc-500 transition hover:bg-zinc-50 hover:text-zinc-700"
                title="ตรวจสุขภาพระบบ / สิทธิ์ฐานข้อมูล"
              >
                <Activity size={14} />
              </button>
              <button
                type="button"
                onClick={() => setUsersModal(true)}
                className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-xs font-black text-zinc-600 transition hover:bg-zinc-50"
              >
                <Users size={14} /> ผู้ใช้
              </button>
              <button
                type="button"
                onClick={() => setConnectionsModal(true)}
                className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-xs font-black text-zinc-600 transition hover:bg-zinc-50"
              >
                <Server size={14} /> ฐานข้อมูล ({connections.length + 1})
              </button>
              <button
                type="button"
                onClick={() => setEditorModal({ mode: "create" })}
                className="flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-xs font-black text-white transition hover:bg-red-700"
              >
                <Plus size={14} /> เพิ่ม Query
              </button>
            </>
          )}
        </div>
      </header>

      <div className="flex flex-col gap-4">
        {!isTemplateUser && !sidebarOpen && (
          <aside className="flex w-full shrink-0 items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2">
            <button
              type="button"
              onClick={() => toggleSidebar(true)}
              className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-700"
              title="เปิดแถบรายการ Query (คีย์ลัด: b)"
            >
              <PanelLeftOpen size={15} />
            </button>
            <button
              type="button"
              onClick={focusSearch}
              className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-700"
              title="ค้นหา Query (คีย์ลัด: /)"
            >
              <Search size={15} />
            </button>
            <span
              className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-black text-zinc-500"
              title={`เปิดอยู่ ${openPanels.length} ตาราง`}
            >
              {openPanels.length}
            </span>
          </aside>
        )}
        {!isTemplateUser && <aside
          className={`w-full shrink-0 rounded-2xl border border-zinc-200 bg-white p-3 ${
            sidebarOpen ? "" : "hidden"
          }`}
        >
          <div className="mb-2 flex items-center gap-1.5">
            <div className="relative min-w-0 flex-1">
              <Search
                size={13}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
              />
              <input
                ref={searchRef}
                type="text"
                value={sidebarSearch}
                onChange={(e) => setSidebarSearch(e.target.value)}
                placeholder="ค้นหาชื่อ / SQL... (กด /)"
                className="h-9 w-full rounded-lg border border-zinc-200 bg-zinc-50 pl-8 pr-3 text-xs font-semibold outline-none focus:border-red-600 focus:bg-white"
              />
            </div>
            <button
              type="button"
              onClick={() => toggleSidebar(false)}
              className="shrink-0 rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
              title="ย่อแถบรายการเพื่อให้ตารางกว้างขึ้น (คีย์ลัด: b)"
            >
              <PanelLeftClose size={15} />
            </button>
          </div>
          <div className="mb-2 flex items-center justify-between gap-2 px-1">
            <span className="text-[10px] font-black text-zinc-400">
              เปิดอยู่ {openPanels.length} ตาราง
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={openAll}
                disabled={filteredQueries.length === 0}
                className="rounded-md px-1.5 py-0.5 text-[10px] font-black text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-40"
              >
                เปิดทั้งหมด
              </button>
              <button
                type="button"
                onClick={() => setPanels([])}
                disabled={panels.length === 0}
                className="rounded-md px-1.5 py-0.5 text-[10px] font-black text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-40"
              >
                ปิดทั้งหมด
              </button>
            </div>
          </div>
          {loadingList ? (
            <p className="flex items-center gap-2 px-2 py-4 text-xs font-semibold text-zinc-400">
              <Loader2 size={14} className="animate-spin" /> กำลังโหลด...
            </p>
          ) : listError ? (
            <p className="px-2 py-4 text-xs font-bold text-red-600">{listError}</p>
          ) : filteredQueries.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs font-semibold text-zinc-400">
              ไม่พบ Query
            </p>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-1">
              {groupedQueries.map(([folder, folderQueries]) => (
                <div key={folder} className="min-w-56 flex-1 space-y-1 pb-1">
                  {groupedQueries.length > 1 && (
                    <p className="px-2 pb-1 pt-2 text-[9px] font-black uppercase tracking-wider text-zinc-400">
                      {folder}
                    </p>
                  )}
                  {folderQueries.map((query) => {
                const isOpen = openIds.has(query.id);
                return (
                  <div
                    key={query.id}
                    className={`group flex items-center gap-1 rounded-xl border px-3 py-2.5 transition ${
                      isOpen
                        ? "border-red-600 bg-red-600 text-white"
                        : "border-transparent text-zinc-600 hover:bg-zinc-50"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => togglePanel(query.id)}
                      className="min-w-0 flex-1 text-left"
                      title={isOpen ? "กดเพื่อปิดตารางนี้" : "กดเพื่อเปิดตารางนี้"}
                    >
                      <p className="truncate text-xs font-black">{query.name}</p>
                      {query.description ? (
                        <p
                          className={`truncate text-[10px] font-semibold ${
                            isOpen ? "text-white/70" : "text-zinc-400"
                          }`}
                        >
                          {query.description}
                        </p>
                      ) : null}
                      {query.connectionName ? (
                        <p
                          className={`flex items-center gap-1 truncate text-[9px] font-bold ${
                            isOpen ? "text-white/60" : "text-sky-600"
                          }`}
                        >
                          <Server size={9} /> {query.connectionName}
                        </p>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      onClick={() => togglePin(query.id)}
                      className={`shrink-0 rounded-md p-1 transition ${
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
                          className={`rounded-md p-1 transition ${
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
                          className={`rounded-md p-1 transition ${
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
        </aside>}

        <div
          className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-[10px] font-semibold ${
            isTemplateUser
              ? "border-zinc-200 bg-zinc-50 text-zinc-500"
              : "border-red-100 bg-red-50/70 text-zinc-600"
          }`}
        >
          {isTemplateUser ? (
            <Lock size={13} className="mt-0.5 shrink-0 text-zinc-400" />
          ) : (
            <LayoutGrid size={13} className="mt-0.5 shrink-0 text-red-500" />
          )}
          <p>
            {isTemplateUser
              ? "หน้าจอนี้จัดวางโดย Admin — คุณสามารถกรอกพารามิเตอร์ รัน Query ค้นหา และดาวน์โหลดข้อมูลได้ตามปกติ"
              : "จัดหน้าจอ: ลากจุดจับ ⋮⋮ เพื่อย้ายกล่อง · คลิกกล่องแล้วลากจุดรอบกรอบเพื่อปรับขนาด · ดับเบิลคลิกจุดจับเพื่อคืนขนาดเดิม"}
          </p>
        </div>

        <div
          className="relative min-w-0 flex-1"
          ref={panelsRef}
          style={{ minHeight: canvasHeight }}
        >
          {openPanels.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-zinc-300 bg-white py-24 text-center">
              {isTemplateUser ? (
                <>
                  <Lock size={22} className="text-zinc-300" />
                  <p className="text-xs font-black text-zinc-500">ยังไม่มี Template สำหรับบัญชีนี้</p>
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
          ) : (
            <>
              {openPanels.map((panel) => {
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
                    onLayoutChange={captureLayout}
                    onDataChange={captureData}
                    canManage={isSuperAdmin}
                    canCustomizeLayout={!isTemplateUser}
                    isFullWidth={isFullWidth}
                    onPositionChange={movePanelTo}
                    onFrameChange={resizePanel}
                    onBringToFront={bringPanelToFront}
                    onRenderedHeight={captureRenderedPanelHeight}
                    onClose={() => closePanel(panel.queryId)}
                    onToggleFullWidth={() =>
                      updatePanel(panel.queryId, (prev) => ({
                        x: isFullWidth ? prev.x : 0,
                        width: isFullWidth
                          ? Math.min(DEFAULT_PANEL_WIDTH, measureContainer())
                          : measureContainer(),
                      }))
                    }
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
                    onDrill={isTemplateUser ? null : openDrill}
                    initialParams={drillParams[panel.queryId] || null}
                  />
                );
              })}
            </>
          )}
        </div>
      </div>

      {editorModal && (
        <QueryEditorModal
          modal={editorModal}
          connections={connections}
          onClose={() => setEditorModal(null)}
          onSaved={async (savedQuery) => {
            setEditorModal(null);
            await loadQueries();
            setPanels((prev) =>
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
        />
      )}
    </div>
  );
}
