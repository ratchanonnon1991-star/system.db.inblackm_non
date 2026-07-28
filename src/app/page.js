"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Database,
  Layers,
  LayoutGrid,
  Loader2,
  Lock,
  LogOut,
  Pencil,
  Plus,
  Search,
  Server,
  Trash2,
  User,
  Users,
  X,
} from "lucide-react";
import { apiJson } from "@/lib/api-json";
import QueryPanel from "@/components/query-panel";
import {
  ConnectionsModal,
  QueryEditorModal,
  UsersModal,
} from "@/components/gamedb-modals";
import ViewsModal from "@/components/views-modal";

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

// Open panels (which query, how wide, how tall, collapsed) are per-browser
// preferences, so they live in localStorage instead of the shared layout.
const WORKSPACE_STORAGE_KEY = "gamedb.workspace.v1";
const DEFAULT_PANEL_HEIGHT = 420;
const MIN_PANEL_HEIGHT = 140;
const MAX_PANEL_HEIGHT = 1600;
const MIN_PANEL_WIDTH = 280;

function clampPanelHeight(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return DEFAULT_PANEL_HEIGHT;
  return Math.round(Math.min(MAX_PANEL_HEIGHT, Math.max(MIN_PANEL_HEIGHT, num)));
}

// width null = let the panel flex to fill its row, which is the default and
// what "รีเซ็ต" goes back to.
function clampPanelWidth(value, containerWidth) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  const max = containerWidth || MAX_PANEL_HEIGHT * 2;
  return Math.round(Math.min(max, Math.max(MIN_PANEL_WIDTH, num)));
}

function makePanel(queryId) {
  return {
    queryId,
    width: null,
    height: DEFAULT_PANEL_HEIGHT,
    collapsed: false,
  };
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
        width: clampPanelWidth(item.width, 0),
        height: clampPanelHeight(item.height),
        collapsed: Boolean(item.collapsed),
      }));
  } catch {
    return [];
  }
}

function GamedbWorkspace({ me, onLoggedOut }) {
  const isSuperAdmin = me.role === "admin";

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
  const [draggingQueryId, setDraggingQueryId] = useState(null);

  const [editorModal, setEditorModal] = useState(null);
  const [connections, setConnections] = useState([]);
  const [connectionsModal, setConnectionsModal] = useState(false);
  const [usersModal, setUsersModal] = useState(false);

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
      const stored = readStoredPanels().filter((panel) => ids.has(panel.queryId));
      if (stored.length > 0) {
        setPanels(stored);
        return;
      }
      // Nothing of their own yet: hand them the default template if an admin
      // set one up, otherwise just open the first query.
      const fallback = viewList.find((view) => view.isDefault && view.config?.panels?.length);
      if (fallback) {
        applyView(fallback);
      } else if (list.length > 0) {
        setPanels([makePanel(list[0].id)]);
      }
    });
  }, [loadQueries, loadViews, applyView]);

  useEffect(() => {
    if (!hydrated.current) return;
    try {
      window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(panels));
    } catch {
      // storage can be full or blocked — the workspace still works in-memory
    }
  }, [panels]);

  const measureContainer = useCallback(() => {
    return Math.round(panelsRef.current?.getBoundingClientRect().width || 0);
  }, []);

  // Panels sized by hand are px-wide, so keep them inside the row when the
  // window (or the sidebar) changes width. ResizeObserver catches sidebar and
  // zoom changes, but it only delivers while the page is being rendered, so
  // measure directly as well instead of leaving the width unknown.
  useEffect(() => {
    const measure = () => {
      const width = measureContainer();
      if (!width) return;
      setContainerWidth(width);
      setPanels((prev) =>
        prev.some((panel) => panel.width && panel.width > width)
          ? prev.map((panel) =>
              panel.width && panel.width > width ? { ...panel, width } : panel
            )
          : prev
      );
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

  const togglePanel = (queryId) => {
    setPanels((prev) =>
      prev.some((panel) => panel.queryId === queryId)
        ? prev.filter((panel) => panel.queryId !== queryId)
        : [...prev, makePanel(queryId)]
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

  const movePanel = (queryId, direction) => {
    setPanels((prev) => {
      const from = prev.findIndex((panel) => panel.queryId === queryId);
      const to = from + direction;
      if (from === -1 || to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
  };

  const swapPanels = (queryIdA, queryIdB) => {
    setPanels((prev) => {
      const a = prev.findIndex((panel) => panel.queryId === queryIdA);
      const b = prev.findIndex((panel) => panel.queryId === queryIdB);
      if (a === -1 || b === -1 || a === b) return prev;
      const next = [...prev];
      [next[a], next[b]] = [next[b], next[a]];
      return next;
    });
  };

  const filteredQueries = useMemo(() => {
    const filter = sidebarSearch.trim().toLowerCase();
    if (!filter) return queries;
    return queries.filter(
      (query) =>
        query.name.toLowerCase().includes(filter) ||
        (query.description || "").toLowerCase().includes(filter)
    );
  }, [queries, sidebarSearch]);

  const openAll = () => {
    setPanels((prev) => {
      const existing = new Map(prev.map((panel) => [panel.queryId, panel]));
      return filteredQueries.map(
        (query) => existing.get(query.id) || makePanel(query.id)
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
            เลือกได้หลาย Query พร้อมกัน — ลากขอบตารางเพื่อขยายทุกด้าน ลากที่จุดจับเพื่อสลับตำแหน่ง และเพิ่มคอลัมน์สูตรได้เอง
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
                <option value="">หน้าจอของฉัน</option>
                {views.map((view) => (
                  <option key={view.id} value={view.id}>
                    {view.name}
                  </option>
                ))}
              </select>
              {activeView && (
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
              <p className="text-zinc-500">{isSuperAdmin ? "Admin" : "Staff"}</p>
            </div>
          </div>
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

      <div className="flex flex-col gap-4 lg:flex-row">
        <aside className="w-full shrink-0 rounded-2xl border border-zinc-200 bg-white p-3 lg:w-64">
          <div className="relative mb-2">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={sidebarSearch}
              onChange={(e) => setSidebarSearch(e.target.value)}
              placeholder="ค้นหา Query..."
              className="h-9 w-full rounded-lg border border-zinc-200 bg-zinc-50 pl-8 pr-3 text-xs font-semibold outline-none focus:border-red-600 focus:bg-white"
            />
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
            <div className="space-y-1">
              {filteredQueries.map((query) => {
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
          )}
        </aside>

        <div className="min-w-0 flex-1" ref={panelsRef}>
          {openPanels.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-zinc-300 bg-white py-24 text-center">
              <LayoutGrid size={22} className="text-zinc-300" />
              <p className="text-xs font-black text-zinc-500">ยังไม่ได้เปิดตาราง</p>
              <p className="text-[11px] font-semibold text-zinc-400">
                กด Query ทางซ้ายเพื่อเปิด — เปิดพร้อมกันหลายตารางได้
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap items-start gap-4">
              {openPanels.map((panel, index) => {
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
                    onLayoutChange={captureLayout}
                    canManage={isSuperAdmin}
                    canMoveUp={index > 0}
                    canMoveDown={index < openPanels.length - 1}
                    isFullWidth={isFullWidth}
                    draggingQueryId={draggingQueryId}
                    onMove={(direction) => movePanel(panel.queryId, direction)}
                    onClose={() => closePanel(panel.queryId)}
                    onToggleFullWidth={() =>
                      updatePanel(panel.queryId, () => ({
                        width: isFullWidth ? null : measureContainer() || null,
                      }))
                    }
                    onToggleCollapse={() =>
                      updatePanel(panel.queryId, (prev) => ({
                        collapsed: !prev.collapsed,
                      }))
                    }
                    onHeightChange={(height) =>
                      updatePanel(panel.queryId, () => ({
                        height: clampPanelHeight(height),
                      }))
                    }
                    onResetHeight={() =>
                      updatePanel(panel.queryId, () => ({
                        height: DEFAULT_PANEL_HEIGHT,
                      }))
                    }
                    onWidthChange={(width) =>
                      updatePanel(panel.queryId, () => ({
                        width: clampPanelWidth(width, containerWidth),
                      }))
                    }
                    onResetWidth={() =>
                      updatePanel(panel.queryId, () => ({ width: null }))
                    }
                    onDragStart={() => setDraggingQueryId(panel.queryId)}
                    onDragEnd={() => setDraggingQueryId(null)}
                    onDropPanel={() => {
                      swapPanels(draggingQueryId, panel.queryId);
                      setDraggingQueryId(null);
                    }}
                    onEditQuery={() => setEditorModal({ mode: "edit", query })}
                  />
                );
              })}
            </div>
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
