"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Calculator,
  Database,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  LogOut,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Server,
  Trash2,
  User,
  X,
} from "lucide-react";
import { apiJson } from "@/lib/api-json";
import {
  evaluateFormula,
  extractFormulaRefs,
  parseFormula,
} from "@/lib/gamedb-formula";

const EMPTY_LAYOUT = { order: [], hidden: [], labels: {}, computed: [] };

function normalizeLayout(raw) {
  const layout = raw && typeof raw === "object" ? raw : {};
  return {
    order: Array.isArray(layout.order) ? layout.order : [],
    hidden: Array.isArray(layout.hidden) ? layout.hidden : [],
    labels:
      layout.labels && typeof layout.labels === "object" ? layout.labels : {},
    computed: Array.isArray(layout.computed) ? layout.computed : [],
  };
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function formatCell(value, type) {
  if (value === null || value === undefined) return "—";
  if (type === "number") {
    const num = toNumber(value);
    if (num === null) return String(value);
    return num.toLocaleString("th-TH", { maximumFractionDigits: 2 });
  }
  if (type === "datetime") {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? String(value)
      : date.toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
  }
  if (type === "date") {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? String(value)
      : date.toLocaleDateString("th-TH");
  }
  if (type === "boolean") return value ? "✓" : "✗";
  return String(value);
}

// Display columns mix base result columns (id = name) and computed columns
// (id = "#key") so layout order/hidden/labels can address both kinds.
function buildDisplayColumns(resultColumns, layout) {
  const base = resultColumns.map((col) => ({
    id: col.name,
    label: layout.labels[col.name] || col.name,
    type: col.type,
    kind: "base",
    column: col,
  }));
  const computed = layout.computed.map((col) => {
    let ast = null;
    let formulaError = "";
    try {
      ast = parseFormula(col.formula);
    } catch (err) {
      formulaError = err.message;
    }
    return {
      id: `#${col.key}`,
      label: layout.labels[`#${col.key}`] || col.label,
      type: "number",
      kind: "computed",
      formula: col.formula,
      ast,
      formulaError,
    };
  });

  const all = [...base, ...computed];
  if (!layout.order.length) return all;

  const byId = new Map(all.map((col) => [col.id, col]));
  const ordered = [];
  for (const id of layout.order) {
    if (byId.has(id)) {
      ordered.push(byId.get(id));
      byId.delete(id);
    }
  }
  for (const col of all) {
    if (byId.has(col.id)) ordered.push(col);
  }
  return ordered;
}

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

  const [selectedId, setSelectedId] = useState(null);
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState("");

  const [layout, setLayout] = useState(EMPTY_LAYOUT);
  const [layoutDirty, setLayoutDirty] = useState(false);
  const [savingLayout, setSavingLayout] = useState(false);

  const [rowFilter, setRowFilter] = useState("");
  const [editorModal, setEditorModal] = useState(null);
  const [computedModal, setComputedModal] = useState(false);
  const [connections, setConnections] = useState([]);
  const [connectionsModal, setConnectionsModal] = useState(false);

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

  const selectedQuery = useMemo(
    () => queries.find((query) => query.id === selectedId) || null,
    [queries, selectedId]
  );

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

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setState runs after the fetch resolves
    loadQueries().then((list) => {
      if (list.length > 0) {
        setSelectedId((prev) => prev ?? list[0].id);
      }
    });
  }, [loadQueries]);

  const runQuery = useCallback(async (queryId) => {
    setRunning(true);
    setRunError("");
    setResult(null);
    setRowFilter("");
    try {
      const data = await apiJson(`/api/queries/${queryId}/run`, {
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
  }, []);

  useEffect(() => {
    if (selectedId != null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- setState happens after the run request resolves
      runQuery(selectedId);
    }
  }, [selectedId, runQuery]);

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
    }));
  };

  const saveLayout = async () => {
    if (selectedId == null) return;
    setSavingLayout(true);
    try {
      const data = await apiJson(`/api/queries/${selectedId}/layout`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ layout }),
        fallbackError: "บันทึก Layout ไม่สำเร็จ",
      });
      setLayout(normalizeLayout(data.layout));
      setLayoutDirty(false);
      setQueries((prev) =>
        prev.map((query) =>
          query.id === selectedId ? { ...query, layout: data.layout } : query
        )
      );
    } catch (err) {
      window.alert(err.message);
    } finally {
      setSavingLayout(false);
    }
  };

  const resetLayout = () => {
    mutateLayout(() => ({ ...EMPTY_LAYOUT }));
  };

  const deleteQueryById = async (query) => {
    if (!window.confirm(`ลบ Query "${query.name}" ?`)) return;
    try {
      await apiJson(`/api/queries/${query.id}`, {
        method: "DELETE",
        fallbackError: "ลบ Query ไม่สำเร็จ",
      });
      const list = await loadQueries();
      if (selectedId === query.id) {
        setSelectedId(list[0]?.id ?? null);
        setResult(null);
      }
    } catch (err) {
      window.alert(err.message);
    }
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

  return (
    <div className="mx-auto max-w-[1600px] p-4 lg:p-6">
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
            เลือก Query ทางซ้ายเพื่อดึงข้อมูลจากฐานข้อมูล แล้วจัดคอลัมน์ / เพิ่มคอลัมน์สูตรได้เอง
          </p>
        </div>
        <div className="flex items-center gap-2">
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
          <div className="relative mb-3">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={sidebarSearch}
              onChange={(e) => setSidebarSearch(e.target.value)}
              placeholder="ค้นหา Query..."
              className="h-9 w-full rounded-lg border border-zinc-200 bg-zinc-50 pl-8 pr-3 text-xs font-semibold outline-none focus:border-red-600 focus:bg-white"
            />
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
                const isActive = query.id === selectedId;
                return (
                  <div
                    key={query.id}
                    className={`group flex items-center gap-1 rounded-xl border px-3 py-2.5 transition ${
                      isActive
                        ? "border-red-600 bg-red-600 text-white"
                        : "border-transparent text-zinc-600 hover:bg-zinc-50"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedId(query.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="truncate text-xs font-black">{query.name}</p>
                      {query.description ? (
                        <p
                          className={`truncate text-[10px] font-semibold ${
                            isActive ? "text-white/70" : "text-zinc-400"
                          }`}
                        >
                          {query.description}
                        </p>
                      ) : null}
                      {query.connectionName ? (
                        <p
                          className={`flex items-center gap-1 truncate text-[9px] font-bold ${
                            isActive ? "text-white/60" : "text-sky-600"
                          }`}
                        >
                          <Server size={9} /> {query.connectionName}
                        </p>
                      ) : null}
                    </button>
                    {isSuperAdmin && (
                      <div
                        className={`flex shrink-0 items-center gap-0.5 ${
                          isActive ? "" : "opacity-0 group-hover:opacity-100"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setEditorModal({ mode: "edit", query })}
                          className={`rounded-md p-1 transition ${
                            isActive
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
                            isActive
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

        <section className="min-w-0 flex-1 rounded-2xl border border-zinc-200 bg-white p-4">
          {selectedQuery == null ? (
            <p className="py-16 text-center text-xs font-semibold text-zinc-400">
              เลือก Query จากรายการทางซ้าย
            </p>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black">{selectedQuery.name}</p>
                  {result ? (
                    <p className="text-[10px] font-semibold text-zinc-400">
                      {displayRows.length.toLocaleString("th-TH")} แถว
                      {rowFilter.trim() ? ` (กรองจาก ${result.rowCount.toLocaleString("th-TH")})` : ""}
                      {" · "}ใช้เวลา {result.durationMs} ms
                      {" · DB: "}
                      {selectedQuery.connectionName || "หลัก (inblackm)"}
                      {result.truncated ? " · แสดงสูงสุด 1,000 แถวแรก" : ""}
                    </p>
                  ) : null}
                </div>
                <div className="relative">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    value={rowFilter}
                    onChange={(e) => setRowFilter(e.target.value)}
                    placeholder="ค้นหาในผลลัพธ์..."
                    className="h-9 w-44 rounded-lg border border-zinc-200 bg-zinc-50 pl-8 pr-3 text-xs font-semibold outline-none focus:border-red-600 focus:bg-white"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => runQuery(selectedQuery.id)}
                  disabled={running}
                  className="flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-2 text-[11px] font-black text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-50"
                >
                  <RefreshCw size={12} className={running ? "animate-spin" : ""} />
                  รันใหม่
                </button>
                <button
                  type="button"
                  onClick={() => setComputedModal(true)}
                  disabled={!result}
                  className="flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-2 text-[11px] font-black text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-50"
                >
                  <Calculator size={12} /> เพิ่มคอลัมน์สูตร
                </button>
                {layoutDirty && (
                  <>
                    <button
                      type="button"
                      onClick={saveLayout}
                      disabled={savingLayout}
                      className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-[11px] font-black text-white transition hover:bg-red-700 disabled:opacity-50"
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
                      className="flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-2 text-[11px] font-black text-zinc-500 transition hover:bg-zinc-50"
                      title="ล้าง layout กลับเป็นค่าเริ่มต้น"
                    >
                      <RotateCcw size={12} /> ล้าง
                    </button>
                  </>
                )}
              </div>

              {hiddenColumns.length > 0 && (
                <div className="mb-3 flex flex-wrap items-center gap-1.5">
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

              {running ? (
                <p className="flex items-center justify-center gap-2 py-16 text-xs font-semibold text-zinc-400">
                  <Loader2 size={16} className="animate-spin" /> กำลังรัน Query...
                </p>
              ) : runError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-bold text-red-600">
                  {runError}
                </div>
              ) : result ? (
                <div className="overflow-x-auto rounded-xl border border-zinc-200">
                  <table className="w-full border-collapse text-[11px]">
                    <thead>
                      <tr className="bg-zinc-100">
                        <th className="sticky top-0 w-10 border border-zinc-200 bg-zinc-100 px-2 py-2 text-center font-black text-zinc-400">
                          #
                        </th>
                        {visibleColumns.map((col) => (
                          <th
                            key={col.id}
                            className="group sticky top-0 border border-zinc-200 bg-zinc-100 px-2 py-1.5 text-left"
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
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {displayRows.length === 0 ? (
                        <tr>
                          <td
                            colSpan={visibleColumns.length + 1}
                            className="border border-zinc-200 px-3 py-8 text-center font-semibold text-zinc-400"
                          >
                            ไม่มีข้อมูล
                          </td>
                        </tr>
                      ) : (
                        displayRows.map((cells, rowIndex) => (
                          <tr key={rowIndex} className="odd:bg-white even:bg-zinc-50/60 hover:bg-amber-50/60">
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
                                  className={`border border-zinc-200 px-2 py-1.5 font-semibold text-zinc-700 ${
                                    numeric ? "text-right font-mono tabular-nums" : ""
                                  }`}
                                >
                                  {cell.text}
                                </td>
                              );
                            })}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </>
          )}
        </section>
      </div>

      {editorModal && (
        <QueryEditorModal
          modal={editorModal}
          connections={connections}
          onClose={() => setEditorModal(null)}
          onSaved={async (savedQuery) => {
            setEditorModal(null);
            await loadQueries();
            setSelectedId(savedQuery.id);
            runQuery(savedQuery.id);
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
    </div>
  );
}

function QueryEditorModal({ modal, connections, onClose, onSaved }) {
  const isEdit = modal.mode === "edit";
  const [name, setName] = useState(isEdit ? modal.query.name : "");
  const [description, setDescription] = useState(
    isEdit ? modal.query.description : ""
  );
  const [sqlText, setSqlText] = useState(isEdit ? modal.query.sqlText : "SELECT ");
  const [connectionId, setConnectionId] = useState(
    isEdit && modal.query.connectionId ? String(modal.query.connectionId) : ""
  );
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [error, setError] = useState("");

  const testRun = async () => {
    setTesting(true);
    setError("");
    setTestResult(null);
    try {
      const data = await apiJson("/api/queries/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sqlText,
          connectionId: connectionId ? Number(connectionId) : null,
        }),
        fallbackError: "รัน SQL ไม่สำเร็จ",
      });
      setTestResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const payload = {
        name,
        description,
        sqlText,
        connectionId: connectionId ? Number(connectionId) : null,
      };
      const data = isEdit
        ? await apiJson(`/api/queries/${modal.query.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            fallbackError: "บันทึก Query ไม่สำเร็จ",
          })
        : await apiJson("/api/queries", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            fallbackError: "สร้าง Query ไม่สำเร็จ",
          });
      onSaved(data.query);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-black">
            {isEdit ? "แก้ไข Query" : "เพิ่ม Query ใหม่"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-zinc-200 p-1.5 text-zinc-500 transition hover:bg-zinc-50"
            aria-label="ปิด"
          >
            <X size={14} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          <div>
            <label className="mb-1 block text-[10px] font-black text-zinc-500">
              ชื่อ Query
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="เช่น ออเดอร์รายวัน"
              className="h-10 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-xs font-semibold outline-none focus:border-red-600 focus:bg-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-black text-zinc-500">
              คำอธิบาย (ไม่บังคับ)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="สั้น ๆ ว่า Query นี้ดึงอะไร"
              className="h-10 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-xs font-semibold outline-none focus:border-red-600 focus:bg-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-black text-zinc-500">
              ฐานข้อมูล
            </label>
            <select
              value={connectionId}
              onChange={(e) => setConnectionId(e.target.value)}
              className="h-10 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-xs font-semibold outline-none focus:border-red-600 focus:bg-white"
            >
              <option value="">หลัก (inblackm)</option>
              {connections.map((conn) => (
                <option key={conn.id} value={conn.id}>
                  {conn.name} — {conn.host}/{conn.database}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-black text-zinc-500">
              SQL (SELECT เท่านั้น — ระบบรันแบบอ่านอย่างเดียว จำกัด 1,000 แถว)
            </label>
            <textarea
              value={sqlText}
              onChange={(e) => setSqlText(e.target.value)}
              rows={10}
              spellCheck={false}
              className="w-full rounded-lg border border-zinc-200 bg-zinc-900 px-3 py-2.5 font-mono text-[11px] leading-relaxed text-emerald-300 outline-none focus:border-red-600"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-bold text-red-600">
              {error}
            </div>
          )}
          {testResult && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-700">
              รันสำเร็จ: {testResult.rowCount.toLocaleString("th-TH")} แถว ·{" "}
              {testResult.columns.length} คอลัมน์ ({testResult.columns.map((col) => col.name).join(", ")}) ·{" "}
              {testResult.durationMs} ms
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={testRun}
            disabled={testing || !sqlText.trim()}
            className="flex items-center gap-1.5 rounded-xl border border-zinc-200 px-4 py-2.5 text-xs font-black text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-50"
          >
            {testing ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Play size={13} />
            )}
            ทดสอบรัน
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !name.trim() || !sqlText.trim()}
            className="flex items-center gap-1.5 rounded-xl bg-red-600 px-5 py-2.5 text-xs font-black text-white transition hover:bg-red-700 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Save size={13} />
            )}
            บันทึก
          </button>
        </div>
      </div>
    </div>
  );
}

function ComputedColumnModal({ availableNames, onClose, onAdd }) {
  const [label, setLabel] = useState("");
  const [formula, setFormula] = useState("");

  const validation = useMemo(() => {
    if (!formula.trim()) return { ok: false, message: "" };
    try {
      const ast = parseFormula(formula);
      const refs = [...extractFormulaRefs(ast)];
      const unknown = refs.filter((name) => !availableNames.includes(name));
      if (unknown.length > 0) {
        return { ok: false, message: `ไม่รู้จักคอลัมน์: ${unknown.join(", ")}` };
      }
      return { ok: true, message: "สูตรถูกต้อง" };
    } catch (err) {
      return { ok: false, message: err.message };
    }
  }, [formula, availableNames]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-black">
            <Calculator size={15} className="text-red-600" /> เพิ่มคอลัมน์สูตร
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-zinc-200 p-1.5 text-zinc-500 transition hover:bg-zinc-50"
            aria-label="ปิด"
          >
            <X size={14} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-[10px] font-black text-zinc-500">
              ชื่อคอลัมน์
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="เช่น กำไร"
              className="h-10 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-xs font-semibold outline-none focus:border-red-600 focus:bg-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-black text-zinc-500">
              สูตร — ใช้ + - * / ( ) และอ้างคอลัมน์ด้วย [ชื่อคอลัมน์]
            </label>
            <input
              type="text"
              value={formula}
              onChange={(e) => setFormula(e.target.value)}
              placeholder="เช่น ([ราคาขาย] - [ต้นทุน]) / [ต้นทุน] * 100"
              className="h-10 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 font-mono text-xs font-semibold outline-none focus:border-red-600 focus:bg-white"
            />
            {formula.trim() && (
              <p
                className={`mt-1 text-[10px] font-bold ${
                  validation.ok ? "text-emerald-600" : "text-red-600"
                }`}
              >
                {validation.message}
              </p>
            )}
          </div>
          <div>
            <p className="mb-1 text-[10px] font-black text-zinc-500">คอลัมน์ที่ใช้ได้ (กดเพื่อแทรก):</p>
            <div className="flex flex-wrap gap-1">
              {availableNames.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setFormula((prev) => `${prev}[${name}]`)}
                  className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[10px] font-bold text-zinc-600 transition hover:bg-zinc-100"
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={() => onAdd({ label: label.trim(), formula: formula.trim() })}
            disabled={!label.trim() || !validation.ok}
            className="flex items-center gap-1.5 rounded-xl bg-red-600 px-5 py-2.5 text-xs font-black text-white transition hover:bg-red-700 disabled:opacity-50"
          >
            <Plus size={13} /> เพิ่มคอลัมน์
          </button>
        </div>
      </div>
    </div>
  );
}

const EMPTY_CONNECTION_FORM = {
  name: "",
  host: "",
  port: "5432",
  database: "",
  username: "",
  password: "",
  ssl: false,
};

function ConnectionsModal({ connections, onClose, onChanged }) {
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_CONNECTION_FORM);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState("");
  const [error, setError] = useState("");

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setTestResult("");
  };

  const startCreate = () => {
    setEditingId(null);
    setForm(EMPTY_CONNECTION_FORM);
    setError("");
    setTestResult("");
  };

  const startEdit = (conn) => {
    setEditingId(conn.id);
    setForm({
      name: conn.name,
      host: conn.host,
      port: String(conn.port),
      database: conn.database,
      username: conn.username,
      password: "",
      ssl: conn.ssl,
    });
    setError("");
    setTestResult("");
  };

  const testConnection = async () => {
    setTesting(true);
    setError("");
    setTestResult("");
    try {
      const data = await apiJson("/api/connections/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId: editingId,
          ...form,
          port: Number(form.port || 5432),
        }),
        fallbackError: "ทดสอบการเชื่อมต่อไม่สำเร็จ",
      });
      setTestResult(`เชื่อมต่อได้: ${data.database} (user ${data.user}) · ${data.version}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const payload = { ...form, port: Number(form.port || 5432) };
      if (editingId) {
        await apiJson(`/api/connections/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          fallbackError: "บันทึกฐานข้อมูลไม่สำเร็จ",
        });
      } else {
        await apiJson("/api/connections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          fallbackError: "เพิ่มฐานข้อมูลไม่สำเร็จ",
        });
      }
      await onChanged();
      startCreate();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (conn) => {
    if (
      !window.confirm(
        `ลบฐานข้อมูล "${conn.name}" ? Query ที่ใช้อยู่จะกลับไปใช้ DB หลักแทน`
      )
    )
      return;
    try {
      await apiJson(`/api/connections/${conn.id}`, {
        method: "DELETE",
        fallbackError: "ลบฐานข้อมูลไม่สำเร็จ",
      });
      await onChanged();
      if (editingId === conn.id) startCreate();
    } catch (err) {
      setError(err.message);
    }
  };

  const inputClass =
    "h-10 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-xs font-semibold outline-none focus:border-red-600 focus:bg-white";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-black">
            <Server size={15} className="text-red-600" /> จัดการฐานข้อมูล (PostgreSQL)
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-zinc-200 p-1.5 text-zinc-500 transition hover:bg-zinc-50"
            aria-label="ปิด"
          >
            <X size={14} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto md:grid-cols-[1fr_1.2fr]">
          <div className="space-y-1.5">
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5">
              <p className="text-xs font-black text-zinc-700">หลัก (inblackm)</p>
              <p className="text-[10px] font-semibold text-zinc-400">
                จาก .env ของ service — แก้ไข/ลบไม่ได้
              </p>
            </div>
            {connections.map((conn) => (
              <div
                key={conn.id}
                className={`group flex items-center gap-2 rounded-xl border px-3 py-2.5 transition ${
                  editingId === conn.id
                    ? "border-red-600 bg-red-50"
                    : "border-zinc-200 hover:bg-zinc-50"
                }`}
              >
                <button
                  type="button"
                  onClick={() => startEdit(conn)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate text-xs font-black text-zinc-700">{conn.name}</p>
                  <p className="truncate text-[10px] font-semibold text-zinc-400">
                    {conn.host}:{conn.port}/{conn.database}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => remove(conn)}
                  className="shrink-0 rounded-md p-1 text-zinc-400 opacity-0 transition hover:bg-zinc-200 hover:text-red-600 group-hover:opacity-100"
                  title="ลบฐานข้อมูล"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={startCreate}
              className={`flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed px-3 py-2.5 text-[11px] font-black transition ${
                editingId === null
                  ? "border-red-600 text-red-600"
                  : "border-zinc-300 text-zinc-400 hover:border-zinc-400 hover:text-zinc-600"
              }`}
            >
              <Plus size={12} /> เพิ่มฐานข้อมูลใหม่
            </button>
          </div>

          <div className="space-y-2.5">
            <p className="text-[10px] font-black text-zinc-500">
              {editingId ? "แก้ไขฐานข้อมูล" : "เพิ่มฐานข้อมูลใหม่"}
            </p>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              placeholder="ชื่อเรียก เช่น PG2 (บอท) หรือ ERP"
              className={inputClass}
            />
            <div className="grid grid-cols-[1fr_90px] gap-2">
              <input
                type="text"
                value={form.host}
                onChange={(e) => setField("host", e.target.value)}
                placeholder="host เช่น 127.0.0.1"
                className={inputClass}
              />
              <input
                type="text"
                value={form.port}
                onChange={(e) => setField("port", e.target.value)}
                placeholder="5432"
                className={inputClass}
              />
            </div>
            <input
              type="text"
              value={form.database}
              onChange={(e) => setField("database", e.target.value)}
              placeholder="ชื่อ database"
              className={inputClass}
            />
            <input
              type="text"
              value={form.username}
              onChange={(e) => setField("username", e.target.value)}
              placeholder="username"
              className={inputClass}
            />
            <input
              type="password"
              value={form.password}
              onChange={(e) => setField("password", e.target.value)}
              placeholder={
                editingId ? "รหัสผ่าน (เว้นว่าง = ใช้ตัวเดิม)" : "รหัสผ่าน"
              }
              autoComplete="new-password"
              className={inputClass}
            />
            <label className="flex items-center gap-2 text-[11px] font-bold text-zinc-600">
              <input
                type="checkbox"
                checked={form.ssl}
                onChange={(e) => setField("ssl", e.target.checked)}
              />
              ใช้ SSL
            </label>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-bold text-red-600">
                {error}
              </div>
            )}
            {testResult && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-700">
                {testResult}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={testConnection}
                disabled={testing || !form.host.trim() || !form.database.trim() || !form.username.trim()}
                className="flex items-center gap-1.5 rounded-xl border border-zinc-200 px-4 py-2.5 text-xs font-black text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-50"
              >
                {testing ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Play size={13} />
                )}
                ทดสอบเชื่อมต่อ
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving || !form.name.trim() || !form.host.trim() || !form.database.trim() || !form.username.trim()}
                className="flex items-center gap-1.5 rounded-xl bg-red-600 px-5 py-2.5 text-xs font-black text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Save size={13} />
                )}
                {editingId ? "บันทึกการแก้ไข" : "เพิ่มฐานข้อมูล"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
