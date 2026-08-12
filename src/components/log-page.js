"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  History,
  Loader2,
  LogIn,
  Search,
  XCircle,
} from "lucide-react";
import { apiJson } from "@/lib/api-json";

function SectionCard({ icon, title, children }) {
  return (
    <section className="rounded-sm border border-zinc-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 flex items-center gap-2 text-xs font-black text-zinc-700">
        {icon} {title}
      </h2>
      {children}
    </section>
  );
}

// Both tables fetch everything the API will give them (up to its own cap)
// and filter/page through it client-side, same pattern UsersModal already
// uses for its user list.
const PAGE_SIZE = 20;

const filterInputClass =
  "h-8 rounded-sm border border-zinc-200 px-2 text-[11px] font-semibold outline-none focus:border-red-600";

/** A distinct, sorted list of one field across a set of rows, for a filter
 * dropdown -- always starts with "ทั้งหมด" so no filter is the default. */
function distinctOptions(rows, pick) {
  return [...new Set(rows.map(pick).filter(Boolean))].sort((a, b) => a.localeCompare(b, "th"));
}

function Pager({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null;
  return (
    <div className="mt-2 flex items-center justify-between gap-2">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page <= 1}
        className="rounded-sm border border-zinc-200 px-2.5 py-1 text-[10px] font-black text-zinc-500 transition hover:bg-zinc-50 disabled:opacity-40"
      >
        ก่อนหน้า
      </button>
      <span className="text-[10px] font-bold text-zinc-400">
        หน้า {page} / {totalPages}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
        className="rounded-sm border border-zinc-200 px-2.5 py-1 text-[10px] font-black text-zinc-500 transition hover:bg-zinc-50 disabled:opacity-40"
      >
        ถัดไป
      </button>
    </div>
  );
}

/** Every login attempt, success or not -- read-only, there is nothing to
 * revert about someone having tried to sign in. */
function LoginLogSection() {
  const [logins, setLogins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [resultFilter, setResultFilter] = useState("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiJson("/api/login-log?limit=500", {
          fallbackError: "โหลดประวัติการเข้าสู่ระบบไม่สำเร็จ",
        });
        if (!cancelled) setLogins(data.logins || []);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // setPage(1) happens in these handlers rather than an effect keyed off
  // search/resultFilter, same reason UsersModal's search box does it this
  // way -- a filter changing is a user action, not state to resynchronize.
  const updateSearch = (value) => {
    setSearch(value);
    setPage(1);
  };
  const updateResultFilter = (value) => {
    setResultFilter(value);
    setPage(1);
  };

  const filteredLogins = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return logins.filter((entry) => {
      if (resultFilter === "success" && !entry.success) return false;
      if (resultFilter === "failed" && entry.success) return false;
      if (!needle) return true;
      return (
        entry.username.toLowerCase().includes(needle) ||
        (entry.ip || "").toLowerCase().includes(needle)
      );
    });
  }, [logins, search, resultFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredLogins.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageLogins = filteredLogins.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <SectionCard icon={<LogIn size={15} className="text-red-600" />} title="ประวัติการเข้าสู่ระบบ">
      {error && (
        <div className="mb-3 rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-bold text-red-600">
          {error}
        </div>
      )}
      {logins.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1">
            <Search size={12} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => updateSearch(e.target.value)}
              placeholder="ค้นหา username หรือ IP..."
              className={`${filterInputClass} w-full pl-7`}
            />
          </div>
          <select
            value={resultFilter}
            onChange={(e) => updateResultFilter(e.target.value)}
            className={filterInputClass}
          >
            <option value="all">ทุกผล</option>
            <option value="success">สำเร็จเท่านั้น</option>
            <option value="failed">ไม่สำเร็จเท่านั้น</option>
          </select>
          <span className="text-[10px] font-bold text-zinc-400">
            {filteredLogins.length.toLocaleString("th-TH")} รายการ
          </span>
        </div>
      )}
      {loading ? (
        <p className="flex items-center gap-2 py-8 text-xs font-semibold text-zinc-400">
          <Loader2 size={14} className="animate-spin" /> กำลังโหลด...
        </p>
      ) : logins.length === 0 ? (
        <p className="px-8 py-4 text-center text-xs font-semibold text-zinc-400">
          ยังไม่มีการเข้าสู่ระบบ
        </p>
      ) : filteredLogins.length === 0 ? (
        <p className="px-8 py-4 text-center text-xs font-semibold text-zinc-400">
          ไม่พบรายการที่ตรงกับตัวกรอง
        </p>
      ) : (
        <div className="overflow-x-auto rounded-sm border border-zinc-200">
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="bg-zinc-100 text-left font-black text-zinc-500">
                <th className="px-2 py-1.5">เวลา</th>
                <th className="px-2 py-1.5">Username</th>
                <th className="px-2 py-1.5">ผล</th>
                <th className="px-2 py-1.5">IP</th>
              </tr>
            </thead>
            <tbody>
              {pageLogins.map((entry) => (
                <tr key={entry.id} className="border-t border-zinc-100">
                  <td className="whitespace-nowrap px-2 py-1.5 text-zinc-500">
                    {new Date(entry.createdAt).toLocaleString("th-TH", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </td>
                  <td className="px-2 py-1.5 font-bold text-zinc-700">{entry.username}</td>
                  <td className="px-2 py-1.5">
                    {entry.success ? (
                      <span className="inline-flex items-center gap-1 font-black text-emerald-600">
                        <CheckCircle2 size={12} /> สำเร็จ
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1 font-black text-red-600"
                        title={entry.reason || ""}
                      >
                        <XCircle size={12} /> ไม่สำเร็จ
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-zinc-600">{entry.ip || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={safePage} totalPages={totalPages} onChange={setPage} />
    </SectionCard>
  );
}

/** Who changed which cell (or added/removed which row), and a one-click way
 * to put it back. */
function EditLogSection() {
  const [edits, setEdits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reverting, setReverting] = useState(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [tableFilter, setTableFilter] = useState("");
  const [queryFilter, setQueryFilter] = useState("");
  // The log only keeps queryId, not the Query's own name (queries get
  // renamed, deleted, re-pointed at a different table) -- fetched once here,
  // purely to label/search/filter by "which Query" a row belongs to.
  const [queryNames, setQueryNames] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [editsData, queriesData] = await Promise.all([
        apiJson("/api/edit-log?limit=500", {
          fallbackError: "โหลดประวัติการแก้ไขไม่สำเร็จ",
        }),
        apiJson("/api/queries", { fallbackError: "โหลดรายชื่อ Query ไม่สำเร็จ" }).catch(() => ({
          queries: [],
        })),
      ]);
      setEdits(editsData.edits || []);
      setQueryNames(
        Object.fromEntries((queriesData.queries || []).map((q) => [q.id, q.name]))
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setState runs after the fetch resolves
    load();
  }, [load]);

  const updateSearch = (value) => {
    setSearch(value);
    setPage(1);
  };
  const updateTableFilter = (value) => {
    setTableFilter(value);
    setPage(1);
  };
  const updateQueryFilter = (value) => {
    setQueryFilter(value);
    setPage(1);
  };

  // GameInfo writes (game_list, gamelist_images/tutorials/packs/order) go
  // through their own routes, not the generic Query system, so they log with
  // queryId: null -- the only source that does. Labelling those "GameInfo"
  // instead of leaving them blank makes them findable through the same
  // search box and Query filter as everything else, which is the point of
  // "หน้าไหน" filtering; the entries themselves aren't revertible from here
  // either way (see canRevert), so this is display/search only.
  const queryNameOf = (entry) => (entry.queryId ? queryNames[entry.queryId] || "" : "GameInfo");

  // A restore is itself an insert underneath, so undoing it is the same
  // "delete this row" action as undoing a plain add.
  const isRowInsert = (entry) => entry.column === "(เพิ่มแถว)" || entry.column === "(กู้คืนแถวที่ลบ)";
  const isRowDelete = (entry) => entry.column === "(ลบแถว)";

  // A delete's snapshot is the row's own JSON, cut off past SUMMARY_LIMIT
  // characters (see gamedb-row-writer.js) -- past that point it can't be
  // parsed back into a row, so restoring it can't be offered.
  const deletedRowSnapshot = (entry) => {
    if (!isRowDelete(entry) || !entry.oldValue || entry.oldValue.endsWith("…")) return null;
    try {
      const parsed = JSON.parse(entry.oldValue);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  };

  const canRevert = (entry) => {
    if (!entry.queryId) return false;
    if (isRowInsert(entry)) return entry.pkValue !== null && entry.pkValue !== undefined;
    if (isRowDelete(entry)) return deletedRowSnapshot(entry) !== null;
    return true;
  };

  const revert = async (entry) => {
    if (isRowInsert(entry)) {
      if (!window.confirm(`ลบแถวที่เพิ่งเพิ่ม (${entry.pkColumn}=${entry.pkValue}) ที่เพิ่มพลาดหรือไม่ตั้งใจ?`)) {
        return;
      }
      setReverting(entry.id);
      setError("");
      try {
        await apiJson(`/api/queries/${entry.queryId}/row`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pkValue: entry.pkValue }),
          fallbackError: "ลบแถวที่เพิ่มไปไม่สำเร็จ",
        });
        await load();
      } catch (err) {
        setError(err.message);
      } finally {
        setReverting(null);
      }
      return;
    }

    if (isRowDelete(entry)) {
      const snapshot = deletedRowSnapshot(entry);
      if (!snapshot) return;
      if (!window.confirm(`กู้คืนแถวที่ถูกลบ (${entry.pkColumn}=${entry.pkValue}) กลับเข้าตาราง?`)) {
        return;
      }
      setReverting(entry.id);
      setError("");
      try {
        await apiJson(`/api/queries/${entry.queryId}/row/restore`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ values: snapshot }),
          fallbackError: "กู้คืนแถวไม่สำเร็จ",
        });
        await load();
      } catch (err) {
        setError(err.message);
      } finally {
        setReverting(null);
      }
      return;
    }

    if (
      !window.confirm(
        `ย้อนค่า ${entry.column} ของแถว ${entry.pkValue} กลับเป็น "${entry.oldValue ?? "(ว่าง)"}" ?`
      )
    ) {
      return;
    }
    setReverting(entry.id);
    setError("");
    try {
      await apiJson(`/api/queries/${entry.queryId}/cell`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pkValue: entry.pkValue,
          column: entry.column,
          value: entry.oldValue ?? "",
        }),
        fallbackError: "ย้อนค่ากลับไม่สำเร็จ",
      });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setReverting(null);
    }
  };

  const filteredEdits = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return edits.filter((entry) => {
      if (tableFilter && entry.table !== tableFilter) return false;
      if (queryFilter && queryNameOf(entry) !== queryFilter) return false;
      if (!needle) return true;
      return [entry.actor, entry.table, entry.column, entry.pkValue, queryNameOf(entry)]
        .some((field) => String(field ?? "").toLowerCase().includes(needle));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- queryNameOf reads queryNames, already a dep
  }, [edits, search, tableFilter, queryFilter, queryNames]);

  const tableOptions = useMemo(() => distinctOptions(edits, (entry) => entry.table), [edits]);
  const queryOptions = useMemo(
    () => distinctOptions(edits, (entry) => queryNameOf(entry)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- queryNameOf reads queryNames, already a dep
    [edits, queryNames]
  );

  const totalPages = Math.max(1, Math.ceil(filteredEdits.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageEdits = filteredEdits.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <SectionCard icon={<History size={15} className="text-red-600" />} title="ประวัติการแก้ไขข้อมูล">
      {error && (
        <div className="mb-3 rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-bold text-red-600">
          {error}
        </div>
      )}
      {edits.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1">
            <Search size={12} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => updateSearch(e.target.value)}
              placeholder="ค้นหาใคร / ตาราง / แถว / คอลัมน์ / Query..."
              className={`${filterInputClass} w-full pl-7`}
            />
          </div>
          <select
            value={tableFilter}
            onChange={(e) => updateTableFilter(e.target.value)}
            className={filterInputClass}
          >
            <option value="">ทุกตาราง</option>
            {tableOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <select
            value={queryFilter}
            onChange={(e) => updateQueryFilter(e.target.value)}
            className={filterInputClass}
          >
            <option value="">ทุก Query</option>
            {queryOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <span className="text-[10px] font-bold text-zinc-400">
            {filteredEdits.length.toLocaleString("th-TH")} รายการ
          </span>
        </div>
      )}
      {loading ? (
        <p className="flex items-center gap-2 py-8 text-xs font-semibold text-zinc-400">
          <Loader2 size={14} className="animate-spin" /> กำลังโหลด...
        </p>
      ) : edits.length === 0 ? (
        <p className="px-8 py-4 text-center text-xs font-semibold text-zinc-400">
          ยังไม่มีการแก้ไขข้อมูล
        </p>
      ) : filteredEdits.length === 0 ? (
        <p className="px-8 py-4 text-center text-xs font-semibold text-zinc-400">
          ไม่พบรายการที่ตรงกับตัวกรอง
        </p>
      ) : (
        <div className="overflow-x-auto rounded-sm border border-zinc-200">
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="bg-zinc-100 text-left font-black text-zinc-500">
                <th className="px-2 py-1.5">เวลา</th>
                <th className="px-2 py-1.5">ใคร</th>
                <th className="px-2 py-1.5">Query</th>
                <th className="px-2 py-1.5">ตาราง</th>
                <th className="px-2 py-1.5">แถว</th>
                <th className="px-2 py-1.5">คอลัมน์</th>
                <th className="px-2 py-1.5">เดิม → ใหม่</th>
                <th className="px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {pageEdits.map((entry) => (
                <tr key={entry.id} className="border-t border-zinc-100">
                  <td className="whitespace-nowrap px-2 py-1.5 text-zinc-500">
                    {new Date(entry.createdAt).toLocaleString("th-TH", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </td>
                  <td className="px-2 py-1.5 font-bold text-zinc-700">{entry.actor}</td>
                  <td className="px-2 py-1.5 font-semibold text-zinc-600">
                    {queryNameOf(entry) || "—"}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-zinc-600">{entry.table}</td>
                  <td className="px-2 py-1.5 font-mono text-zinc-600">
                    {entry.pkColumn}={entry.pkValue}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-zinc-600">{entry.column}</td>
                  <td className="px-2 py-1.5">
                    <span className="text-zinc-400 line-through">{entry.oldValue ?? "(ว่าง)"}</span>
                    {" → "}
                    <span className="font-black text-zinc-800">{entry.newValue ?? "(ว่าง)"}</span>
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <button
                      type="button"
                      onClick={() => revert(entry)}
                      disabled={reverting === entry.id || !canRevert(entry)}
                      className="rounded-sm border border-zinc-200 px-2 py-1 text-[10px] font-black text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-40"
                      title={
                        !entry.queryId
                          ? "แก้ไขจากนอกระบบ Query — ย้อนกลับจากที่นี่ไม่ได้ ไปแก้ที่หน้าเดิมแทน"
                          : isRowInsert(entry)
                            ? "ลบแถวที่เพิ่งเพิ่มนี้ทิ้ง"
                            : isRowDelete(entry)
                              ? canRevert(entry)
                                ? "เพิ่มแถวนี้กลับเข้าตาราง"
                                : "ข้อมูลแถวนี้ยาวเกินกว่าจะกู้คืนอัตโนมัติได้"
                              : "เขียนค่าเดิมกลับเข้าไป"
                      }
                    >
                      {reverting === entry.id
                        ? "..."
                        : !entry.queryId
                          ? "—"
                          : isRowInsert(entry)
                            ? "ลบแถวนี้"
                            : isRowDelete(entry)
                              ? "กู้คืนแถว"
                              : "ย้อนกลับ"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={safePage} totalPages={totalPages} onChange={setPage} />
    </SectionCard>
  );
}

export default function LogPage() {
  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex items-center gap-3">
          <Link
            href="/systemdb"
            className="flex items-center gap-1 rounded-sm border border-zinc-200 bg-white px-3 py-1.5 text-xs font-black text-zinc-600 transition hover:bg-zinc-50"
          >
            <ArrowLeft size={14} /> กลับ
          </Link>
          <h1 className="text-sm font-black text-zinc-800">ประวัติการใช้งานระบบ</h1>
        </div>
        <LoginLogSection />
        <EditLogSection />
      </div>
    </div>
  );
}
