"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useParams } from "next/navigation";
import { AlertTriangle, Database, Table2, X } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { DEFAULT_ITUNE_RELEASE_THRESHOLD } from "@/lib/itune-status";
import { useItuneSettings } from "@/lib/itune-settings";

export default function ItuneAdminSettingsDrawer({ onClose }) {
  const { lang } = useParams();
  const [settings, setSetting] = useItuneSettings();
  const [queueSettings, setQueueSettings] = useState({
    maxAmount: String(DEFAULT_ITUNE_RELEASE_THRESHOLD),
    targetHours: "24",
    burnRateUsdPerHour: "50",
    expectedIdleHours: "6",
    claimWarningHours: "32",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const closeRef = useRef(null);
  const drawerRef = useRef(null);

  useEffect(() => {
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = drawerRef.current?.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    apiJson("/api/projectm/itune/release-settings", {
      fallbackError: "โหลดการตั้งค่ารับ/คืนเมลไม่สำเร็จ",
    })
      .then((data) => {
        if (!cancelled) {
          setQueueSettings({
            maxAmount: String(data.maxAmount ?? DEFAULT_ITUNE_RELEASE_THRESHOLD),
            targetHours: String(data.targetHours ?? 24),
            burnRateUsdPerHour: String(data.burnRateUsdPerHour ?? 50),
            expectedIdleHours: String(data.expectedIdleHours ?? 6),
            claimWarningHours: String(data.claimWarningHours ?? 32),
          });
        }
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
  }, []);

  const numericSettings = Object.fromEntries(
    Object.entries(queueSettings).map(([key, value]) => [key, Number(value)])
  );
  const settingsValid =
    Object.values(numericSettings).every(Number.isFinite) &&
    numericSettings.maxAmount >= 0 &&
    numericSettings.targetHours > 0 &&
    numericSettings.burnRateUsdPerHour > 0 &&
    numericSettings.expectedIdleHours >= 0 &&
    numericSettings.claimWarningHours >= numericSettings.targetHours;

  function changeQueueSetting(key, value) {
    setQueueSettings((current) => ({ ...current, [key]: value }));
  }

  async function saveQueueSettings() {
    if (!settingsValid) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const data = await apiJson("/api/projectm/itune/release-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(numericSettings),
        fallbackError: "บันทึกการตั้งค่าคิวไม่สำเร็จ",
      });
      setQueueSettings({
        maxAmount: String(data.maxAmount),
        targetHours: String(data.targetHours),
        burnRateUsdPerHour: String(data.burnRateUsdPerHour),
        expectedIdleHours: String(data.expectedIdleHours),
        claimWarningHours: String(data.claimWarningHours),
      });
      setMessage("บันทึกกฎคิวแล้ว");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function clearLogs() {
    const reason = window.prompt("ระบุเหตุผลที่ล้างประวัติ (ระบบจะเก็บผู้ล้าง เวลา เหตุผล และจำนวนรายการ)");
    if (!reason?.trim()) return;
    if (!window.confirm("ยืนยันล้างประวัติทั้งหมด? รายการเมลจะไม่ถูกลบ")) return;
    setClearing(true);
    setError("");
    setMessage("");
    try {
      await apiJson("/api/projectm/itune/dev-clear-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
        fallbackError: "ลบ Log ไม่สำเร็จ",
      });
      window.dispatchEvent(new Event("itune:logs-cleared"));
      setMessage("ลบ Log ทั้งหมดแล้ว");
    } catch (err) {
      setError(err.message);
    } finally {
      setClearing(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex justify-end bg-black/55"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="itune-settings-title"
        className="flex h-full w-full max-w-md flex-col border-l border-ll-hairline bg-ll-surface-1 shadow-[var(--ll-shadow-modal)] motion-safe:animate-in motion-safe:slide-in-from-right motion-reduce:transition-none"
      >
        <header className="flex items-center justify-between border-b border-ll-hairline px-5 py-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ll-ink-tertiary">
              ITUNE ADMIN
            </p>
            <h2 id="itune-settings-title" className="mt-1 text-lg font-semibold text-ll-ink">
              ตั้งค่า
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-md text-ll-ink-subtle hover:bg-ll-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ll-primary"
            aria-label="ปิดการตั้งค่า"
          >
            <X size={17} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <section className="border-b border-ll-hairline p-5">
            <a href={`/projectm/${lang}/itune/admin/order-links`} className="text-sm font-semibold text-ll-ink underline">เชื่อมบัญชี Orders และดูประวัติการใช้เมล (Super Admin)</a>
          </section>
          <section className="border-b border-ll-hairline p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-ll-ink">
              <Table2 size={16} /> ตาราง
            </div>
            <div className="mt-4 space-y-4">
              <SettingToggle
                checked={settings.rightClickPaste}
                onChange={(checked) => setSetting("rightClickPaste", checked)}
                label="วางข้อมูลด้วยคลิกขวา"
                detail="วางรูปหรือข้อมูลจากคลิปบอร์ดลงช่องที่รองรับได้ทันที"
              />
              <SettingToggle
                checked={settings.copyButtonsEnabled}
                onChange={(checked) => setSetting("copyButtonsEnabled", checked)}
                label="ปุ่มคัดลอกข้อมูลรายช่อง"
                detail="แสดงปุ่มคัดลอกเมื่อวางเมาส์บนแถว โดยเมนูคัดลอกทั้งแถวยังใช้ได้เสมอ"
              />
            </div>
          </section>

          <section className="border-b border-ll-hairline p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-ll-ink">
              <Database size={16} /> กฎรับ/คืนเมล
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <QueueNumberSetting
                label="เกณฑ์ใช้หมด (USD)"
                value={queueSettings.maxAmount}
                onChange={(value) => changeQueueSetting("maxAmount", value)}
                step="0.01"
              />
              <QueueNumberSetting
                label="เป้าหมายใช้หมด (ชม.)"
                value={queueSettings.targetHours}
                onChange={(value) => changeQueueSetting("targetHours", value)}
              />
              <QueueNumberSetting
                label="อัตราใช้ (USD/ชม.)"
                value={queueSettings.burnRateUsdPerHour}
                onChange={(value) => changeQueueSetting("burnRateUsdPerHour", value)}
              />
              <QueueNumberSetting
                label="เวลารอคนถัดไป (ชม.)"
                value={queueSettings.expectedIdleHours}
                onChange={(value) => changeQueueSetting("expectedIdleHours", value)}
              />
              <QueueNumberSetting
                label="เตือนตรวจ/เคลม (ชม.)"
                value={queueSettings.claimWarningHours}
                onChange={(value) => changeQueueSetting("claimWarningHours", value)}
              />
            </div>
            <p className="mt-3 text-[11px] leading-5 text-ll-ink-subtle">
              ต่ำกว่าเกณฑ์เท่านั้นจึงถือว่าใช้หมด; เท่ากับหรือสูงกว่ายังใช้ต่อได้ คิวอัตโนมัติคำนวณจากอายุ ยอด อัตราใช้ และเวลารอ
            </p>
            {!settingsValid && (
              <p className="mt-2 text-[11px] text-ll-primary-subtle-text">
                ตรวจค่าตัวเลข และตั้งเวลาเตือนเคลมไม่น้อยกว่าเวลาเป้าหมาย
              </p>
            )}
            <button
              type="button"
              onClick={saveQueueSettings}
              disabled={loading || saving || !settingsValid}
              className="mt-3 h-9 rounded-md bg-ll-primary px-4 text-[13px] font-medium text-ll-on-primary hover:bg-ll-primary-hover disabled:opacity-50"
            >
              {saving ? "กำลังบันทึก..." : "บันทึกกฎคิว"}
            </button>
          </section>

          <section className="p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-ll-ink">
              <AlertTriangle size={16} /> ขั้นสูง
            </div>
            <div className="mt-4 rounded-md border border-ll-primary/25 bg-ll-primary-subtle-bg p-4">
              <p className="text-[13px] font-medium text-ll-primary-subtle-text">ลบ Log ทั้งหมด (Dev)</p>
              <p className="mt-1 text-[11px] leading-5 text-ll-ink-subtle">
                ลบประวัติรับ–คืน ยอด ปัญหา และการแก้ข้อมูล โดยยังเก็บหลักฐานว่าใครล้าง เมื่อไร และเพราะอะไร
              </p>
              <button
                type="button"
                onClick={clearLogs}
                disabled={clearing}
                className="mt-3 rounded-md border border-ll-primary/35 px-3 py-2 text-[12px] font-medium text-ll-primary-subtle-text hover:bg-ll-primary/10 disabled:opacity-50"
              >
                {clearing ? "กำลังลบ..." : "ลบ Log ทั้งหมด"}
              </button>
            </div>
          </section>
        </div>

        {(error || message) && (
          <div
            role="status"
            className={`border-t border-ll-hairline px-5 py-3 text-[12px] ${
              error ? "text-ll-primary-subtle-text" : "text-ll-success"
            }`}
          >
            {error || message}
          </div>
        )}
      </section>
    </div>,
    document.body
  );
}

function QueueNumberSetting({ label, value, onChange, step = "0.1" }) {
  return (
    <label className="block text-[12px] font-medium text-ll-ink">
      {label}
      <input
        type="number"
        min="0"
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-9 w-full rounded-md border border-ll-hairline-strong bg-ll-surface-2 px-3 text-sm text-ll-ink outline-none focus:border-ll-primary"
      />
    </label>
  );
}

function SettingToggle({ checked, onChange, label, detail }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 accent-ll-primary"
      />
      <span>
        <span className="block text-[13px] font-medium text-ll-ink">{label}</span>
        <span className="mt-0.5 block text-[11px] leading-5 text-ll-ink-subtle">{detail}</span>
      </span>
    </label>
  );
}
