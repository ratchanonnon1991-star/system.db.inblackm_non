"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { apiJson } from "@/lib/api-json";

const ACTION_LABEL = {
  claim: "รับเมล",
  release: "คืนเมล",
  reject: "ขอ Reject",
  reject_confirm: "ยืนยัน Reject",
  reject_decline: "ปฏิเสธคำขอ Reject",
  cancel_reject: "ยกเลิก Reject",
};

const ACTION_TONE_CLASS = {
  claim: "bg-ll-success-bg text-ll-success",
  release: "bg-ll-surface-2 text-ll-ink-subtle",
  reject: "bg-ll-warning-bg text-ll-warning",
  reject_confirm: "bg-ll-primary-subtle-bg text-ll-primary-subtle-text",
  reject_decline: "bg-ll-surface-2 text-ll-ink-subtle",
  cancel_reject: "bg-ll-warning-bg text-ll-warning",
};

const TABS = [
  { key: "live", label: "กำลังถืออยู่" },
];

// How often to silently re-sync whichever tab is currently visible, so a
// confirm/decline/cancel another admin performs (or a topup user's own
// claim/release/reject request from their side) shows up here without a
// manual reload — same idea as itune-topup-view.js's own poll.
const POLL_MS = 10_000;

function formatLogTime(value) {
  if (!value) return "-";
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return "-";
  return new Date(ms).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
}

// Groups the flat "who currently holds what" list from
// listClaimedItuneEntries by claimedByUsername, so the ปัจจุบัน tab reads as
// "this person has these N emails" rather than a flat table someone has to
// scan for a name. Entries with no resolvable username (claimedByUserId set
// but the user lookup came back empty — an edge case, not the common path)
// group under a literal fallback label rather than silently disappearing.
function groupByUser(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const key = entry.claimedByUsername || `(user #${entry.claimedByUserId})`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  return Array.from(groups.entries()).map(([username, items]) => ({ username, items }));
}

// "log คนเติม" — admin page combining a live snapshot of who's currently
// holding which itune entries (ปัจจุบัน, from the entries table's own
// claimed_by_user_id) with the full claim/release/reject-workflow history
// (ประวัติ, from projectm_itune_claim_log — see insertClaimLog in
// itune-entries-repository.js, the only place past claims survive once
// released). A "Reject" only files a request (see rejectItuneEntry) — this
// page's ยืนยัน/ปฏิเสธคำขอ buttons are where an admin actually approves or
// dismisses it (confirmItuneReject/declineItuneReject), and ยกเลิก later
// undoes an already-approved one (cancelItuneReject). Two tabs instead of
// one merged view since ปัจจุบัน/ประวัติ answer different questions and want
// different shapes (grouped-by-person vs. a flat timeline).
export default function ItuneTopupLog() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") === "history" ? "history" : "live";
  const [liveEntries, setLiveEntries] = useState(null);
  const [liveError, setLiveError] = useState("");
  const [logs, setLogs] = useState(null);
  const [logError, setLogError] = useState("");
  const [actingId, setActingId] = useState(null);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    function onLogsCleared() {
      setLogs([]);
      setActionError("");
    }
    window.addEventListener("itune:logs-cleared", onLogsCleared);
    return () => window.removeEventListener("itune:logs-cleared", onLogsCleared);
  }, []);

  useEffect(() => {
    if (tab !== "live" || liveEntries !== null) return;
    let cancelled = false;
    apiJson("/api/projectm/itune/claims", { fallbackError: "โหลดรายการที่ถืออยู่ไม่สำเร็จ" })
      .then((data) => {
        if (!cancelled) setLiveEntries(data.entries || []);
      })
      .catch((err) => {
        if (!cancelled) setLiveError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, liveEntries]);

  useEffect(() => {
    if (tab !== "history" || logs !== null) return;
    let cancelled = false;
    apiJson("/api/projectm/itune/claim-log?limit=300", {
      fallbackError: "โหลดประวัติการรับ/คืนเมลไม่สำเร็จ",
    })
      .then((data) => {
        if (!cancelled) setLogs(data.logs || []);
      })
      .catch((err) => {
        if (!cancelled) setLogError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, logs]);

  // Background poll, separate from the load-on-null effects above — this
  // one always re-fetches on a timer (no `=== null` gate) but updates state
  // directly instead of nulling it first, so it doesn't flash the
  // "กำลังโหลด..." state on every tick the way a manual refresh does.
  useEffect(() => {
    if (tab !== "live") return;
    const id = setInterval(() => {
      apiJson("/api/projectm/itune/claims", { fallbackError: "โหลดรายการที่ถืออยู่ไม่สำเร็จ" })
        .then((data) => setLiveEntries(data.entries || []))
        .catch(() => {
          // Best-effort — a transient failure just tries again next tick.
        });
    }, POLL_MS);
    return () => clearInterval(id);
  }, [tab]);

  useEffect(() => {
    if (tab !== "history") return;
    const id = setInterval(() => {
      apiJson("/api/projectm/itune/claim-log?limit=300", {
        fallbackError: "โหลดประวัติการรับ/คืนเมลไม่สำเร็จ",
      })
        .then((data) => setLogs(data.logs || []))
        .catch(() => {
          // Best-effort — a transient failure just tries again next tick.
        });
    }, POLL_MS);
    return () => clearInterval(id);
  }, [tab]);

  function refreshLive() {
    setLiveEntries(null);
    setLiveError("");
  }

  function refreshHistory() {
    setLogs(null);
    setLogError("");
  }

  // Confirming/declining/cancelling a reject can change who's allowed to
  // claim what, so both tabs' cached data go stale — reset both to null so
  // whichever is visible refetches immediately and the other picks up fresh
  // data next time it's opened, instead of only refreshing the tab the
  // button happened to be on.
  async function runRejectAction(log, endpoint, confirmMessage, fallbackError) {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    setActingId(log.id);
    setActionError("");
    try {
      await apiJson(`/api/projectm/itune/claim-log/${log.id}/${endpoint}`, {
        method: "POST",
        fallbackError,
      });
      setLogs(null);
      setLiveEntries(null);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActingId(null);
    }
  }

  const confirmReject = (log) =>
    runRejectAction(
      log,
      "confirm-reject",
      `ยืนยัน Reject ของ ${log.entryEmail || `ID ${log.entryId}`} (ขอโดย ${log.username || "-"})? เมลนี้จะกลับเข้าพูลให้คนอื่นรับได้ทันที แต่ผู้ใช้คนนี้จะไม่ได้รับเมลนี้อีก`,
      "ยืนยัน reject ไม่สำเร็จ"
    );
  const declineReject = (log) =>
    runRejectAction(
      log,
      "decline-reject",
      `ปฏิเสธคำขอ Reject ของ ${log.entryEmail || `ID ${log.entryId}`} (ขอโดย ${log.username || "-"})? เมลจะยังอยู่กับผู้ใช้คนนี้ตามเดิม`,
      "ปฏิเสธคำขอไม่สำเร็จ"
    );
  const cancelReject = (log) =>
    runRejectAction(
      log,
      "cancel-reject",
      `ยกเลิก Reject ของ ${log.entryEmail || `ID ${log.entryId}`} (โดย ${log.username || "-"})? ผู้ใช้คนนี้จะกลับมารับเมลนี้ได้อีกครั้ง`,
      "ยกเลิก reject ไม่สำเร็จ"
    );

  const liveGroups = liveEntries ? groupByUser(liveEntries) : null;

  function selectTab(nextTab) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("tab", nextTab);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => selectTab(t.key)}
              aria-pressed={tab === t.key}
              className={`rounded-full px-3 py-1 text-[12px] font-medium ${
                tab === t.key
                  ? "bg-ll-primary text-ll-on-primary"
                  : "text-ll-ink-subtle hover:bg-ll-surface-2"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={tab === "live" ? refreshLive : refreshHistory}
            className="rounded-md border border-ll-hairline-strong px-3 py-1.5 text-[12px] font-medium text-ll-ink-subtle hover:bg-ll-surface-2"
          >
            รีเฟรช
          </button>
        </div>
      </div>

      {actionError && (
        <p className="rounded-md border border-ll-primary/20 bg-ll-primary-subtle-bg px-3 py-2 text-[13px] text-ll-primary-subtle-text">
          {actionError}
        </p>
      )}

      {tab === "live" ? (
        <div className="overflow-hidden rounded-lg border border-ll-hairline bg-ll-surface-1 shadow-[var(--ll-shadow-card)]">
          {liveError && <p className="p-4 text-[13px] text-ll-primary">{liveError}</p>}
          {!liveError && liveEntries === null && (
            <p className="p-4 text-center text-[13px] text-ll-ink-tertiary">กำลังโหลด...</p>
          )}
          {!liveError && liveGroups && liveGroups.length === 0 && (
            <p className="p-4 text-center text-[13px] text-ll-ink-tertiary">
              ยังไม่มีใครถือเมลอยู่ตอนนี้
            </p>
          )}
          {!liveError && liveGroups && liveGroups.length > 0 && (
            <div className="divide-y divide-ll-hairline">
              {liveGroups.map((group) => (
                <div key={group.username} className="p-4">
                  <p className="text-[13px] font-semibold text-ll-ink">
                    {group.username}{" "}
                    <span className="font-normal text-ll-ink-tertiary">
                      ({group.items.length} เมล)
                    </span>
                  </p>
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full min-w-[560px] text-left text-[12px]">
                      <thead className="text-[11px] font-medium uppercase tracking-wide text-ll-ink-subtle">
                        <tr>
                          <th className="px-2 py-1">ID</th>
                          <th className="px-2 py-1">Email</th>
                          <th className="px-2 py-1 text-right">Amount</th>
                          <th className="px-2 py-1">รับเมื่อ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.items.map((entry) => (
                          <tr key={entry.id} className="border-t border-ll-hairline">
                            <td className="px-2 py-1.5 font-mono text-ll-ink-subtle">
                              {entry.id}
                              {entry.hasPendingReject && (
                                <span className="ml-1.5 inline-flex items-center rounded-full bg-ll-warning-bg px-1.5 py-0.5 text-[10px] font-medium text-ll-warning">
                                  รอยืนยัน Reject
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-ll-ink">{entry.email || "-"}</td>
                            <td className="px-2 py-1.5 text-right text-ll-ink">
                              {Number(entry.amount).toFixed(2)}
                            </td>
                            <td className="px-2 py-1.5 text-ll-ink-subtle">
                              {formatLogTime(entry.claimedAt)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-ll-hairline bg-ll-surface-1 shadow-[var(--ll-shadow-card)]">
          {logError && <p className="p-4 text-[13px] text-ll-primary">{logError}</p>}
          {!logError && logs === null && (
            <p className="p-4 text-center text-[13px] text-ll-ink-tertiary">กำลังโหลด...</p>
          )}
          {!logError && logs && logs.length === 0 && (
            <p className="p-4 text-center text-[13px] text-ll-ink-tertiary">ยังไม่มีประวัติ</p>
          )}
          {!logError && logs && logs.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-[12px]">
                <thead className="bg-ll-surface-2 text-[11px] font-medium uppercase tracking-wide text-ll-ink-subtle">
                  <tr>
                    <th className="px-3 py-2">เวลา</th>
                    <th className="px-3 py-2">การกระทำ</th>
                    <th className="px-3 py-2">ID</th>
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">โดย</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className="border-t border-ll-hairline">
                      <td className="whitespace-nowrap px-3 py-2 text-ll-ink-subtle">
                        {formatLogTime(log.createdAt)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            ACTION_TONE_CLASS[log.action] || ACTION_TONE_CLASS.release
                          }`}
                        >
                          {ACTION_LABEL[log.action] || log.action}
                        </span>
                        {(log.canConfirm || log.canDecline) && (
                          <span className="ml-1.5 text-[10px] text-ll-ink-tertiary">
                            (รอยืนยัน)
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-ll-ink-subtle">{log.entryId}</td>
                      <td className="px-3 py-2 text-ll-ink">{log.entryEmail || "-"}</td>
                      <td className="px-3 py-2 text-ll-ink-subtle">{log.username || "-"}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        <div className="flex justify-end gap-1.5">
                          {log.canConfirm && (
                            <button
                              type="button"
                              onClick={() => confirmReject(log)}
                              disabled={actingId === log.id}
                              className="rounded-md bg-ll-primary px-2.5 py-1 text-[11px] font-medium text-ll-on-primary hover:bg-ll-primary-hover disabled:opacity-50"
                            >
                              {actingId === log.id ? "..." : "ยืนยัน"}
                            </button>
                          )}
                          {log.canDecline && (
                            <button
                              type="button"
                              onClick={() => declineReject(log)}
                              disabled={actingId === log.id}
                              className="rounded-md border border-ll-hairline-strong px-2.5 py-1 text-[11px] font-medium text-ll-ink-subtle hover:bg-ll-surface-2 disabled:opacity-50"
                            >
                              {actingId === log.id ? "..." : "ปฏิเสธคำขอ"}
                            </button>
                          )}
                          {log.canCancel && (
                            <button
                              type="button"
                              onClick={() => cancelReject(log)}
                              disabled={actingId === log.id}
                              className="rounded-md border border-ll-hairline-strong px-2.5 py-1 text-[11px] font-medium text-ll-ink-subtle hover:bg-ll-surface-2 disabled:opacity-50"
                            >
                              {actingId === log.id ? "..." : "ยกเลิก"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
