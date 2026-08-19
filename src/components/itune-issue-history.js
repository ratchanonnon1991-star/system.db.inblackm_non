"use client";

import { useEffect, useState } from "react";
import { apiJson } from "@/lib/api-json";
import ItunePasswordValue from "@/components/itune-password-value";

// Same tone→class mapping as itune-admin-table.js's StatusBadge — kept as a
// small local copy rather than a shared import since this is the only other
// place that needs it and it's just 2 entries here (resolved/open).
const STATUS_TONE_CLASS = {
  success: "bg-ll-success-bg text-ll-success",
  danger: "bg-ll-primary-subtle-bg text-ll-primary-subtle-text",
};

const ISSUE_LOG_FILTERS = [
  { key: "all", label: "ทั้งหมด" },
  { key: "open", label: "ยังไม่แก้" },
  { key: "resolved", label: "แก้แล้ว" },
];

function formatIssueLogTime(value) {
  if (!value) return "";
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return "";
  return new Date(ms).toLocaleString("th-TH", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

// Full-page read-only log of every "แจ้งปัญหา" report/resolve cycle (see
// reportItuneEntryIssue/resolveItuneEntryIssue in
// itune-entries-repository.js). Was originally a modal (ItuneIssueHistoryModal
// in itune-admin-table.js) — moved to its own route/page since the row
// includes a full field snapshot (email/password/currency/supplier/amount/
// link_sms/qna) and reads better with a full-width table than squeezed into
// a dialog. Doesn't link back to rows in the main table on purpose — it's a
// plain history view.
export default function ItuneIssueHistory() {
  const [filter, setFilter] = useState("all");
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const query = filter === "all" ? "" : `&resolved=${filter === "resolved"}`;
    apiJson(`/api/projectm/itune/issue-log?limit=200${query}`, {
      fallbackError: "โหลดประวัติการแจ้งปัญหาไม่สำเร็จ",
    })
      .then((data) => {
        if (!cancelled) setIssues(data.issues || []);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filter]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1.5">
        {ISSUE_LOG_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-3 py-1 text-[12px] font-medium ${
              filter === f.key
                ? "bg-ll-primary text-ll-on-primary"
                : "text-ll-ink-subtle hover:bg-ll-surface-2"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border border-ll-hairline bg-ll-surface-1 shadow-[var(--ll-shadow-card)]">
        {error && <p className="p-4 text-[13px] text-ll-primary">{error}</p>}
        {!error && loading && (
          <p className="p-4 text-center text-[13px] text-ll-ink-tertiary">กำลังโหลด...</p>
        )}
        {!error && !loading && issues.length === 0 && (
          <p className="p-4 text-center text-[13px] text-ll-ink-tertiary">
            ยังไม่มีประวัติการแจ้งปัญหา
          </p>
        )}
        {!error && !loading && issues.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-[12px]">
              <thead className="bg-ll-surface-2 text-[11px] font-medium uppercase tracking-wide text-ll-ink-subtle">
                <tr>
                  <th className="px-3 py-2">เวลาแจ้ง</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Password</th>
                  <th className="px-3 py-2">สกุลเงิน</th>
                  <th className="px-3 py-2">Supplier</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2">Link_SMS</th>
                  <th className="px-3 py-2">QNA</th>
                  <th className="px-3 py-2">ปัญหาที่แจ้ง</th>
                  <th className="px-3 py-2">แจ้งโดย</th>
                  <th className="px-3 py-2">สถานะ</th>
                  <th className="px-3 py-2">แก้ไขโดย / เวลา</th>
                </tr>
              </thead>
              <tbody>
                {issues.map((issue) => (
                  <tr key={issue.id} className="border-t border-ll-hairline">
                    <td className="whitespace-nowrap px-3 py-2 text-ll-ink-subtle">
                      {formatIssueLogTime(issue.reportedAt)}
                    </td>
                    <td className="px-3 py-2 text-ll-ink">{issue.entryEmail || "—"}</td>
                    <td className="px-3 py-2 text-ll-ink">
                      <ItunePasswordValue value={issue.entryPassword} />
                    </td>
                    <td className="px-3 py-2 text-ll-ink">{issue.entryCurrency || "—"}</td>
                    <td className="px-3 py-2 text-ll-ink">{issue.entrySupplier || "—"}</td>
                    <td className="px-3 py-2 text-right text-ll-ink">
                      {issue.entryAmount == null ? "—" : issue.entryAmount.toFixed(2)}
                    </td>
                    <td className="max-w-[160px] truncate px-3 py-2 text-ll-ink" title={issue.entryLinkSms}>
                      {issue.entryLinkSms || "—"}
                    </td>
                    <td className="max-w-[160px] truncate px-3 py-2 text-ll-ink" title={issue.entryQna}>
                      {issue.entryQna || "—"}
                    </td>
                    <td className="max-w-xs px-3 py-2 whitespace-pre-wrap text-ll-ink">
                      {issue.isReject && (
                        <span
                          className={`mb-1 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${STATUS_TONE_CLASS.danger}`}
                        >
                          Reject
                        </span>
                      )}
                      <span className="block">{issue.note}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-ll-ink-subtle">
                      {issue.reportedByUsername || "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          issue.resolvedAt ? STATUS_TONE_CLASS.success : STATUS_TONE_CLASS.danger
                        }`}
                      >
                        {issue.resolvedAt ? "แก้ไขแล้ว" : "ยังไม่แก้ไข"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-ll-ink-subtle">
                      {issue.resolvedAt
                        ? `${issue.resolvedByUsername || "—"} · ${formatIssueLogTime(issue.resolvedAt)}`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
