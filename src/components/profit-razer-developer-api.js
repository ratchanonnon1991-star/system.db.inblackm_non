"use client";

import { useCallback, useEffect, useState } from "react";
import { Code2, Copy, Loader2, RefreshCw } from "lucide-react";
import { apiJson } from "@/lib/api-json";

function copyText(text) {
  if (!text) return;
  navigator.clipboard?.writeText(text).catch(() => {});
}

export default function ProfitRazerDeveloperApi({ canEdit }) {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [msg, setMsg] = useState("");
  const [origin, setOrigin] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    return apiJson("/api/profit/razer/bot/config", { fallbackError: "โหลด Developer API ไม่สำเร็จ" })
      .then((data) => setConfig(data.botApi))
      .catch(() => setConfig(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, [load]);

  async function handleRegenerate() {
    if (!canEdit) return;
    if (!window.confirm("สร้าง Secret Key ใหม่? Key เดิมจะใช้ไม่ได้ทันที")) return;
    setBusy(true);
    setMsg("");
    setNewKey("");
    try {
      const data = await apiJson("/api/profit/razer/bot/config/regenerate", {
        method: "POST",
        fallbackError: "สร้าง key ใหม่ไม่สำเร็จ",
      });
      setNewKey(data.secretKey);
      setConfig(data.botApi);
      setMsg("คัดลอก Secret Key ไปใช้กับบอท — จะไม่แสดงอีกครั้ง");
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleToggle() {
    if (!canEdit || !config) return;
    setBusy(true);
    setMsg("");
    try {
      const data = await apiJson("/api/profit/razer/bot/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !config.enabled }),
        fallbackError: "อัปเดตสถานะไม่สำเร็จ",
      });
      setConfig(data.botApi);
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  const displayKey = newKey || config?.keyPrefix || "ยังไม่มี Secret Key";
  const apiUrl = origin ? `${origin}/api/profit/razer/bot/accounts` : "/api/profit/razer/bot/accounts";
  const active = config?.enabled && config?.hasKey;

  return (
    <div className="rounded-xl border border-ll-hairline bg-ll-surface-1 p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Code2 size={18} className="text-ll-ink-subtle" />
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ll-ink-tertiary">Developer API</p>
            <p className="mt-0.5 text-[12px] text-ll-ink-subtle">บอทดึง email + password + OTP (จาก 2FA Secret) — เลือกบัญชีฝั่งบอท</p>
          </div>
        </div>
        {loading ? (
          <Loader2 size={16} className="animate-spin text-ll-ink-tertiary" />
        ) : (
          <button
            type="button"
            disabled={!canEdit || busy || !config?.hasKey}
            onClick={handleToggle}
            className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              active
                ? "bg-emerald-50 text-emerald-700"
                : "bg-ll-surface-2 text-ll-ink-tertiary"
            } disabled:opacity-50`}
          >
            {active ? "ACTIVE" : "INACTIVE"}
          </button>
        )}
      </div>

      <div className="mt-4">
        <label className="text-[11px] text-ll-ink-tertiary">Secret Key</label>
        <div className="mt-1 flex items-center gap-2 rounded-lg border border-ll-hairline bg-ll-surface-2/50 px-3 py-2.5">
          <code className="min-w-0 flex-1 truncate font-mono text-[13px] text-ll-ink">{displayKey}</code>
          {(newKey || config?.keyPrefix) && (
            <button
              type="button"
              title="Copy"
              onClick={() => copyText(newKey || config?.keyPrefix)}
              className="shrink-0 rounded p-1 text-ll-ink-subtle hover:bg-ll-surface-2 hover:text-ll-ink"
            >
              <Copy size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="mt-3">
        <label className="text-[11px] text-ll-ink-tertiary">API URL (GET บัญชีทั้งหมด)</label>
        <div className="mt-1 flex items-center gap-2 rounded-lg border border-ll-hairline bg-ll-surface-2/50 px-3 py-2.5">
          <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-ll-ink">{apiUrl}</code>
          <button
            type="button"
            title="Copy URL"
            onClick={() => copyText(apiUrl)}
            className="shrink-0 rounded p-1 text-ll-ink-subtle hover:bg-ll-surface-2 hover:text-ll-ink"
          >
            <Copy size={14} />
          </button>
        </div>
        <p className="mt-1.5 font-mono text-[11px] text-ll-ink-tertiary">
          ?zone=CAD&amp;status=ACTIVE — filter โซน / สถานะ
        </p>
      </div>

      {canEdit && (
        <button
          type="button"
          onClick={handleRegenerate}
          disabled={busy}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-ll-primary px-4 py-2.5 text-[13px] font-medium text-white hover:opacity-90 disabled:opacity-60"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          Regenerate Secret Key
        </button>
      )}

      {msg && <p className="mt-3 text-[12px] text-ll-primary-subtle-text">{msg}</p>}

      <div className="mt-4 rounded-lg bg-ll-surface-2/60 px-3 py-2.5 text-[11px] text-ll-ink-subtle">
        <p className="font-medium text-ll-ink">Header</p>
        <code className="mt-1 block font-mono">Authorization: Bearer &lt;secret_key&gt;</code>
        <p className="mt-2">Response มี email, password, tfaSecret, otp (จาก 2FA), zone, status, goldBalance</p>
        <p className="mt-1 font-mono text-[10px]">POST /bot/otp — body: {`{"email":"...","botName":"..."}`} → status IN_USE + OTP</p>
        <p className="mt-1 font-mono text-[10px]">POST .../accounts/:id/use — มาร์ก IN_USE · POST .../release หรือ /report — ปล่อย + sync ยอดจริงจาก Razer</p>
        <p className="mt-1 font-mono text-[10px]">GET /bot/otp?email=... — OTP + ยอด Gold/Silver</p>
        <p className="mt-1">ปิด/เปิดบัญชีทีละรายการได้ที่คอลัมน์ Bot API ในตารางด้านล่าง</p>
      </div>
    </div>
  );
}
