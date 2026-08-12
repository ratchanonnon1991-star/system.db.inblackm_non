"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Database,
  Gamepad2,
  History,
  Layers,
  Link2,
  Loader2,
  Lock,
  LogOut,
  Table2,
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
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-zinc-50 to-zinc-100">
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
  const [views, setViews] = useState([]);
  const [viewsLoading, setViewsLoading] = useState(true);

  // /api/views already filters to what this account can see (admins get
  // everything, everyone else gets public + shared-with-them + their
  // assigned default) -- the hub just links straight into /view/<id> for
  // each one instead of making people open System DB first.
  useEffect(() => {
    apiJson("/api/views", { fallbackError: "โหลดเทมเพลตหน้าจอไม่สำเร็จ" })
      .then((data) => setViews((data.views || []).filter((view) => view.config?.panels?.length)))
      .catch(() => setViews([]))
      .finally(() => setViewsLoading(false));
  }, []);

  const logout = async () => {
    try {
      await apiJson("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore — cookie clear is best-effort, drop local state either way
    }
    onLoggedOut();
  };

  const roleLabel = isSuperAdmin ? "Admin" : isTemplateUser ? "User" : "Staff";
  const initial = (me.displayName || me.username || "?").trim().slice(0, 1).toUpperCase();

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-zinc-100">
      <header className="border-b border-zinc-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-600 text-sm font-black text-white">
              {initial}
            </span>
            <div className="text-[11px] font-semibold leading-tight">
              <p className="text-sm font-black text-zinc-800">{me.displayName || me.username}</p>
              <p
                className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide ${
                  isSuperAdmin ? "bg-red-100 text-red-700" : "bg-zinc-100 text-zinc-500"
                }`}
              >
                {roleLabel}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {isSuperAdmin && (
              <button
                type="button"
                onClick={() => setUsersModal(true)}
                className="flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-black text-zinc-600 transition hover:border-zinc-300 hover:bg-zinc-50"
              >
                <Users size={13} /> จัดการสิทธิ์ผู้ใช้
              </button>
            )}
            {isSuperAdmin && (
              <button
                type="button"
                onClick={() => setSsoMapModal(true)}
                className="flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-black text-zinc-600 transition hover:border-zinc-300 hover:bg-zinc-50"
              >
                <Link2 size={13} /> เชื่อมกับบัญชี experience
              </button>
            )}
            {isSuperAdmin && (
              <NextLink
                href="/log"
                className="flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-black text-zinc-600 transition hover:border-zinc-300 hover:bg-zinc-50"
                title="ประวัติการใช้งาน (การเข้าสู่ระบบ / แก้ไขข้อมูล)"
              >
                <History size={13} /> ประวัติการใช้งาน
              </NextLink>
            )}
            {isSuperAdmin && (
              <NextLink
                href="/createdb"
                className="flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-black text-zinc-600 transition hover:border-zinc-300 hover:bg-zinc-50"
                title="สร้างตารางใหม่ / เพิ่มคอลัมน์ในตารางเดิม"
              >
                <Table2 size={13} /> สร้างตาราง/คอลัมน์
              </NextLink>
            )}
            <button
              type="button"
              onClick={logout}
              title="ออกจากระบบ"
              className="rounded-full border border-zinc-200 bg-white p-2 text-zinc-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12 sm:px-6">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-zinc-800">
            สวัสดี, {me.displayName || me.username} 👋
          </h1>
          <p className="mt-1 text-sm font-semibold text-zinc-500">
            {isTemplateUser ? "เลือกหน้าจอที่ต้องการเข้าใช้งาน" : "เลือกระบบที่ต้องการเข้าใช้งาน"}
          </p>
        </div>

        {/* A "user" (template-only) account has nothing else on this hub --
            System DB and GameInfo are both ad-hoc query surfaces it has no
            access to, so showing the tiles only to invite a 403 click was
            worse than just leaving them out. */}
        {!isTemplateUser && (
          <div className="grid gap-4 sm:grid-cols-2">
            {SYSTEMS.map((system) => {
              const Icon = system.icon;
              const accent =
                system.key === "systemdb"
                  ? "bg-red-50 text-red-600 group-hover:bg-red-600 group-hover:text-white"
                  : "bg-sky-50 text-sky-600 group-hover:bg-sky-600 group-hover:text-white";
              return (
                <NextLink
                  key={system.key}
                  href={system.href}
                  className="group flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md"
                >
                  <span
                    className={`flex h-12 w-12 items-center justify-center rounded-xl transition-colors ${accent}`}
                  >
                    <Icon size={22} />
                  </span>
                  <span>
                    <span className="block text-base font-black text-zinc-800">{system.label}</span>
                    <span className="mt-0.5 block text-xs font-semibold leading-relaxed text-zinc-500">
                      {system.desc}
                    </span>
                  </span>
                </NextLink>
              );
            })}
          </div>
        )}

        {/* Deliberately not another tile in the SYSTEMS grid above: a template
            is a saved arrangement of panels inside System DB, not a system of
            its own the way GameInfo is, and this section is styled to read as
            "shortcuts into System DB" (its own card, a lighter row style, an
            explicit "เทมเพลต" tag) rather than a peer entry a user could
            confuse for a third top-level system. For a "user" account this
            list is the entire hub, not a shortcut past it -- there is no
            System DB tile behind it to shortcut into.
            An empty list still renders for a "user" account (unlike everyone
            else, where nothing here just means "no templates yet, nothing
            worth mentioning") since a User with nothing assigned has no other
            way in at all, and that is worth saying plainly rather than
            leaving the page looking simply blank/broken. */}
        {(viewsLoading || views.length > 0 || isTemplateUser) && (
          <div>
            <h2 className="mb-2.5 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-zinc-400">
              <Layers size={12} />{" "}
              {isTemplateUser ? "หน้าจอของคุณ" : "ทางลัดเข้าเทมเพลตหน้าจอ (อยู่ใน System DB)"}
            </h2>
            <div className="rounded-2xl border border-zinc-200 bg-white p-2 shadow-sm">
              {viewsLoading ? (
                <p className="flex items-center gap-2 px-3 py-3 text-xs font-bold text-zinc-400">
                  <Loader2 size={13} className="animate-spin" /> กำลังโหลด...
                </p>
              ) : views.length === 0 ? (
                <p className="px-3 py-4 text-center text-xs font-semibold text-zinc-400">
                  ยังไม่มีหน้าจอที่กำหนดให้บัญชีนี้ — ติดต่อผู้ดูแลระบบ
                </p>
              ) : (
                <div className="divide-y divide-zinc-100">
                  {views.map((view) => (
                    <NextLink
                      key={view.id}
                      href={`/view/${view.id}`}
                      className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition hover:bg-zinc-50"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-500">
                        <Layers size={14} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 truncate text-xs font-black text-zinc-700">
                          {view.name}
                          {view.isDefault && (
                            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-black text-amber-700">
                              หน้าเริ่มต้น
                            </span>
                          )}
                          {view.isReadOnly && (
                            <span className="rounded-full bg-zinc-200 px-1.5 py-0.5 text-[9px] font-black text-zinc-600">
                              ดูอย่างเดียว
                            </span>
                          )}
                        </span>
                        <span className="block truncate text-[10px] text-zinc-400">
                          {view.description || `${view.config?.panels?.length || 0} ตาราง`}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-zinc-500">
                        เทมเพลต
                      </span>
                    </NextLink>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

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
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-zinc-50 to-zinc-100 p-6">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-7 shadow-lg"
      >
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-600 text-white shadow-sm shadow-red-600/30">
            <Lock size={24} />
          </div>
          <h1 className="text-lg font-black tracking-tight text-zinc-800">GameDB</h1>
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
          className="mb-3.5 h-11 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 text-xs font-semibold outline-none transition focus:border-red-500 focus:bg-white focus:ring-2 focus:ring-red-500/10"
        />
        <label className="mb-1 block text-[10px] font-black text-zinc-500">รหัสผ่าน</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          className="mb-4 h-11 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 text-xs font-semibold outline-none transition focus:border-red-500 focus:bg-white focus:ring-2 focus:ring-red-500/10"
        />

        {turnstileConfig.enabled && (
          <div className="mb-3.5">
            <TurnstileWidget
              key={turnstileAttempt}
              siteKey={turnstileConfig.siteKey}
              onToken={setTurnstileToken}
            />
          </div>
        )}

        {(turnstileConfig.error || turnstileConfig.misconfigured) && (
          <div className="mb-3.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[11px] font-bold text-amber-700">
            {turnstileConfig.misconfigured
              ? "ระบบ Turnstile ยังตั้งค่าไม่ครบ กรุณาติดต่อผู้ดูแล"
              : turnstileConfig.error}
          </div>
        )}

        {error && (
          <div className="mb-3.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-[11px] font-bold text-red-600">
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
          className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-red-600 text-xs font-black text-white shadow-sm shadow-red-600/20 transition hover:bg-red-700 hover:shadow-md disabled:opacity-50 disabled:shadow-none"
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
              className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-zinc-200 text-xs font-black text-zinc-600 transition hover:border-zinc-300 hover:bg-zinc-50"
            >
              เข้าสู่ระบบด้วยบัญชี experience
            </a>
          </>
        )}
      </form>

      {ssoError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
              <AlertTriangle size={22} />
            </div>
            <h2 className="mb-1 text-sm font-black text-zinc-800">เข้าสู่ระบบด้วยบัญชี experience ไม่สำเร็จ</h2>
            <p className="mb-4 text-[11px] font-semibold leading-relaxed text-zinc-500">{ssoError}</p>
            <button
              type="button"
              onClick={() => setSsoError("")}
              className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-red-600 text-xs font-black text-white transition hover:bg-red-700"
            >
              <X size={13} /> ปิด
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
