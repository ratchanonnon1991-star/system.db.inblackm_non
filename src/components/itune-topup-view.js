"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
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
export default function ItuneTopupView({ initialClaims, releaseThreshold }) {
  const [claims, setClaims] = useState(initialClaims || []);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState("");
  const now = useMinuteTicker();

  useEffect(() => {
    let cancelled = false;
    const id = setInterval(() => {
      apiJson("/api/projectm/itune/claim", { fallbackError: "โหลดรายการที่ถืออยู่ไม่สำเร็จ" })
        .then((data) => {
          if (!cancelled) setClaims(data.entries || []);
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

  async function claim() {
    setClaiming(true);
    setClaimError("");
    try {
      const data = await apiJson("/api/projectm/itune/claim", {
        method: "POST",
        fallbackError: "รับเมลไม่สำเร็จ",
      });
      setClaims((prev) => [...prev, data.entry]);
    } catch (err) {
      setClaimError(err.message);
    } finally {
      setClaiming(false);
    }
  }

  function handleReleased(id) {
    setClaims((prev) => prev.filter((c) => c.id !== id));
  }

  function handleUpdated(entry) {
    setClaims((prev) => prev.map((c) => (c.id === entry.id ? entry : c)));
  }

  const atLimit = claims.length >= MAX_CLAIMS;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-ll-ink-subtle">
          ถืออยู่ {claims.length}/{MAX_CLAIMS} เมล
        </p>
        <button
          type="button"
          onClick={claim}
          disabled={claiming || atLimit}
          title={
            atLimit ? `รับได้สูงสุด ${MAX_CLAIMS} เมล — คืนเมลก่อนถึงจะรับเพิ่มได้` : undefined
          }
          className="flex items-center gap-2 rounded-full bg-ll-primary px-4 py-2 text-sm font-medium text-ll-on-primary shadow-md transition hover:bg-ll-primary-hover disabled:opacity-50"
        >
          <Plus size={15} /> {claiming ? "กำลังรับ..." : "รับเมล"}
        </button>
      </div>

      {claimError && (
        <p className="rounded-md border border-ll-primary/20 bg-ll-primary-subtle-bg px-3 py-2 text-[13px] text-ll-primary-subtle-text">
          {claimError}
        </p>
      )}

      {claims.length === 0 ? (
        <div className="rounded-lg border border-dashed border-ll-hairline-strong p-8 text-center text-[13px] text-ll-ink-tertiary">
          ยังไม่ได้รับเมล — กด &quot;รับเมล&quot; เพื่อเริ่มต้น
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
    </div>
  );
}
