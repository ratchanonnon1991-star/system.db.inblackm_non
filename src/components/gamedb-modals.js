"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Calculator,
  Code2,
  Database,
  Filter,
  Loader2,
  Pencil,
  Play,
  Plus,
  Save,
  Server,
  Table2,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { apiJson } from "@/lib/api-json";
import MissingNotice from "@/components/missing-notice";
import {
  evaluateFormula,
  extractFormulaRefs,
  inferFormulaType,
  parseFormula,
} from "@/lib/gamedb-formula";
import { CELL_TONES, formatCell, TABLE_TONES } from "@/lib/gamedb-layout";
import { extractSqlParams } from "@/lib/gamedb-sql-params";
import { buildVisualLayout, buildVisualSelect } from "@/lib/gamedb-visual-query";

const BUILDER_FILTER_LABELS = {
  eq: "เท่ากับ",
  neq: "ไม่เท่ากับ",
  contains: "มีคำว่า",
  startsWith: "ขึ้นต้นด้วย",
  endsWith: "ลงท้ายด้วย",
  gt: "มากกว่า",
  gte: "มากกว่าหรือเท่ากับ",
  lt: "น้อยกว่า",
  lte: "น้อยกว่าหรือเท่ากับ",
  in: "อยู่ในรายการ (คั่นด้วย ,)",
  isNull: "ไม่มีค่า",
  isNotNull: "มีค่า",
};

const BUILDER_RENDER_LABELS = {
  text: "ข้อความปกติ",
  chip: "ป้ายสี",
  copy: "ปุ่มคัดลอก",
  link: "ลิงก์",
  email: "อีเมล",
};

const BUILDER_TONE_LABELS = {
  "": "สีปกติ",
  red: "แดง",
  orange: "ส้ม",
  amber: "อำพัน",
  yellow: "เหลือง",
  lime: "เขียวมะนาว",
  green: "เขียว",
  teal: "เขียวน้ำทะเล",
  sky: "ฟ้า",
  blue: "น้ำเงิน",
  violet: "ม่วง",
  pink: "ชมพู",
  zinc: "เทา",
};

function builderColumnKind(column) {
  const type = String(column?.type || "").toLowerCase();
  if (/(int|numeric|decimal|real|double|money)/.test(type)) return "number";
  if (/bool/.test(type)) return "boolean";
  if (/(date|time)/.test(type)) return "date";
  return "text";
}

export function QueryEditorModal({ modal, connections, onClose, onSaved }) {
  const isEdit = modal.mode === "edit";
  const [builderMode, setBuilderMode] = useState(isEdit ? "sql" : "visual");
  const [name, setName] = useState(isEdit ? modal.query.name : "");
  const [description, setDescription] = useState(
    isEdit ? modal.query.description : ""
  );
  // The sidebar groups by this; it is kept in the query's layout because the
  // service cannot add a column to gamedb_queries.
  const [folder, setFolder] = useState(isEdit ? modal.query.layout?.folder || "" : "");
  const [sqlText, setSqlText] = useState(isEdit ? modal.query.sqlText : "SELECT ");
  const [connectionId, setConnectionId] = useState(
    isEdit && modal.query.connectionId ? String(modal.query.connectionId) : ""
  );
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [error, setError] = useState("");
  const [schemaData, setSchemaData] = useState(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [selectedTableKey, setSelectedTableKey] = useState("");
  const [selectedColumns, setSelectedColumns] = useState([]);
  const [editableColumns, setEditableColumns] = useState([]);
  const [filters, setFilters] = useState([]);
  const [sortColumn, setSortColumn] = useState("");
  const [sortDirection, setSortDirection] = useState("asc");
  const [rowLimit, setRowLimit] = useState(100);
  const [columnSettings, setColumnSettings] = useState({});
  const [tableTone, setTableTone] = useState("");
  // A test run needs values for whatever :placeholders the SQL currently has,
  // or it can only report that they are missing.
  const [testParams, setTestParams] = useState({});
  const selectedTable = useMemo(
    () => schemaData?.tables?.find((table) => table.key === selectedTableKey) || null,
    [schemaData, selectedTableKey]
  );
  const selectedColumnNames = useMemo(
    () =>
      selectedTable?.columns
        ?.map((column) => column.name)
        .filter((column) => selectedColumns.includes(column)) || [],
    [selectedTable, selectedColumns]
  );
  const visualBuild = useMemo(
    () => {
      if (!selectedTable) return { sql: "", error: "" };
      try {
        return {
          sql: buildVisualSelect({
              schema: selectedTable.schema,
              table: selectedTable.name,
              columns: selectedColumnNames,
              filters: filters.map((filter) => ({
                ...filter,
                kind: builderColumnKind(
                  selectedTable.columns.find((column) => column.name === filter.column)
                ),
              })),
              sort: sortColumn ? { column: sortColumn, direction: sortDirection } : null,
              limit: rowLimit,
            }),
          error: "",
        };
      } catch (err) {
        return { sql: "", error: err.message };
      }
    },
    [selectedTable, selectedColumnNames, filters, sortColumn, sortDirection, rowLimit]
  );
  const visualSql = visualBuild.sql;
  const effectiveSql = builderMode === "visual" ? visualSql : sqlText;
  const testParamNames = useMemo(() => extractSqlParams(effectiveSql), [effectiveSql]);

  const loadSchema = useCallback(async () => {
    if (builderMode !== "visual") return;
    setSchemaLoading(true);
    setError("");
    try {
      const suffix = connectionId ? `?connectionId=${encodeURIComponent(connectionId)}` : "";
      const data = await apiJson(`/api/query-builder/schema${suffix}`, {
        fallbackError: "โหลดรายการตารางและคอลัมน์ไม่สำเร็จ",
      });
      setSchemaData(data);
      setSelectedTableKey(data.tables?.[0]?.key || "");
      setSelectedColumns([]);
      setEditableColumns([]);
      setFilters([]);
      setSortColumn("");
      setColumnSettings({});
    } catch (err) {
      setSchemaData(null);
      setSelectedTableKey("");
      setError(err.message);
    } finally {
      setSchemaLoading(false);
    }
  }, [builderMode, connectionId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- state changes after metadata request resolves
    loadSchema();
  }, [loadSchema]);

  const testRun = useCallback(async (signal) => {
    setTesting(true);
    setError("");
    setTestResult(null);
    try {
      const data = await apiJson("/api/queries/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sqlText: effectiveSql,
          connectionId: connectionId ? Number(connectionId) : null,
          params: testParams,
        }),
        signal,
        fallbackError: "รัน SQL ไม่สำเร็จ",
      });
      setTestResult(data);
    } catch (err) {
      if (err.name !== "AbortError") setError(err.message);
    } finally {
      setTesting(false);
    }
  }, [effectiveSql, connectionId, testParams]);

  useEffect(() => {
    if (builderMode !== "visual" || !effectiveSql) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => testRun(controller.signal), 650);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [builderMode, effectiveSql, testRun]);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const payload = {
        name,
        description,
        sqlText: effectiveSql,
        connectionId: connectionId ? Number(connectionId) : null,
        layout:
          builderMode === "visual"
            ? buildVisualLayout({
                baseLayout: { ...(isEdit ? modal.query.layout || {} : {}), folder: folder.trim() },
                schema: selectedTable?.schema,
                table: selectedTable?.name,
                primaryKey:
                  selectedTable?.primaryKey?.length === 1 ? selectedTable.primaryKey[0] : "",
                editableColumns,
                selectedColumns: selectedColumnNames,
                columnSettings,
                tableTone,
              })
            : {
                ...(isEdit ? modal.query.layout || {} : {}),
                folder: folder.trim(),
              },
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
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-sm bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-black">
            {isEdit ? "แก้ไข Query" : "เพิ่ม Query ใหม่"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm border border-zinc-200 p-1.5 text-zinc-500 transition hover:bg-zinc-50"
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
              className="h-10 w-full rounded-sm border border-zinc-200 bg-zinc-50 px-3 text-xs font-semibold outline-none focus:border-red-600 focus:bg-white"
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
              className="h-10 w-full rounded-sm border border-zinc-200 bg-zinc-50 px-3 text-xs font-semibold outline-none focus:border-red-600 focus:bg-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-black text-zinc-500">
              โฟลเดอร์ (ไม่บังคับ — ใช้จัดกลุ่มในรายการด้านซ้าย)
            </label>
            <input
              type="text"
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              placeholder="เช่น สต็อก, ออเดอร์, การเงิน"
              list="gamedb-folder-suggestions"
              className="h-10 w-full rounded-sm border border-zinc-200 bg-zinc-50 px-3 text-xs font-semibold outline-none focus:border-red-600 focus:bg-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-black text-zinc-500">
              ฐานข้อมูล
            </label>
            <select
              value={connectionId}
              onChange={(e) => setConnectionId(e.target.value)}
              className="h-10 w-full rounded-sm border border-zinc-200 bg-zinc-50 px-3 text-xs font-semibold outline-none focus:border-red-600 focus:bg-white"
            >
              <option value="">หลัก (inblackm)</option>
              {connections.map((conn) => (
                <option key={conn.id} value={conn.id}>
                  {conn.name} — {conn.host}/{conn.database}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2 rounded-sm bg-zinc-100 p-1">
            <button
              type="button"
              onClick={() => { setBuilderMode("visual"); setTestResult(null); }}
              className={`flex items-center justify-center gap-1.5 rounded-sm px-3 py-2 text-[11px] font-black transition ${
                builderMode === "visual" ? "bg-white text-red-600 shadow-sm" : "text-zinc-500"
              }`}
            >
              <Table2 size={13} /> เลือกตารางและคอลัมน์
            </button>
            <button
              type="button"
              onClick={() => { setBuilderMode("sql"); setTestResult(null); }}
              className={`flex items-center justify-center gap-1.5 rounded-sm px-3 py-2 text-[11px] font-black transition ${
                builderMode === "sql" ? "bg-white text-red-600 shadow-sm" : "text-zinc-500"
              }`}
            >
              <Code2 size={13} /> เขียน SQL เอง (ขั้นสูง)
            </button>
          </div>

          {builderMode === "visual" ? (
            <div className="space-y-3 rounded-sm border border-zinc-200 p-3">
              <div className="flex items-start gap-2 rounded-sm border border-blue-200 bg-blue-50 px-3 py-2 text-[10px] font-bold text-blue-700">
                <Database size={14} className="mt-0.5 shrink-0" />
                เลือกตารางและติ๊กคอลัมน์ที่ต้องการ ระบบจะสร้าง SELECT ให้อัตโนมัติ โดยไม่ต้องเขียน SQL
              </div>
              {schemaLoading ? (
                <p className="flex items-center gap-2 py-6 text-xs font-bold text-zinc-400">
                  <Loader2 size={14} className="animate-spin" /> กำลังโหลดโครงสร้างฐานข้อมูล...
                </p>
              ) : schemaData?.tables?.length ? (
                <>
                  <div>
                    <label className="mb-1 block text-[10px] font-black text-zinc-500">ตาราง</label>
                    <select
                      value={selectedTableKey}
                      onChange={(e) => {
                        setSelectedTableKey(e.target.value);
                        setSelectedColumns([]);
                        setEditableColumns([]);
                        setFilters([]);
                        setSortColumn("");
                        setColumnSettings({});
                        setTestResult(null);
                      }}
                      className="h-10 w-full rounded-sm border border-zinc-200 bg-zinc-50 px-3 text-xs font-semibold outline-none focus:border-red-600 focus:bg-white"
                    >
                      {schemaData.tables.map((table) => (
                        <option key={table.key} value={table.key}>{table.key}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[10px] font-black text-zinc-500">คอลัมน์ที่จะแสดง</p>
                      <button
                        type="button"
                        onClick={() => setSelectedColumns(selectedTable.columns.filter((column) => column.canSelect).map((column) => column.name))}
                        className="text-[10px] font-black text-red-600 hover:text-red-700"
                      >
                        เลือกทั้งหมด
                      </button>
                    </div>
                    <div className="max-h-72 overflow-y-auto rounded-sm border border-zinc-200">
                      {selectedTable.columns.map((column) => {
                        const selected = selectedColumns.includes(column.name);
                        const isPrimaryKey = selectedTable.primaryKey.includes(column.name);
                        const keyRequired = isPrimaryKey && editableColumns.length > 0;
                        return (
                          <div key={column.name} className="grid gap-2 border-b border-zinc-100 px-3 py-2 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                            <label className="flex min-w-0 items-center gap-2">
                              <input
                                type="checkbox"
                                checked={selected}
                                disabled={!column.canSelect || keyRequired}
                                onChange={(e) => {
                                  setSelectedColumns((prev) => e.target.checked ? [...prev, column.name] : prev.filter((name) => name !== column.name));
                                  if (!e.target.checked) setEditableColumns((prev) => prev.filter((name) => name !== column.name));
                                  setTestResult(null);
                                }}
                                className="accent-red-600"
                              />
                              <span className="truncate font-mono text-[11px] font-black text-zinc-700">{column.name}</span>
                              <span className="truncate text-[9px] font-semibold text-zinc-400">{column.type}</span>
                              {isPrimaryKey && <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[8px] font-black text-violet-600">PK</span>}
                            </label>
                            <div className="sm:text-right">
                              <label className={`inline-flex items-center gap-1.5 text-[10px] font-black ${column.editable ? "text-emerald-600" : "text-zinc-400"}`}>
                                <input
                                  type="checkbox"
                                  checked={editableColumns.includes(column.name)}
                                  disabled={!selected || !column.editable}
                                  onChange={(e) => {
                                    setEditableColumns((prev) => e.target.checked ? [...prev, column.name] : prev.filter((name) => name !== column.name));
                                    if (e.target.checked && selectedTable.primaryKey.length === 1) {
                                      const pk = selectedTable.primaryKey[0];
                                      setSelectedColumns((prev) => prev.includes(pk) ? prev : [pk, ...prev]);
                                    }
                                  }}
                                  className="accent-emerald-600"
                                />
                                <Pencil size={10} /> {column.editable ? "ให้แก้ไขค่าได้" : "อ่านอย่างเดียว"}
                              </label>
                              {!column.editable && (
                                <p className="mt-0.5 text-[8px] font-semibold text-zinc-400">{column.editReason}</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {!schemaData.allowWrite && (
                      <p className="mt-1.5 text-[10px] font-bold text-amber-600">
                        ฐานข้อมูลนี้ตั้งเป็นอ่านอย่างเดียว จึงเลือกแสดงคอลัมน์ได้ แต่เปิดแก้ไขค่าไม่ได้
                      </p>
                    )}
                  </div>

                  <div className="rounded-sm border border-zinc-200 bg-zinc-50 p-2.5">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="flex items-center gap-1.5 text-[10px] font-black text-zinc-600">
                          <Filter size={11} /> ตัวกรองข้อมูล
                        </p>
                        <p className="text-[9px] font-semibold text-zinc-400">ทุกเงื่อนไขต้องตรงกัน (AND)</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const first = selectedColumnNames[0] || selectedTable.columns[0]?.name || "";
                          setFilters((prev) => [...prev, { id: crypto.randomUUID(), column: first, op: "eq", value: "" }]);
                          setTestResult(null);
                        }}
                        className="flex items-center gap-1 rounded-sm border border-zinc-200 bg-white px-2 py-1 text-[9px] font-black text-red-600 hover:bg-red-50"
                      >
                        <Plus size={10} /> เพิ่มเงื่อนไข
                      </button>
                    </div>
                    {filters.length === 0 ? (
                      <p className="rounded-sm border border-dashed border-zinc-200 px-2 py-3 text-center text-[9px] font-semibold text-zinc-400">ไม่กรอง — แสดงข้อมูลทุกแถวตามจำนวนที่กำหนด</p>
                    ) : (
                      <div className="space-y-1.5">
                        {filters.map((filter) => {
                          const valueless = filter.op === "isNull" || filter.op === "isNotNull";
                          const filterKind = builderColumnKind(
                            selectedTable.columns.find((column) => column.name === filter.column)
                          );
                          return (
                            <div key={filter.id} className="grid gap-1.5 sm:grid-cols-[minmax(8rem,1fr)_minmax(9rem,1fr)_minmax(8rem,1fr)_auto]">
                              <select
                                value={filter.column}
                                onChange={(e) => {
                                  setFilters((prev) => prev.map((item) => item.id === filter.id ? { ...item, column: e.target.value } : item));
                                  setTestResult(null);
                                }}
                                className="h-8 rounded-sm border border-zinc-200 bg-white px-2 text-[10px] font-bold outline-none focus:border-red-600"
                              >
                                {selectedTable.columns.filter((column) => column.canSelect).map((column) => (
                                  <option key={column.name} value={column.name}>{column.name}</option>
                                ))}
                              </select>
                              <select
                                value={filter.op}
                                onChange={(e) => {
                                  setFilters((prev) => prev.map((item) => item.id === filter.id ? { ...item, op: e.target.value } : item));
                                  setTestResult(null);
                                }}
                                className="h-8 rounded-sm border border-zinc-200 bg-white px-2 text-[10px] font-bold outline-none focus:border-red-600"
                              >
                                {Object.entries(BUILDER_FILTER_LABELS).map(([value, label]) => (
                                  <option key={value} value={value}>{label}</option>
                                ))}
                              </select>
                              {valueless ? (
                                <div className="flex h-8 items-center rounded-sm border border-dashed border-zinc-200 px-2 text-[9px] font-semibold text-zinc-400">ไม่ต้องใส่ค่า</div>
                              ) : filterKind === "boolean" && filter.op !== "in" ? (
                                <select
                                  value={filter.value}
                                  onChange={(e) => {
                                    setFilters((prev) => prev.map((item) => item.id === filter.id ? { ...item, value: e.target.value } : item));
                                    setTestResult(null);
                                  }}
                                  className="h-8 rounded-sm border border-zinc-200 bg-white px-2 text-[10px] font-bold outline-none focus:border-red-600"
                                >
                                  <option value="">เลือกค่า</option>
                                  <option value="true">จริง / ใช่</option>
                                  <option value="false">เท็จ / ไม่ใช่</option>
                                </select>
                              ) : (
                                <input
                                  type={filter.op === "in" ? "text" : filterKind === "number" ? "number" : filterKind === "date" ? "date" : "text"}
                                  value={filter.value}
                                  onChange={(e) => {
                                    setFilters((prev) => prev.map((item) => item.id === filter.id ? { ...item, value: e.target.value } : item));
                                    setTestResult(null);
                                  }}
                                  placeholder={filter.op === "in" ? "เช่น A, B, C" : "ค่าที่ต้องการ"}
                                  className="h-8 rounded-sm border border-zinc-200 bg-white px-2 text-[10px] font-semibold outline-none focus:border-red-600"
                                />
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setFilters((prev) => prev.filter((item) => item.id !== filter.id));
                                  setTestResult(null);
                                }}
                                className="flex h-8 w-8 items-center justify-center rounded-sm border border-zinc-200 bg-white text-zinc-400 hover:border-red-200 hover:text-red-600"
                                aria-label="ลบเงื่อนไข"
                              >
                                <Trash2 size={11} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="grid gap-2 sm:grid-cols-3">
                    <label className="block">
                      <span className="mb-1 block text-[9px] font-black text-zinc-500">เรียงตาม</span>
                      <select
                        value={sortColumn}
                        onChange={(e) => { setSortColumn(e.target.value); setTestResult(null); }}
                        className="h-9 w-full rounded-sm border border-zinc-200 bg-zinc-50 px-2 text-[10px] font-bold outline-none focus:border-red-600"
                      >
                        <option value="">ไม่เรียง</option>
                        {selectedTable.columns.filter((column) => column.canSelect).map((column) => (
                          <option key={column.name} value={column.name}>{column.name}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[9px] font-black text-zinc-500">ลำดับ</span>
                      <select
                        value={sortDirection}
                        disabled={!sortColumn}
                        onChange={(e) => { setSortDirection(e.target.value); setTestResult(null); }}
                        className="h-9 w-full rounded-sm border border-zinc-200 bg-zinc-50 px-2 text-[10px] font-bold outline-none focus:border-red-600 disabled:opacity-50"
                      >
                        <option value="asc">น้อย → มาก / เก่า → ใหม่</option>
                        <option value="desc">มาก → น้อย / ใหม่ → เก่า</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[9px] font-black text-zinc-500">จำนวนแถวสูงสุด</span>
                      <select
                        value={rowLimit}
                        onChange={(e) => { setRowLimit(Number(e.target.value)); setTestResult(null); }}
                        className="h-9 w-full rounded-sm border border-zinc-200 bg-zinc-50 px-2 text-[10px] font-bold outline-none focus:border-red-600"
                      >
                        {[25, 50, 100, 250, 500, 1000].map((value) => <option key={value} value={value}>{value.toLocaleString("th-TH")} แถว</option>)}
                      </select>
                    </label>
                  </div>

                  {selectedColumnNames.length > 0 && (
                    <div className="rounded-sm border border-zinc-200 p-2.5">
                      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
                        <div>
                          <p className="text-[10px] font-black text-zinc-600">ชื่อ รูปแบบ และสีคอลัมน์</p>
                          <p className="text-[9px] font-semibold text-zinc-400">ตั้งค่าตรงนี้แล้วใช้งานได้ทันทีหลังสร้าง Query</p>
                        </div>
                        <label className="block min-w-40">
                          <span className="mb-0.5 block text-[8px] font-black text-zinc-400">สีทั้งตาราง</span>
                          <select
                            value={tableTone}
                            onChange={(e) => setTableTone(e.target.value)}
                            className="h-8 w-full rounded-sm border border-zinc-200 bg-zinc-50 px-2 text-[9px] font-bold outline-none focus:border-red-600"
                          >
                            <option value="">สีปกติ</option>
                            {TABLE_TONES.map((tone) => <option key={tone} value={tone}>{BUILDER_TONE_LABELS[tone] || tone}</option>)}
                          </select>
                        </label>
                      </div>
                      <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                        {selectedColumnNames.map((column) => {
                          const setting = columnSettings[column] || {};
                          return (
                            <div key={column} className="rounded-sm border border-zinc-100 bg-zinc-50 p-2">
                              <p className="mb-1.5 truncate font-mono text-[9px] font-black text-zinc-500">{column}</p>
                              <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
                                <input
                                  type="text"
                                  value={setting.label || ""}
                                  onChange={(e) => setColumnSettings((prev) => ({ ...prev, [column]: { ...prev[column], label: e.target.value } }))}
                                  placeholder={`ชื่อหัว: ${column}`}
                                  className="h-8 rounded-sm border border-zinc-200 bg-white px-2 text-[9px] font-semibold outline-none focus:border-red-600"
                                />
                                <select
                                  value={setting.render || "text"}
                                  onChange={(e) => setColumnSettings((prev) => ({ ...prev, [column]: { ...prev[column], render: e.target.value } }))}
                                  className="h-8 rounded-sm border border-zinc-200 bg-white px-2 text-[9px] font-bold outline-none focus:border-red-600"
                                >
                                  {Object.entries(BUILDER_RENDER_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                                </select>
                                <select
                                  value={setting.bg || ""}
                                  onChange={(e) => setColumnSettings((prev) => ({ ...prev, [column]: { ...prev[column], bg: e.target.value } }))}
                                  className="h-8 rounded-sm border border-zinc-200 bg-white px-2 text-[9px] font-bold outline-none focus:border-red-600"
                                >
                                  <option value="">สีพื้นเซลล์</option>
                                  {TABLE_TONES.map((tone) => <option key={tone} value={tone}>{BUILDER_TONE_LABELS[tone] || tone}</option>)}
                                </select>
                                <select
                                  value={setting.headerBg || ""}
                                  onChange={(e) => setColumnSettings((prev) => ({ ...prev, [column]: { ...prev[column], headerBg: e.target.value } }))}
                                  className="h-8 rounded-sm border border-zinc-200 bg-white px-2 text-[9px] font-bold outline-none focus:border-red-600"
                                >
                                  <option value="">สีหัวคอลัมน์</option>
                                  {TABLE_TONES.map((tone) => <option key={tone} value={tone}>{BUILDER_TONE_LABELS[tone] || tone}</option>)}
                                </select>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {visualSql && (
                    <div>
                      <p className="mb-1 text-[10px] font-black text-zinc-500">SQL ที่ระบบสร้างให้</p>
                      <pre className="overflow-x-auto rounded-sm bg-zinc-900 px-3 py-2 font-mono text-[10px] leading-relaxed text-emerald-300">{visualSql}</pre>
                    </div>
                  )}
                </>
              ) : (
                <div className="py-6 text-center text-xs font-bold text-zinc-400">
                  ไม่พบตารางที่บัญชีฐานข้อมูลนี้มีสิทธิ์อ่าน
                </div>
              )}
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-[10px] font-black text-zinc-500">
                SQL (SELECT เท่านั้น — ระบบรันแบบอ่านอย่างเดียว จำกัด 1,000 แถว)
              </label>
              <textarea
                value={sqlText}
                onChange={(e) => setSqlText(e.target.value)}
                rows={10}
                spellCheck={false}
                className="w-full rounded-sm border border-zinc-200 bg-zinc-900 px-3 py-2.5 font-mono text-[11px] leading-relaxed text-emerald-300 outline-none focus:border-red-600"
              />
            </div>
          )}

          {error && (
            <div className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-bold text-red-600">
              {error}
            </div>
          )}
          {builderMode === "visual" && visualBuild.error && (
            <div className="rounded-sm border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-700">
              {visualBuild.error}
            </div>
          )}
          {testParamNames.length > 0 && (
            <div className="rounded-sm border border-zinc-200 bg-zinc-50 p-2.5">
              <p className="mb-1.5 text-[10px] font-black text-zinc-500">
                ค่าพารามิเตอร์สำหรับทดสอบ (ไม่ถูกบันทึกไปกับ Query)
              </p>
              <div className="flex flex-wrap gap-2">
                {testParamNames.map((paramName) => (
                  <label key={paramName} className="flex items-center gap-1.5">
                    <span className="font-mono text-[10px] font-black text-red-600">
                      :{paramName}
                    </span>
                    <input
                      type="text"
                      value={testParams[paramName] ?? ""}
                      onChange={(e) =>
                        setTestParams((prev) => ({
                          ...prev,
                          [paramName]: e.target.value,
                        }))
                      }
                      className="h-7 w-36 rounded-sm border border-zinc-200 bg-white px-2 text-[11px] font-semibold outline-none focus:border-red-600"
                    />
                  </label>
                ))}
              </div>
            </div>
          )}
          {testResult && (
            <div className="overflow-hidden rounded-sm border border-emerald-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-1 bg-emerald-50 px-3 py-2 text-[10px] font-bold text-emerald-700">
                <span>ตัวอย่างสำเร็จ: {testResult.rowCount.toLocaleString("th-TH")} แถว · {testResult.columns.length} คอลัมน์</span>
                <span>{testResult.durationMs} ms · แสดงตัวอย่างไม่เกิน 10 แถว</span>
              </div>
              <div className="max-h-64 overflow-auto">
                <table className="w-full border-collapse text-[10px]">
                  <thead className="sticky top-0 z-10">
                    <tr>
                      {testResult.columns.map((column) => {
                        const setting = columnSettings[column.name] || {};
                        const tone = CELL_TONES[setting.headerBg || tableTone];
                        return (
                          <th
                            key={column.key}
                            className="whitespace-nowrap border-b border-r border-zinc-200 px-2 py-1.5 text-left font-black last:border-r-0"
                            style={{ backgroundColor: tone?.head || "#f4f4f5", color: tone?.headFg || tone?.fg || "#3f3f46" }}
                          >
                            {setting.label?.trim() || column.name}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {testResult.rows.slice(0, 10).map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {testResult.columns.map((column, columnIndex) => {
                          const setting = columnSettings[column.name] || {};
                          const tone = CELL_TONES[setting.bg || tableTone];
                          return (
                            <td
                              key={column.key}
                              className="max-w-64 truncate border-b border-r border-zinc-100 px-2 py-1.5 font-semibold last:border-r-0"
                              style={{ backgroundColor: tone?.bg || "#ffffff", color: tone?.fg || "#52525b" }}
                              title={formatCell(row[columnIndex], column.type)}
                            >
                              {formatCell(row[columnIndex], column.type)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    {testResult.rows.length === 0 && (
                      <tr><td colSpan={testResult.columns.length || 1} className="px-3 py-6 text-center font-semibold text-zinc-400">ไม่พบข้อมูลตามเงื่อนไข</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <MissingNotice
          items={[!name.trim() && "ชื่อ Query", !effectiveSql.trim() && (builderMode === "visual" ? (visualBuild.error || "คอลัมน์อย่างน้อย 1 คอลัมน์") : "คำสั่ง SQL")].filter(Boolean)}
        />

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => testRun()}
            disabled={testing || !effectiveSql.trim()}
            className="flex items-center gap-1.5 rounded-sm border border-zinc-200 px-4 py-2.5 text-xs font-black text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-50"
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
            disabled={saving || !name.trim() || !effectiveSql.trim()}
            className="flex items-center gap-1.5 rounded-sm bg-red-600 px-5 py-2.5 text-xs font-black text-white transition hover:bg-red-700 disabled:opacity-50"
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

const COMPUTED_TYPE_LABELS = {
  number: "ตัวเลข",
  text: "ข้อความ",
  date: "วันที่",
  boolean: "ใช่ / ไม่ใช่",
  tutorial: "Tutorial (ใช้รหัสเกม)",
  image: "วางรูป (ใช้รหัสเกม)",
};

// Grouped the way someone reaches for them, not alphabetically.
const FUNCTION_HELP = [
  ["เงื่อนไข", "IF(เงื่อนไข, ค่าเมื่อจริง, ค่าเมื่อเท็จ) · AND · OR · NOT · ISBLANK · COALESCE"],
  ["วันที่", "TODAY() · DAYSUNTIL(วันที่) เหลืออีกกี่วัน · DAYS(ปลายทาง, ต้นทาง) · ADDDAYS · YEAR · MONTH · DAY"],
  ["ข้อความ", "CONCAT · LEFT · RIGHT · MID · LEN · UPPER · LOWER · TRIM · TEXT · CONTAINS · ต่อข้อความด้วย &"],
  ["ตัวเลข", "ROUND · ABS · MIN · MAX · SUM"],
];

export function ComputedColumnModal({
  availableNames,
  sampleRow,
  onClose,
  onAdd,
}) {
  const [label, setLabel] = useState("");
  const [formula, setFormula] = useState("");
  // Empty until touched, so the type follows the formula while the user is
  // still writing it and stops the moment they choose one themselves.
  const [typeChoice, setTypeChoice] = useState("");

  const validation = useMemo(() => {
    if (!formula.trim()) return { ok: false, message: "", type: "number" };
    try {
      const ast = parseFormula(formula);
      const refs = [...extractFormulaRefs(ast)];
      const unknown = refs.filter((name) => !availableNames.includes(name));
      if (unknown.length > 0) {
        return { ok: false, message: `ไม่รู้จักคอลัมน์: ${unknown.join(", ")}`, type: "number" };
      }
      const type = inferFormulaType(ast);
      let preview = "";
      if (sampleRow) {
        const value = evaluateFormula(ast, (name) => sampleRow[name]);
        preview = ` · แถวแรกได้ ${formatCell(value, typeChoice || type)}`;
      }
      return { ok: true, message: `สูตรถูกต้อง${preview}`, type };
    } catch (err) {
      return { ok: false, message: err.message, type: "number" };
    }
  }, [formula, availableNames, sampleRow, typeChoice]);

  const type = typeChoice || validation.type;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-4 backdrop-blur-sm">
      {/* The help text and the column chips make this the tallest of the
          settings forms, so it scrolls inside the frame rather than running off
          the bottom of a short window. */}
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-y-auto rounded-sm bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-black">
            <Calculator size={15} className="text-red-600" /> เพิ่มคอลัมน์/สูตร
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm border border-zinc-200 p-1.5 text-zinc-500 transition hover:bg-zinc-50"
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
              className="h-10 w-full rounded-sm border border-zinc-200 bg-zinc-50 px-3 text-xs font-semibold outline-none focus:border-red-600 focus:bg-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-black text-zinc-500">
              สูตร — ใช้ + - * / ( ) &amp; เทียบด้วย = &lt;&gt; &lt; &gt; ใส่ข้อความในเครื่องหมายคำพูด
              และอ้างคอลัมน์ด้วย [ชื่อคอลัมน์]
            </label>
            <input
              type="text"
              value={formula}
              onChange={(e) => setFormula(e.target.value)}
              placeholder={'เช่น IF(DAYSUNTIL([วันหมดอายุ SMS]) < 3, "ใกล้หมดอายุ", "ปกติ")'}
              className="h-10 w-full rounded-sm border border-zinc-200 bg-zinc-50 px-3 font-mono text-xs font-semibold outline-none focus:border-red-600 focus:bg-white"
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
            <label
              htmlFor="computed-type"
              className="mb-1 block text-[10px] font-black text-zinc-500"
            >
              ผลลัพธ์เป็น {typeChoice ? "(เลือกเอง)" : "(เดาจากสูตร)"}
            </label>
            <select
              id="computed-type"
              value={type}
              onChange={(e) => setTypeChoice(e.target.value)}
              className="h-10 w-full rounded-sm border border-zinc-200 bg-zinc-50 px-3 text-xs font-semibold outline-none focus:border-red-600 focus:bg-white"
            >
              {Object.entries(COMPUTED_TYPE_LABELS).map(([value, text]) => (
                <option key={value} value={value}>
                  {text}
                </option>
              ))}
            </select>
          </div>
          <div className="rounded-sm border border-zinc-200 bg-zinc-50 p-2.5">
            <p className="mb-1 text-[10px] font-black text-zinc-500">ฟังก์ชันที่ใช้ได้</p>
            <dl className="space-y-0.5">
              {FUNCTION_HELP.map(([group, list]) => (
                <div key={group} className="flex gap-2 text-[10px] leading-relaxed">
                  <dt className="w-12 shrink-0 font-black text-zinc-500">{group}</dt>
                  <dd className="min-w-0 font-mono font-semibold text-zinc-600">{list}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div>
            <p className="mb-1 text-[10px] font-black text-zinc-500">คอลัมน์ที่ใช้ได้ (กดเพื่อแทรก):</p>
            <div className="flex flex-wrap gap-1">
              {availableNames.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setFormula((prev) => `${prev}[${name}]`)}
                  className="rounded-sm border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[10px] font-bold text-zinc-600 transition hover:bg-zinc-100"
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        </div>

        <MissingNotice
          items={[
            !label.trim() && "ชื่อคอลัมน์",
            !formula.trim() && "สูตร",
            formula.trim() && !validation.ok && "สูตรที่ถูกต้อง (ดูข้อความใต้ช่องสูตร)",
          ].filter(Boolean)}
        />

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={() => onAdd({ label: label.trim(), formula: formula.trim(), type })}
            disabled={!label.trim() || !validation.ok}
            className="flex items-center gap-1.5 rounded-sm bg-red-600 px-5 py-2.5 text-xs font-black text-white transition hover:bg-red-700 disabled:opacity-50"
          >
            <Plus size={13} /> เพิ่มคอลัมน์
          </button>
        </div>
      </div>
    </div>
  );
}

const EMPTY_USER_FORM = {
  username: "",
  displayName: "",
  password: "",
  role: "staff",
  defaultViewId: "",
};

function roleLabel(role) {
  if (role === "admin") return "Admin";
  if (role === "user") return "User";
  return "Staff";
}

export function UsersModal({ me, onClose }) {
  const [users, setUsers] = useState([]);
  const [views, setViews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_USER_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiJson("/api/users", {
        fallbackError: "โหลดรายชื่อผู้ใช้ไม่สำเร็จ",
      });
      setUsers(data.users || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setState runs after the fetch resolves
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    apiJson("/api/views", { fallbackError: "โหลด Template ไม่สำเร็จ" })
      .then((data) => setViews(data.views || []))
      .catch(() => setViews([]));
  }, []);

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const startCreate = () => {
    setEditingId(null);
    setForm(EMPTY_USER_FORM);
    setError("");
  };

  const startEdit = (user) => {
    setEditingId(user.id);
    setForm({
      username: user.username,
      displayName: user.displayName,
      password: "",
      role: user.role,
      defaultViewId: user.defaultViewId ? String(user.defaultViewId) : "",
    });
    setError("");
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      if (editingId) {
        await apiJson(`/api/users/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            displayName: form.displayName,
            role: form.role,
            defaultViewId: form.role === "user" ? form.defaultViewId || null : null,
            password: form.password || undefined,
          }),
          fallbackError: "บันทึกผู้ใช้ไม่สำเร็จ",
        });
      } else {
        await apiJson("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
          fallbackError: "เพิ่มผู้ใช้ไม่สำเร็จ",
        });
      }
      await loadUsers();
      startCreate();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (user) => {
    if (!window.confirm(`ลบผู้ใช้ "${user.username}" ?`)) return;
    setError("");
    try {
      await apiJson(`/api/users/${user.id}`, {
        method: "DELETE",
        fallbackError: "ลบผู้ใช้ไม่สำเร็จ",
      });
      await loadUsers();
      if (editingId === user.id) startCreate();
    } catch (err) {
      setError(err.message);
    }
  };

  const inputClass =
    "h-10 w-full rounded-sm border border-zinc-200 bg-zinc-50 px-3 text-xs font-semibold outline-none focus:border-red-600 focus:bg-white";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-sm bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-black">
            <Users size={15} className="text-red-600" /> จัดการผู้ใช้
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm border border-zinc-200 p-1.5 text-zinc-500 transition hover:bg-zinc-50"
            aria-label="ปิด"
          >
            <X size={14} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto md:grid-cols-[1fr_1.2fr]">
          <div className="space-y-1.5">
            {loading ? (
              <p className="flex items-center gap-2 px-2 py-4 text-xs font-semibold text-zinc-400">
                <Loader2 size={14} className="animate-spin" /> กำลังโหลด...
              </p>
            ) : (
              users.map((user) => (
                <div
                  key={user.id}
                  className={`group flex items-center gap-2 rounded-sm border px-3 py-2.5 transition ${
                    editingId === user.id
                      ? "border-red-600 bg-red-50"
                      : "border-zinc-200 hover:bg-zinc-50"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => startEdit(user)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate text-xs font-black text-zinc-700">
                      {user.username}
                      {user.id === me.id ? (
                        <span className="ml-1.5 rounded bg-zinc-100 px-1.5 py-0.5 text-[9px] font-black text-zinc-500">
                          คุณ
                        </span>
                      ) : null}
                    </p>
                    <p className="truncate text-[10px] font-semibold text-zinc-400">
                      {user.displayName} · {roleLabel(user.role)}
                    </p>
                  </button>
                  {user.id !== me.id && (
                    <button
                      type="button"
                      onClick={() => remove(user)}
                      className="shrink-0 rounded-sm p-1 text-zinc-400 opacity-0 transition hover:bg-zinc-200 hover:text-red-600 group-hover:opacity-100"
                      title="ลบผู้ใช้"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              ))
            )}
            <button
              type="button"
              onClick={startCreate}
              className={`flex w-full items-center justify-center gap-1.5 rounded-sm border border-dashed px-3 py-2.5 text-[11px] font-black transition ${
                editingId === null
                  ? "border-red-600 text-red-600"
                  : "border-zinc-300 text-zinc-400 hover:border-zinc-400 hover:text-zinc-600"
              }`}
            >
              <Plus size={12} /> เพิ่มผู้ใช้ใหม่
            </button>
          </div>

          <div className="space-y-2.5">
            <p className="text-[10px] font-black text-zinc-500">
              {editingId ? `แก้ไขผู้ใช้: ${form.username}` : "เพิ่มผู้ใช้ใหม่"}
            </p>
            {!editingId && (
              <input
                type="text"
                value={form.username}
                onChange={(e) => setField("username", e.target.value)}
                placeholder="username (a-z, 0-9, _ . - ยาว 3-32 ตัว)"
                autoComplete="off"
                className={inputClass}
              />
            )}
            <input
              type="text"
              value={form.displayName}
              onChange={(e) => setField("displayName", e.target.value)}
              placeholder="ชื่อที่แสดง (ไม่บังคับ)"
              className={inputClass}
            />
            <input
              type="password"
              value={form.password}
              onChange={(e) => setField("password", e.target.value)}
              placeholder={
                editingId
                  ? "รหัสผ่านใหม่ (เว้นว่าง = ไม่เปลี่ยน)"
                  : "รหัสผ่าน (อย่างน้อย 6 ตัวอักษร)"
              }
              autoComplete="new-password"
              className={inputClass}
            />
            <select
              value={form.role}
              onChange={(e) => setField("role", e.target.value)}
              className={inputClass}
            >
              <option value="user">User — ดู/รัน query, ใช้ layout จาก template เท่านั้น</option>
              <option value="staff">Staff — ดู/รัน query, จัด layout</option>
              <option value="admin">Admin — จัดการทุกอย่างรวมถึง SQL และผู้ใช้</option>
            </select>
            {form.role === "user" && (
              <div>
                <label className="mb-1 block text-[10px] font-black text-zinc-500">
                  Template หลักเมื่อเข้าสู่ระบบ
                </label>
                <select
                  value={form.defaultViewId}
                  onChange={(e) => setField("defaultViewId", e.target.value)}
                  className={inputClass}
                >
                  <option value="">ใช้ Template เริ่มต้นของระบบ</option>
                  {views.map((view) => (
                    <option key={view.id} value={view.id}>
                      {view.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[9px] font-semibold text-zinc-400">
                  User จะเปิดหน้านี้อัตโนมัติและไม่สามารถย้ายหรือย่อขยายกล่องได้
                </p>
              </div>
            )}

            {error && (
              <div className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-bold text-red-600">
                {error}
              </div>
            )}

            <MissingNotice
              items={
                editingId
                  ? []
                  : [
                      !form.username.trim() && "ชื่อผู้ใช้",
                      form.password.length < 6 && "รหัสผ่านอย่างน้อย 6 ตัว",
                    ].filter(Boolean)
              }
            />

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={save}
                disabled={
                  saving ||
                  (!editingId && (!form.username.trim() || form.password.length < 6))
                }
                className="flex items-center gap-1.5 rounded-sm bg-red-600 px-5 py-2.5 text-xs font-black text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Save size={13} />
                )}
                {editingId ? "บันทึกการแก้ไข" : "เพิ่มผู้ใช้"}
              </button>
            </div>
          </div>
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

export function ConnectionsModal({ connections, onClose, onChanged }) {
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_CONNECTION_FORM);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState("");
  const [error, setError] = useState("");
  // Write permission and per-connection limits live in a side table, not on
  // the connection row (which this service does not own), so they load and
  // save separately. Key 0 is the primary connection from .env.
  const [flags, setFlags] = useState({});
  const [flagsTarget, setFlagsTarget] = useState(0);

  const loadFlags = useCallback(async () => {
    try {
      const data = await apiJson("/api/connection-flags", {
        fallbackError: "โหลดการตั้งค่าฐานข้อมูลไม่สำเร็จ",
      });
      setFlags(data.flags || {});
    } catch {
      setFlags({});
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setState runs after the fetch resolves
    loadFlags();
  }, [loadFlags]);

  const currentFlags = flags[flagsTarget] || {
    allowWrite: false,
    statementTimeoutMs: null,
    maxRows: null,
  };

  const saveFlags = async (patch) => {
    const next = { ...currentFlags, ...patch };
    setError("");
    try {
      const data = await apiJson("/api/connection-flags", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId: flagsTarget,
          allowWrite: next.allowWrite,
          statementTimeoutMs: next.statementTimeoutMs,
          maxRows: next.maxRows,
        }),
        fallbackError: "บันทึกการตั้งค่าฐานข้อมูลไม่สำเร็จ",
      });
      setFlags((prev) => ({ ...prev, [flagsTarget]: data.flags }));
    } catch (err) {
      setError(err.message);
    }
  };

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
    "h-10 w-full rounded-sm border border-zinc-200 bg-zinc-50 px-3 text-xs font-semibold outline-none focus:border-red-600 focus:bg-white";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-sm bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-black">
            <Server size={15} className="text-red-600" /> จัดการฐานข้อมูล (PostgreSQL)
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm border border-zinc-200 p-1.5 text-zinc-500 transition hover:bg-zinc-50"
            aria-label="ปิด"
          >
            <X size={14} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto md:grid-cols-[1fr_1.2fr]">
          <div className="space-y-1.5">
            <button
              type="button"
              onClick={() => setFlagsTarget(0)}
              className={`w-full rounded-sm border px-3 py-2.5 text-left transition ${
                flagsTarget === 0 ? "border-red-600 bg-red-50" : "border-zinc-200 bg-zinc-50"
              }`}
            >
              <p className="text-xs font-black text-zinc-700">
                หลัก (inblackm)
                {flags[0]?.allowWrite && (
                  <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-black text-amber-700">
                    เขียนได้
                  </span>
                )}
              </p>
              <p className="text-[10px] font-semibold text-zinc-400">
                จาก .env ของ service — แก้ไข/ลบไม่ได้
              </p>
            </button>
            {connections.map((conn) => (
              <div
                key={conn.id}
                className={`group flex items-center gap-2 rounded-sm border px-3 py-2.5 transition ${
                  editingId === conn.id
                    ? "border-red-600 bg-red-50"
                    : "border-zinc-200 hover:bg-zinc-50"
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    startEdit(conn);
                    setFlagsTarget(conn.id);
                  }}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate text-xs font-black text-zinc-700">
                    {conn.name}
                    {flags[conn.id]?.allowWrite && (
                      <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-black text-amber-700">
                        เขียนได้
                      </span>
                    )}
                  </p>
                  <p className="truncate text-[10px] font-semibold text-zinc-400">
                    {conn.host}:{conn.port}/{conn.database}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => remove(conn)}
                  className="shrink-0 rounded-sm p-1 text-zinc-400 opacity-0 transition hover:bg-zinc-200 hover:text-red-600 group-hover:opacity-100"
                  title="ลบฐานข้อมูล"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={startCreate}
              className={`flex w-full items-center justify-center gap-1.5 rounded-sm border border-dashed px-3 py-2.5 text-[11px] font-black transition ${
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

            <div className="space-y-2 rounded-sm border border-amber-200 bg-amber-50/60 p-3">
              <p className="text-[10px] font-black text-amber-700">
                การตั้งค่าของ{" "}
                {flagsTarget === 0
                  ? "หลัก (inblackm)"
                  : connections.find((conn) => conn.id === flagsTarget)?.name || "ฐานข้อมูลนี้"}
              </p>
              <label className="flex items-center gap-2 text-[11px] font-bold text-zinc-700">
                <input
                  type="checkbox"
                  checked={currentFlags.allowWrite}
                  onChange={(e) => saveFlags({ allowWrite: e.target.checked })}
                />
                อนุญาตให้แก้ไขข้อมูล (เขียนกลับ)
              </label>
              <p className="text-[10px] font-semibold text-amber-700">
                ปิดไว้ = อ่านอย่างเดียว ต่อให้ Query ตั้ง &quot;แก้ไขข้อมูล&quot; ไว้ก็เขียนไม่ได้
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-[10px] font-black text-zinc-500">
                    timeout (ms)
                  </label>
                  <input
                    type="number"
                    defaultValue={currentFlags.statementTimeoutMs || ""}
                    placeholder="8000"
                    onBlur={(e) => saveFlags({ statementTimeoutMs: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-black text-zinc-500">
                    แถวสูงสุดต่อหน้า
                  </label>
                  <input
                    type="number"
                    defaultValue={currentFlags.maxRows || ""}
                    placeholder="1000"
                    onBlur={(e) => saveFlags({ maxRows: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>
            </div>

            {error && (
              <div className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-bold text-red-600">
                {error}
              </div>
            )}
            {testResult && (
              <div className="rounded-sm border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-700">
                {testResult}
              </div>
            )}

            <MissingNotice
              items={[
                !form.name.trim() && "ชื่อที่จะแสดง",
                !form.host.trim() && "host",
                !form.database.trim() && "ชื่อฐานข้อมูล",
                !form.username.trim() && "username",
              ].filter(Boolean)}
            />
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={testConnection}
                disabled={testing || !form.host.trim() || !form.database.trim() || !form.username.trim()}
                className="flex items-center gap-1.5 rounded-sm border border-zinc-200 px-4 py-2.5 text-xs font-black text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-50"
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
                className="flex items-center gap-1.5 rounded-sm bg-red-600 px-5 py-2.5 text-xs font-black text-white transition hover:bg-red-700 disabled:opacity-50"
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
