"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Database,
  Gamepad2,
  Link2,
  Loader2,
  Lock,
  LogOut,
  User,
  Users,
  X,
} from "lucide-react";
import NextLink from "next/link";
import { apiJson } from "@/lib/api-json";
import TurnstileWidget from "@/components/turnstile-widget";
import { UsersModal } from "@/components/gamedb-modals";
import SsoMapModal from "@/components/sso-map-modal";

// Public by design: it is only where the "เข้าสู่ระบบด้วยบัญชี experience" button
// points the browser, never anything the server trusts on its own.
const HIRING_BASE_URL = (process.env.NEXT_PUBLIC_HIRING_BASE_URL || "").replace(/\/+$/, "");

// Keyed by the ?ssoError= codes /api/sso/from-hiring redirects back with
// (see src/lib/hiring-sso.js and src/app/api/sso/from-hiring/route.js for
// where each one is produced). Kept as its own copy here, not imported from
// hiring-sso.js, so this client bundle never pulls in that module's
// server-only secret getters.
const SSO_ERROR_MESSAGES = {
  missing_code: 'ลิงก์เข้าสู่ระบบไม่สมบูรณ์ กรุณาลองใหม่จากปุ่ม "เข้าสู่ระบบด้วยบัญชี experience"',
  code_rejected: "รหัสเข้าสู่ระบบหมดอายุหรือถูกใช้ไปแล้ว กรุณาลองใหม่",
  exchange_failed: "ติดต่อระบบ experience ไม่สำเร็จ กรุณาลองใหม่ภายหลัง",
  provision_failed: "สร้างบัญชี gamedb ให้อัตโนมัติไม่สำเร็จ กรุณาลองใหม่ หรือแจ้ง Admin",
};

export default function GamedbPage() {
  const [me, setMe] = useState(null);
  const [checkingMe, setCheckingMe] = useState(true);

  useEffect(() => {
    apiJson("/api/me", { fallbackError: "ตรวจสอบสิทธิ์ไม่สำเร็จ" })
      .then((data) => setMe(data.user))
      .catch(() => setMe(null))
      .finally(() => setCheckingMe(false));
  }, []);

  if (checkingMe) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="flex animate-pulse items-center gap-1 text-sm font-bold text-zinc-500">
          <Loader2 size={16} className="animate-spin" /> กำลังตรวจสอบสิทธิ์...
        </span>
      </div>
    );
  }

  if (!me) {
    return <LoginScreen onLoggedIn={setMe} />;
  }

  return <SystemHub me={me} onLoggedOut={() => setMe(null)} />;
}

// Both are their own route now (System DB used to be a client-state toggle on
// this page; GameInfo already lived at its own URL), so a hub visit, a
// bookmark, and the browser's back button all agree on where you are.
const SYSTEMS = [
  {
    key: "systemdb",
    label: "System DB",
    desc: "ฐานข้อมูลหลัก จัดการตาราง คิวรี และมุมมอง",
    icon: Database,
    href: "/systemdb",
  },
  {
    key: "gameinfo",
    label: "GameInfo",
    desc: "ฐานข้อมูลการเติมเกม",
    icon: Gamepad2,
    href: "/gameinfo/th",
  },
];

function SystemHub({ me, onLoggedOut }) {
  const isSuperAdmin = me.role === "admin";
  const isTemplateUser = me.role === "user";
  const [usersModal, setUsersModal] = useState(false);
  const [ssoMapModal, setSsoMapModal] = useState(false);

  const logout = async () => {
    try {
      await apiJson("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore — cookie clear is best-effort, drop local state either way
    }
    onLoggedOut();
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-50 px-4 px-8">
      <div className="flex w-full max-w-2xl items-center justify-between rounded-sm border border-zinc-200 bg-white px-4 py-3">
        <div className="flex items-center gap-1">
          <User size={13} className="text-zinc-500" />
          <div className="text-[10px] font-semibold leading-tight">
            <p className="font-black text-zinc-800">{me.displayName || me.username}</p>
            <p className="text-zinc-500">
              {isSuperAdmin ? "Admin" : isTemplateUser ? "User · Template" : "Staff"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {isSuperAdmin && (
            <button
              type="button"
              onClick={() => setUsersModal(true)}
              className="flex items-center gap-1 rounded-sm border border-zinc-200 bg-white px-3 py-1 text-xs font-black text-zinc-600 transition hover:bg-zinc-50"
            >
              <Users size={14} /> จัดการสิทธิ์ผู้ใช้
            </button>
          )}
          {isSuperAdmin && (
            <button
              type="button"
              onClick={() => setSsoMapModal(true)}
              className="flex items-center gap-1 rounded-sm border border-zinc-200 bg-white px-3 py-1 text-xs font-black text-zinc-600 transition hover:bg-zinc-50"
            >
              <Link2 size={14} /> เชื่อมกับบัญชี experience
            </button>
          )}
          <button
            type="button"
            onClick={logout}
            title="ออกจากระบบ"
            className="rounded-sm border border-zinc-200 bg-white p-2 text-zinc-500 transition hover:bg-red-50 hover:text-red-600"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>

      <div className="w-full max-w-2xl">
        <h1 className="mb-4 text-lg font-black text-zinc-800">เลือกระบบที่ต้องการเข้าใช้งาน</h1>
        <div className="grid gap-1 sm:grid-cols-2">
          {SYSTEMS.map((system) => {
            const Icon = system.icon;
            return (
              <NextLink
                key={system.key}
                href={system.href}
                className="flex items-center gap-1 rounded-sm border border-zinc-200 bg-white p-4 text-left transition hover:border-zinc-300 hover:bg-zinc-50"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-sm bg-zinc-100 text-zinc-600">
                  <Icon size={18} />
                </span>
                <span className="text-left">
                  <span className="block text-sm font-black text-zinc-800">{system.label}</span>
                  <span className="block text-xs text-zinc-500">{system.desc}</span>
                </span>
              </NextLink>
            );
          })}
        </div>
      </div>

      {usersModal && <UsersModal me={me} onClose={() => setUsersModal(false)} />}
      {ssoMapModal && <SsoMapModal onClose={() => setSsoMapModal(false)} />}
    </div>
  );
}

function LoginScreen({ onLoggedIn }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [ssoError, setSsoError] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileAttempt, setTurnstileAttempt] = useState(0);
  const [turnstileConfig, setTurnstileConfig] = useState({
    loading: true,
    enabled: false,
    misconfigured: false,
    siteKey: "",
    error: "",
  });

  useEffect(() => {
    let active = true;
    apiJson("/api/auth/config", {
      fallbackError: "โหลดระบบตรวจสอบความปลอดภัยไม่สำเร็จ",
    })
      .then((data) => {
        if (!active) return;
        setTurnstileConfig({
          loading: false,
          enabled: Boolean(data.turnstileEnabled),
          misconfigured: Boolean(data.turnstileMisconfigured),
          siteKey: String(data.turnstileSiteKey || ""),
          error: "",
        });
      })
      .catch((err) => {
        if (!active) return;
        setTurnstileConfig({
          loading: false,
          enabled: false,
          misconfigured: false,
          siteKey: "",
          error: err.message,
        });
      });
    return () => {
      active = false;
    };
  }, []);

  // /api/sso/from-hiring bounces back here with ?ssoError=... when the hiring
  // login bridge could not complete. Read once and drop the param so a
  // refresh does not keep re-showing a message about an attempt that is over.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("ssoError");
    if (!code) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading a one-shot URL param is exactly what an effect is for
    setSsoError(SSO_ERROR_MESSAGES[code] || "เข้าสู่ระบบด้วยบัญชี experience ไม่สำเร็จ");
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  // Built from window.location, so it has to wait for the client: computing
  // it during the server render (this component ships to the client, but
  // still renders once on the server first) would throw on the missing
  // `window`.
  const [hiringSsoUrl, setHiringSsoUrl] = useState("");
  useEffect(() => {
    if (!HIRING_BASE_URL) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- window.location is only known once mounted on the client
    setHiringSsoUrl(
      `${HIRING_BASE_URL}/api/sso/gamedb?return=${encodeURIComponent(
        `${window.location.origin}/api/sso/from-hiring`
      )}`
    );
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    if (
      turnstileConfig.loading ||
      turnstileConfig.error ||
      turnstileConfig.misconfigured ||
      (turnstileConfig.enabled && !turnstileToken)
    ) {
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const data = await apiJson("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, turnstileToken }),
        fallbackError: "เข้าสู่ระบบไม่สำเร็จ",
      });
      onLoggedIn(data.user);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
      if (turnstileConfig.enabled) {
        setTurnstileToken("");
        setTurnstileAttempt((attempt) => attempt + 1);
      }
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-sm border border-zinc-200 bg-white p-6 shadow-sm"
      >
        <div className="mb-5 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-sm border border-red-200 bg-red-600/10 text-red-600">
            <Lock size={26} />
          </div>
          <h1 className="text-lg font-black tracking-tight">GameDB</h1>
          <p className="mt-1 text-[11px] font-semibold text-zinc-500">
            เข้าสู่ระบบด้วยบัญชี GameDB
          </p>
        </div>

        <label className="mb-1 block text-[10px] font-black text-zinc-500">Username</label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoFocus
          className="mb-3 h-10 w-full rounded-sm border border-zinc-200 bg-zinc-50 px-3 text-xs font-semibold outline-none focus:border-red-600 focus:bg-white"
        />
        <label className="mb-1 block text-[10px] font-black text-zinc-500">รหัสผ่าน</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          className="mb-4 h-10 w-full rounded-sm border border-zinc-200 bg-zinc-50 px-3 text-xs font-semibold outline-none focus:border-red-600 focus:bg-white"
        />

        {turnstileConfig.enabled && (
          <div className="mb-3">
            <TurnstileWidget
              key={turnstileAttempt}
              siteKey={turnstileConfig.siteKey}
              onToken={setTurnstileToken}
            />
          </div>
        )}

        {(turnstileConfig.error || turnstileConfig.misconfigured) && (
          <div className="mb-3 rounded-sm border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-700">
            {turnstileConfig.misconfigured
              ? "ระบบ Turnstile ยังตั้งค่าไม่ครบ กรุณาติดต่อผู้ดูแล"
              : turnstileConfig.error}
          </div>
        )}

        {error && (
          <div className="mb-3 rounded-sm border border-red-200 bg-red-50 px-3 py-1 text-[11px] font-bold text-red-600">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={
            submitting ||
            !username.trim() ||
            !password ||
            turnstileConfig.loading ||
            Boolean(turnstileConfig.error) ||
            turnstileConfig.misconfigured ||
            (turnstileConfig.enabled && !turnstileToken)
          }
          className="flex h-10 w-full items-center justify-center gap-1 rounded-sm bg-red-600 text-xs font-black text-white transition hover:bg-red-700 disabled:opacity-50"
        >
          {submitting ? <Loader2 size={14} className="animate-spin" /> : <Lock size={13} />}
          เข้าสู่ระบบ
        </button>

        {hiringSsoUrl && (
          <>
            <div className="my-4 flex items-center gap-2 text-[9px] font-black uppercase tracking-wider text-zinc-300">
              <span className="h-px flex-1 bg-zinc-200" />
              หรือ
              <span className="h-px flex-1 bg-zinc-200" />
            </div>
            <a
              href={hiringSsoUrl}
              className="flex h-10 w-full items-center justify-center gap-1.5 rounded-sm border border-zinc-200 text-xs font-black text-zinc-600 transition hover:bg-zinc-50"
            >
              เข้าสู่ระบบด้วยบัญชี experience
            </a>
          </>
        )}
      </form>

      {ssoError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-sm bg-white p-5 text-center shadow-xl">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-sm border border-red-200 bg-red-50 text-red-600">
              <AlertTriangle size={22} />
            </div>
            <h2 className="mb-1 text-sm font-black text-zinc-800">เข้าสู่ระบบด้วยบัญชี experience ไม่สำเร็จ</h2>
            <p className="mb-4 text-[11px] font-semibold leading-relaxed text-zinc-500">{ssoError}</p>
            <button
              type="button"
              onClick={() => setSsoError("")}
              className="flex h-9 w-full items-center justify-center gap-1.5 rounded-sm bg-red-600 text-xs font-black text-white transition hover:bg-red-700"
            >
              <X size={13} /> ปิด
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
