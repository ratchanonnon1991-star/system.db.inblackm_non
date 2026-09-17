"use client";

import { useCallback, useEffect, useState } from "react";
import { Code2, Copy, Loader2 } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import ProfitModal, { ProfitField, profitInputClass } from "@/components/profit-modal";

const REVOKE_CONFIRM = "REVOKE";

function copyText(text) {
  if (!text) return;
  navigator.clipboard?.writeText(text).catch(() => {});
}

function fmtWhen(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return "";
  }
}

export default function ProfitRazerDeveloperApi({ canEdit }) {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [freshKey, setFreshKey] = useState(null);
  const [msg, setMsg] = useState("");
  const [origin, setOrigin] = useState("");
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [revokeTyped, setRevokeTyped] = useState("");

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

  async function handleCreate(e) {
    e?.preventDefault?.();
    if (!canEdit || busy) return;
    const name = nameDraft.trim();
    if (!name) {
      setMsg("ใส่ชื่อ key ก่อนสร้าง");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const data = await apiJson("/api/profit/razer/bot/config/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
        fallbackError: "สร้าง Secret Key ไม่สำเร็จ",
      });
      setConfig(data.botApi);
      setFreshKey({ secretKey: data.secretKey, name: data.key?.name || name });
      setNameDraft("");
      setMsg("คัดลอก Secret Key ไปใช้กับบอท — จะไม่แสดงอีกครั้ง");
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  function openRevoke(key) {
    if (!canEdit || busy) return;
    setRevokeTyped("");
    setRevokeTarget(key);
  }

  function closeRevoke() {
    if (busy) return;
    setRevokeTarget(null);
    setRevokeTyped("");
  }

  async function handleRevoke() {
    if (!canEdit || !revokeTarget) return;
    if (revokeTyped.trim() !== REVOKE_CONFIRM) return;
    setBusy(true);
    setMsg("");
    try {
      const data = await apiJson(`/api/profit/razer/bot/config/keys/${revokeTarget.id}`, {
        method: "DELETE",
        fallbackError: "ยกเลิก Secret Key ไม่สำเร็จ",
      });
      setConfig(data.botApi);
      if (freshKey?.secretKey?.startsWith(String(revokeTarget.keyPrefix || "").replace(/…$/, ""))) {
        setFreshKey(null);
      }
      setMsg(`ยกเลิก key “${revokeTarget.name}” แล้ว`);
      closeRevoke();
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

  const apiUrl = origin ? `${origin}/api/profit/razer/bot/accounts` : "/api/profit/razer/bot/accounts";
  const keys = config?.keys || [];
  const active = Boolean(config?.enabled && config?.hasKey);
  const revokeReady = revokeTyped.trim() === REVOKE_CONFIRM;

  return (
    <div className="rounded-xl border border-ll-hairline bg-ll-surface-1 p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Code2 size={18} className="text-ll-ink-subtle" />
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ll-ink-tertiary">Developer API</p>
            <p className="mt-0.5 text-[12px] text-ll-ink-subtle">
              คีย์ sk_live_… สำหรับบอท — สร้างทีละอันได้หลายตัว (key เก่าไม่ถูกลบตอนสร้างใหม่)
            </p>
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

      {canEdit && (
        <form onSubmit={handleCreate} className="mt-4 flex flex-wrap items-end gap-2">
          <label className="min-w-[180px] flex-1 text-[11px] text-ll-ink-tertiary">
            ชื่อ
            <input
              type="text"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              className={`${profitInputClass} mt-1`}
              placeholder="เช่น Bot OTP / Undawn GL"
              disabled={busy}
              maxLength={80}
            />
          </label>
          <button
            type="submit"
            disabled={busy || !nameDraft.trim()}
            className="inline-flex h-9 items-center justify-center rounded-md bg-ll-primary px-4 text-[13px] font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : "สร้าง"}
          </button>
        </form>
      )}

      {freshKey && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
          <p className="text-[11px] font-medium text-amber-800">
            Secret Key ใหม่ — {freshKey.name} (แสดงครั้งเดียว)
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all font-mono text-[12px] text-amber-950">{freshKey.secretKey}</code>
            <button
              type="button"
              title="Copy"
              onClick={() => copyText(freshKey.secretKey)}
              className="shrink-0 rounded p-1 text-amber-800 hover:bg-amber-100"
            >
              <Copy size={14} />
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 divide-y divide-ll-hairline rounded-lg border border-ll-hairline">
        {loading ? (
          <p className="flex items-center gap-2 px-3 py-4 text-[12px] text-ll-ink-subtle">
            <Loader2 size={14} className="animate-spin" /> กำลังโหลด…
          </p>
        ) : keys.length === 0 && !config?.envKeyPrefix ? (
          <p className="px-3 py-4 text-[12px] text-ll-ink-tertiary">ยังไม่มี Secret Key — สร้างด้านบน</p>
        ) : (
          <>
            {keys.map((key) => (
              <div key={key.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-ll-ink">{key.name}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-ll-ink-subtle">
                    {key.keyPrefix}
                    {key.createdAt ? ` · ${fmtWhen(key.createdAt)}` : ""}
                  </p>
                </div>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => openRevoke(key)}
                    disabled={busy}
                    className="shrink-0 text-[12px] font-medium text-red-600 hover:underline disabled:opacity-50"
                  >
                    ยกเลิก
                  </button>
                )}
              </div>
            ))}
            {config?.envKeyPrefix && (
              <div className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-ll-ink">RAZER_BOT_API_KEY (env)</p>
                  <p className="mt-0.5 font-mono text-[11px] text-ll-ink-subtle">{config.envKeyPrefix}</p>
                </div>
                <span className="shrink-0 text-[11px] text-ll-ink-tertiary">จาก .env</span>
              </div>
            )}
          </>
        )}
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
          ?zone=CAD&amp;status=ACTIVE — บอทใช้ได้เฉพาะ Active
        </p>
      </div>

      {msg && <p className="mt-3 text-[12px] text-ll-primary-subtle-text">{msg}</p>}

      <div className="mt-4 rounded-lg bg-ll-surface-2/60 px-3 py-2.5 text-[11px] text-ll-ink-subtle">
        <p className="font-medium text-ll-ink">Header</p>
        <code className="mt-1 block font-mono">Authorization: Bearer &lt;secret_key&gt;</code>
        <p className="mt-2">Response มี email, password, tfaSecret, otp (จาก 2FA), zone, status, goldBalance</p>
        <p className="mt-1 font-mono text-[10px]">GET /bot/accounts — รายการเร็ว (เฉพาะ Active ที่บอทใช้ได้)</p>
        <p className="mt-1 font-mono text-[10px]">POST /bot/pick หรือ /accounts/:id/use — มาร์กกำลังส่งเติม Twocard/AZ (+ platform)</p>
        <p className="mt-1 font-mono text-[10px]">POST .../release หรือ /report — ปล่อยกลับ Active + sync ยอด</p>
        <p className="mt-1 font-mono text-[10px]">GET /bot/otp?email=... — OTP บัญชีเดียว</p>
        <p className="mt-1">ปิด/เปิดบัญชีทีละรายการได้ที่คอลัมน์ Bot API ในตารางด้านล่าง</p>
      </div>

      {revokeTarget && (
        <ProfitModal
          title={`ยกเลิก key — ${revokeTarget.name}`}
          onClose={closeRevoke}
          actions={
            <button
              type="button"
              onClick={handleRevoke}
              disabled={!revokeReady || busy}
              className="rounded-md bg-red-600 px-3.5 py-2 text-[12px] font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "กำลังยกเลิก…" : "ยกเลิก Key"}
            </button>
          }
        >
          <p className="text-[13px] text-ll-ink">
            บอทที่ใช้ <span className="font-mono">{revokeTarget.keyPrefix}</span> จะเรียก API ไม่ได้อีก
            — key อื่นยังใช้ได้ตามปกติ
          </p>
          <ProfitField label={`พิมพ์ ${REVOKE_CONFIRM} เพื่อยืนยัน`}>
            <input
              type="text"
              value={revokeTyped}
              onChange={(e) => setRevokeTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && revokeReady && !busy) handleRevoke();
              }}
              className={`${profitInputClass} font-mono`}
              placeholder={REVOKE_CONFIRM}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
            />
          </ProfitField>
        </ProfitModal>
      )}
    </div>
  );
}
