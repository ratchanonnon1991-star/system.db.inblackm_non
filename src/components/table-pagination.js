"use client";

import { useState } from "react";
import { TABLE_PAGE_SIZES, tablePage } from "@/lib/table-pagination";

export function TablePagination({ page, pageSize, total, totalPages, onPage, onPageSize, loading = false, observedAt, label = "แบ่งหน้าตาราง" }) {
  const { start, end } = tablePage(total, page, pageSize);
  return <nav aria-label={label} className="sticky left-0 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 px-3 py-3 text-xs text-inherit dark:border-zinc-700">
    <span aria-live="polite">{total ? start + 1 : 0}–{end} จาก {total.toLocaleString("th-TH")} รายการ{loading ? " · กำลังโหลด…" : ""}{observedAt && <> · ข้อมูลเมื่อ {new Date(observedAt).toLocaleTimeString("th-TH")}</>}</span>
    <div className="flex flex-wrap items-center gap-2">
      {onPageSize && <label className="flex items-center gap-2">ต่อหน้า<select aria-label={`${label} จำนวนแถวต่อหน้า`} value={pageSize} disabled={loading} onChange={(e) => onPageSize(Number(e.target.value))} className="rounded border border-zinc-300 bg-transparent px-2 py-1.5 dark:border-zinc-600">{TABLE_PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}</select></label>}
      <button type="button" aria-label={`${label} หน้าแรก`} disabled={loading || page <= 1} onClick={() => onPage(1)} className="rounded border border-zinc-300 px-2 py-1.5 disabled:opacity-40 dark:border-zinc-600">«</button>
      <button type="button" aria-label={`${label} หน้าก่อนหน้า`} disabled={loading || page <= 1} onClick={() => onPage(page - 1)} className="rounded border border-zinc-300 px-2 py-1.5 disabled:opacity-40 dark:border-zinc-600">ก่อนหน้า</button>
      <span>หน้า {page} / {totalPages}</span>
      <button type="button" aria-label={`${label} หน้าถัดไป`} disabled={loading || page >= totalPages} onClick={() => onPage(page + 1)} className="rounded border border-zinc-300 px-2 py-1.5 disabled:opacity-40 dark:border-zinc-600">ถัดไป</button>
      <button type="button" aria-label={`${label} หน้าสุดท้าย`} disabled={loading || page >= totalPages} onClick={() => onPage(totalPages)} className="rounded border border-zinc-300 px-2 py-1.5 disabled:opacity-40 dark:border-zinc-600">»</button>
    </div>
  </nav>;
}

// Slice logical records, not DOM <tr>s: expanded detail rows stay with their
// record, totals still use the original collection, and edits retain global indices.
export function useTablePagination(items, { resetKey, defaultPageSize = 25 } = {}) {
  const [state, setState] = useState({ page: 1, pageSize: defaultPageSize, resetKey });
  if (state.resetKey !== resetKey) setState({ ...state, page: 1, resetKey });
  const all = Array.isArray(items) ? items : [];
  const pagination = tablePage(all.length, state.resetKey === resetKey ? state.page : 1, state.pageSize);
  if (state.resetKey === resetKey && state.page !== pagination.page) setState({ ...state, page: pagination.page });
  return { ...pagination, items: all.slice(pagination.start, pagination.end), all,
    showControls: all.length > 25 || state.pageSize !== defaultPageSize,
    onPage: (page) => setState((previous) => ({ ...previous, page })),
    onPageSize: (pageSize) => setState((previous) => ({ ...previous, page: 1, pageSize })) };
}

export default function PaginatedTable({ items, children, resetKey, label = "แบ่งหน้าตาราง", defaultPageSize = 25 }) {
  const pagination = useTablePagination(items, { resetKey, defaultPageSize });
  return <>{children(pagination.items, pagination.start, pagination.all)}{pagination.showControls && <TablePagination {...pagination} label={label} />}</>;
}
