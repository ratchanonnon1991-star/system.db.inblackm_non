"use client";

import { useEffect, useState } from "react";
import { Inbox, Plus } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { useMinuteTicker } from "@/lib/itune-ticker";
import ItuneTopupCard from "@/components/itune-topup-card";

// Same cap enforced server-side in claimItuneEntry (see
// itune-entries-repository.js) — mirrored here just to disable the button
// and show the count without waiting on a round trip.
const MAX_CLAIMS = 2;

// How often to silently re-sync the claims list in the background. This is
// the only way a change made in a different session shows up here without
// a manual reload — most notably an admin confirming/declining a pending
// "Reject" request (see confirmItuneReject/declineItuneReject), which
// should make the card disappear (or its "รอแอดมินยืนยัน Reject" label
// clear) on its own.
const POLL_MS = 10_000;

// Self-service "รับเมล" flow for /projectm/[lang]/itune/topup — any
// logged-in GameDB user (not just projectm-admin, see the claim API routes'
// requireAdmin) can hold up to MAX_CLAIMS itune entries at once, each shown
// as a collapsible ItuneTopupCard.
export default function ItuneTopupView({
  initialClaims,
  initialAvailableEntries,
  releaseThreshold,
  initialClaimPaused,
}) {
  const [claims, setClaims] = useState(initialClaims || []);
  const [availableEntries, setAvailableEntries] = useState(initialAvailableEntries || []);
  const [claimPaused, setClaimPaused] = useState(Boolean(initialClaimPaused));
  const [claimingId, setClaimingId] = useState(null);
  const [claimError, setClaimError] = useState("");
  const now = useMinuteTicker();

  useEffect(() => {
    let cancelled = false;
    const id = setInterval(() => {
      apiJson("/api/projectm/itune/claim", { fallbackError: "โหลดรายการที่ถืออยู่ไม่สำเร็จ" })
        .then((data) => {
          if (!cancelled) {
            setClaims(data.entries || []);
            setAvailableEntries(data.availableEntries || []);
            setClaimPaused(Boolean(data.claimPaused));
          }
        })
        .catch(() => {
          // Best-effort background refresh — a transient failure just tries
          // again next tick, no need to surface it as a page-level error.
        });
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  async function refreshLists() {
    try {
      const data = await apiJson("/api/projectm/itune/claim", {
        fallbackError: "โหลดรายการเมลไม่สำเร็จ",
      });
      setClaims(data.entries || []);
      setAvailableEntries(data.availableEntries || []);
      setClaimPaused(Boolean(data.claimPaused));
    } catch {
      // A visible action already reports its own error. The periodic poll
      // will retry, so a refresh failure should not replace that message.
    }
  }

  async function claim(entryId) {
    setClaimingId(entryId);
    setClaimError("");
    try {
      const data = await apiJson("/api/projectm/itune/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId }),
        fallbackError: "รับเมลไม่สำเร็จ",
      });
      setClaims((prev) => prev.some((entry) => entry.id === data.entry.id)
        ? prev
        : [...prev, data.entry]);
      setAvailableEntries((prev) => prev.filter((entry) => entry.id !== data.entry.id));
    } catch (err) {
      setClaimError(err.message);
      await refreshLists();
    } finally {
      setClaimingId(null);
    }
  }

  function handleReleased(id) {
    setClaims((prev) => prev.filter((c) => c.id !== id));
    refreshLists();
  }

  function handleUpdated(entry) {
    setClaims((prev) => prev.map((c) => (c.id === entry.id ? entry : c)));
  }

  const atLimit = claims.length >= MAX_CLAIMS;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ll-hairline bg-ll-surface-1 px-4 py-3">
        <p className="text-[13px] text-ll-ink-subtle">
          ถืออยู่ {claims.length}/{MAX_CLAIMS} เมล
        </p>
        {atLimit && (
          <span className="text-[12px] text-ll-warning">
            คืนเมลที่ถืออยู่ก่อน จึงจะจองเพิ่มได้
          </span>
        )}
      </div>

      {claimError && (
        <p className="rounded-md border border-ll-primary/20 bg-ll-primary-subtle-bg px-3 py-2 text-[13px] text-ll-primary-subtle-text">
          {claimError}
        </p>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-ll-ink">เมลที่คุณถืออยู่</h2>
        {claims.length === 0 ? (
          <div className="rounded-lg border border-dashed border-ll-hairline-strong p-6 text-center text-[13px] text-ll-ink-tertiary">
            ยังไม่มีเมลที่จองไว้
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {claims.map((entry) => (
              <ItuneTopupCard
                key={entry.id}
                entry={entry}
                now={now}
                releaseThreshold={releaseThreshold}
                onReleased={() => handleReleased(entry.id)}
                onUpdated={handleUpdated}
              />
            ))}
          </div>
        )}
      </section>

      <section className="mt-2 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-ll-ink">เมลที่จองได้</h2>
            <p className="mt-0.5 text-[12px] text-ll-ink-subtle">
              พบ {availableEntries.length} รายการ
            </p>
          </div>
          <Inbox size={18} className="text-ll-ink-tertiary" />
        </div>

        {claimPaused ? (
          <div className="rounded-lg border border-ll-warning/40 bg-ll-warning-bg p-4 text-[13px] text-ll-warning">
            ระบบหยุดรับเมลชั่วคราว — ติดต่อแอดมิน
          </div>
        ) : availableEntries.length === 0 ? (
          <div className="rounded-lg border border-dashed border-ll-hairline-strong p-6 text-center text-[13px] text-ll-ink-tertiary">
            ไม่มีเมลว่างให้จองในขณะนี้
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-ll-hairline bg-ll-surface-1 shadow-[var(--ll-shadow-card)]">
            {availableEntries.map((entry, index) => {
              const isClaiming = claimingId === entry.id;
              return (
                <div
                  key={entry.id}
                  className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${index > 0 ? "border-t border-ll-hairline" : ""}`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ll-ink">{entry.email || "-"}</p>
                    <p className="mt-0.5 text-[12px] text-ll-ink-subtle">
                      ยอด {Number(entry.amount || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 })}
                      {entry.currency ? ` ${entry.currency}` : ""}
                      {entry.supplier ? ` · ${entry.supplier}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => claim(entry.id)}
                    disabled={claimingId !== null || atLimit}
                    title={atLimit ? `รับได้สูงสุด ${MAX_CLAIMS} เมล` : undefined}
                    className="flex shrink-0 items-center gap-2 rounded-full bg-ll-primary px-4 py-2 text-[13px] font-medium text-ll-on-primary transition hover:bg-ll-primary-hover disabled:opacity-50"
                  >
                    <Plus size={14} /> {isClaiming ? "กำลังจอง..." : "จอง"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
