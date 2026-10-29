"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  Boxes,
  Copy,
  Database,
  Gamepad2,
  History,
  Layers,
  Loader2,
  Lock,
  LogOut,
  Moon,
  Radio,
  Search,
  Sun,
  Table2,
  User,
  Users,
  Wallet,
  X,
} from "lucide-react";
import NextLink from "next/link";
import { Inter, Lato, Noto_Sans_Thai } from "next/font/google";
import { apiJson } from "@/lib/api-json";
import TurnstileWidget from "@/components/turnstile-widget";
import { UsersModal } from "@/components/gamedb-modals";
import LLThemeToggle from "@/components/ll-theme-toggle";
import { useLLTheme } from "@/lib/ll-theme";
import { hasPermission } from "@/lib/permissions";

// Linear Light/Dark Mode type (see ~/.claude/skills/linear-light-dark-mode):
// Inter at weight 400-700 substitutes for the proprietary Linear
// Display/Text families, only on the login screen -- the
// authenticated workspace at /systemdb keeps its existing zinc/system-ui
// look untouched. Light is the default theme (the `ll-` token block in
// globals.css), with a user-toggleable dark mode that reuses Linear's
// original near-black palette -- see useLLTheme.
const linearSans = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-linear-sans",
});

// The post-login hub follows inblackm.com instead (see SystemHub): Lato for
// the wordmark and Latin copy, Noto Sans Thai for the Thai.
const ibLato = Lato({
  subsets: ["latin"],
  weight: ["400", "700", "900"],
  variable: "--font-ib-lato",
});
const ibThai = Noto_Sans_Thai({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-ib-thai",
});

// Public by design: it is only where the "เข้าสู่ระบบด้วยบัญชี TopUp" button
// points the browser, never anything the server trusts on its own. The
// hiring ("experience") sign-in is no longer offered; its route stays.
const TOPUP_BASE_URL = (process.env.NEXT_PUBLIC_TOPUP_BASE_URL || "").replace(/\/+$/, "");
const MOCK_SSO_ENABLED = process.env.NODE_ENV !== "production";

// Keyed by the ?ssoError= codes /api/sso/from-topup (and from-hiring)
// redirect back with. Kept as its own copy here, not imported from the
// server modules, so this client bundle never pulls in their secret getters.
const SSO_ERROR_MESSAGES = {
  missing_code: 'ลิงก์เข้าสู่ระบบไม่สมบูรณ์ กรุณาลองใหม่จากปุ่ม "เข้าสู่ระบบด้วยบัญชี TopUp"',
  code_rejected: "รหัสเข้าสู่ระบบหมดอายุหรือถูกใช้ไปแล้ว กรุณาลองใหม่",
  exchange_failed: "ติดต่อเว็บ TopUp ไม่สำเร็จ กรุณาลองใหม่ภายหลัง",
  topup_unavailable: "เว็บ TopUp ยืนยันบัญชีไม่สำเร็จ กรุณาลองใหม่ภายหลัง",
  not_staff: "บัญชี TopUp นี้ไม่ใช่ทีมงาน — ใช้ได้เฉพาะบัญชี admin หรือ staff",
  provision_failed: "สร้างบัญชีให้อัตโนมัติไม่สำเร็จ กรุณาลองใหม่ หรือแจ้ง Admin",
};

export default function GamedbPage() {
  const [me, setMe] = useState(null);
  const [checkingMe, setCheckingMe] = useState(true);

  const loadMe = useCallback(() =>
    apiJson("/api/me", { fallbackError: "ตรวจสอบสิทธิ์ไม่สำเร็จ" })
      .then((data) => setMe(data.user))
      .catch((error) => setMe((current) => error.status === 401 ? null : current))
      .finally(() => setCheckingMe(false)), []);

  useEffect(() => {
    loadMe();
    const refresh = () => loadMe();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [loadMe]);

  if (checkingMe) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ll-canvas">
        <span className="flex animate-pulse items-center gap-1 text-sm text-ll-ink-subtle">
          <Loader2 size={16} className="animate-spin" /> กำลังตรวจสอบสิทธิ์...
        </span>
      </div>
    );
  }

  if (!me) {
    return <LoginScreen onLoggedIn={setMe} />;
  }

  return <SystemHub me={me} onLoggedOut={() => setMe(null)} onPermissionsChanged={loadMe} />;
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
  {
    key: "projectm",
    label: "Topup Inventory",
    desc: "iTune, Moniepoint, USDCodashop และบริการอื่น ๆ",
    icon: Copy,
    href: "/projectm/th",
  },
  {
    key: "feed-social",
    label: "Feed Social",
    desc: "ติดตามโพสต์ Facebook ด้วย Rule และ Tag",
    icon: Radio,
    href: "/feed-social",
  },
  {
    key: "profit",
    label: "Profit",
    desc: "เช็คยอดขาย/ต้นทุน/กำไรบัตรเติมเงิน",
    icon: Wallet,
    href: "/profit",
  },
  {
    key: "stock",
    label: "Stock",
    desc: "ของที่ซื้อตุนไว้ รับเข้า ตัดออก และยอดคงเหลือ",
    icon: Boxes,
    href: "/stock",
  },
];

// The hub follows inblackm.com: a brand-red header (the same red in both
// themes), Lato 900 for the wordmark and headline, Noto Sans Thai for Thai
// copy. Everything below the header stays on the ll- tokens, so the dark
// theme still works without a second palette.
const BRAND_RED = "#D90005";

function matchesQuery(query, ...fields) {
  if (!query) return true;
  return fields.some((field) => String(field || "").toLowerCase().includes(query));
}

// The 3×3 block beside the headline, the hub's stand-in for inblackm.com's
// dice of game art: one cell per system, the rest left blank. Decoration only.
function HeroCube() {
  const cells = [
    { label: "IB" },
    { icon: Database },
    {},
    {},
    { icon: Gamepad2 },
    { icon: Wallet, dark: true },
    { icon: Copy },
    {},
    { icon: Radio },
  ];
  return (
    <div aria-hidden="true" className="hidden shrink-0 [perspective:900px] md:block">
      <div className="grid grid-cols-3 gap-2 rounded-[18px] border border-ll-hairline bg-ll-surface-1 p-2.5 shadow-[-18px_24px_40px_-18px_rgba(143,0,25,0.35)] [transform:rotateY(22deg)_rotateX(8deg)_rotateZ(-2deg)]">
        {cells.map((cell, index) => {
          const Icon = cell.icon;
          const tone = cell.label
            ? "bg-[#D90005] text-white"
            : cell.dark
              ? "bg-ll-emphasis-bg text-ll-emphasis-text"
              : Icon
                ? "bg-ll-primary-subtle-bg text-ll-primary-subtle-text"
                : "bg-ll-surface-3";
          return (
            <span key={index} className={`flex h-[72px] w-[72px] items-center justify-center rounded-xl ${tone}`}>
              {cell.label && <span className="font-[family-name:var(--font-ib-lato)] text-xl font-black">{cell.label}</span>}
              {Icon && <Icon size={28} strokeWidth={2} />}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function SystemHub({ me, onLoggedOut, onPermissionsChanged }) {
  const isSuperAdmin = me.role === "admin";
  const isTemplateUser = me.role === "user";
  const [usersModal, setUsersModal] = useState(false);
  const [theme, toggleTheme] = useLLTheme();
  const [views, setViews] = useState([]);
  const [viewsLoading, setViewsLoading] = useState(isTemplateUser);
  const [search, setSearch] = useState("");
  const searchRef = useRef(null);

  // Screens are listed on the hub only for a "user" account, for which they
  // are the only way in; everyone else reaches them through System DB.
  // /api/views already filters to what this account can see.
  useEffect(() => {
    if (!isTemplateUser) return;
    apiJson("/api/views", { fallbackError: "โหลดเทมเพลตหน้าจอไม่สำเร็จ" })
      .then((data) => setViews((data.views || []).filter((view) => view.config?.panels?.length)))
      .catch(() => setViews([]))
      .finally(() => setViewsLoading(false));
  }, [isTemplateUser]);

  // ⌘K / Ctrl+K jumps to the search box, as the hint inside it says.
  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const logout = async () => {
    try {
      await apiJson("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore — cookie clear is best-effort, drop local state either way
    }
    onLoggedOut();
  };

  const isDark = theme === "dark";
  const roleLabel = isSuperAdmin ? "Admin" : isTemplateUser ? "User" : "Staff";
  const displayName = me.displayName || me.username;
  const initial = (displayName || "?").trim().slice(0, 1).toUpperCase();
  const accessibleSystems = SYSTEMS.filter((system) => {
    if (system.key === "projectm") return true;
    if (system.key === "gameinfo") return hasPermission(me, "gameinfo.access");
    if (system.key === "profit") return hasPermission(me, "profit.access");
    if (system.key === "stock") return hasPermission(me, "stock.access");
    return !isTemplateUser;
  });

  const query = search.trim().toLowerCase();
  const shownSystems = accessibleSystems.filter((system) => matchesQuery(query, system.label, system.desc));
  const shownViews = views.filter((view) => matchesQuery(query, view.name, view.description));
  const nothingFound = Boolean(query) && !viewsLoading && shownSystems.length === 0 && shownViews.length === 0;

  const roundButton =
    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/95 text-[#D90005] transition sm:h-11 sm:w-11 hover:bg-white focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-white";

  return (
    <div
      data-theme={theme}
      className={`${ibLato.variable} ${ibThai.variable} flex min-h-screen flex-col bg-ll-surface-2 text-[15px] leading-normal text-ll-ink`}
      style={{ fontFamily: "var(--font-ib-lato), var(--font-ib-thai), system-ui, sans-serif" }}
    >
      <header className="relative shadow-[0_10px_30px_rgba(143,0,25,0.28)]" style={{ background: BRAND_RED }}>
        <div className="mx-auto flex max-w-[1200px] flex-col gap-3 px-4 pb-4 pt-3 sm:px-8">
          <div className="flex min-h-12 items-center gap-3">
            <NextLink href="/" className="flex min-w-0 items-center gap-2 text-white sm:gap-2.5">
              <span className="font-[family-name:var(--font-ib-lato)] text-[22px] font-black leading-none tracking-[0.01em] sm:text-[26px]">
                INBLACKM
              </span>
              <span className="rounded-md bg-white px-2 py-[3px] font-[family-name:var(--font-ib-lato)] text-[11px] font-black tracking-[0.12em] text-[#D90005]">
                TOOLS
              </span>
            </NextLink>
            <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-2.5">
              <button
                type="button"
                onClick={toggleTheme}
                title={isDark ? "สลับเป็นโหมดสว่าง" : "สลับเป็นโหมดมืด"}
                aria-label={isDark ? "สลับเป็นโหมดสว่าง" : "สลับเป็นโหมดมืด"}
                className={roundButton}
              >
                {isDark ? <Sun size={19} strokeWidth={2.2} /> : <Moon size={19} strokeWidth={2.2} />}
              </button>
              <div className="flex items-center gap-2.5 rounded-full bg-black/15 py-1 pl-1 pr-1 sm:pr-3.5">
                <span className="flex h-[38px] w-[38px] items-center justify-center rounded-full border-2 border-white bg-[#18181B] text-[15px] font-black text-white">
                  {initial}
                </span>
                <span className="hidden flex-col leading-tight text-white sm:flex">
                  <span className="max-w-[160px] truncate text-sm font-bold">{displayName}</span>
                  <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[#FFE4E4]">{roleLabel}</span>
                </span>
              </div>
              <button type="button" onClick={logout} title="ออกจากระบบ" aria-label="ออกจากระบบ" className={roundButton}>
                <LogOut size={19} strokeWidth={2.2} />
              </button>
            </div>
          </div>
          <div className="flex h-[46px] items-center gap-2.5 rounded-xl bg-white px-3.5">
            <Search size={18} strokeWidth={2.2} className="shrink-0 text-[#D90005]" aria-hidden="true" />
            <label htmlFor="hub-search" className="sr-only">
              ค้นหา
            </label>
            <input
              id="hub-search"
              ref={searchRef}
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setSearch("");
              }}
              placeholder={isTemplateUser ? "ค้นหาหน้าจอ..." : "ค้นหาระบบ..."}
              className="min-w-0 flex-1 border-0 bg-transparent text-[15px] text-[#18181B] outline-none placeholder:text-[#71717A]"
            />
            <kbd className="hidden rounded-md border border-[#E4E4E7] bg-[#F4F4F5] px-[7px] py-0.5 font-[family-name:var(--font-ib-lato)] text-[11px] font-bold text-[#3F3F46] sm:inline">
              ⌘K
            </kbd>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 pb-14 sm:px-8">
        <section className="flex flex-wrap items-center justify-center gap-8 pb-12 pt-14 md:gap-24">
          <HeroCube />
          <div className="flex min-w-0 max-w-[520px] flex-col gap-3.5">
            <div className="flex items-center gap-2.5">
              <span aria-hidden="true" className="grid grid-cols-[repeat(3,6px)] grid-rows-[repeat(2,6px)]">
                <span className="col-start-3 row-start-1 bg-[#D90005]" />
                <span className="col-start-2 row-start-2 bg-[#D90005]" />
                <span className="col-start-3 row-start-2 bg-[#D90005]" />
              </span>
              <span className="text-[15px] font-bold text-ll-ink-muted">สวัสดี, {displayName}</span>
            </div>
            <h1 className="m-0 font-[family-name:var(--font-ib-lato)] text-[clamp(42px,5.4vw,64px)] font-black leading-[0.98] tracking-[-0.025em] text-ll-ink">
              <span className="block">ALL TOOLS</span>
              <span className="block text-[#E30613]">ONE PLACE.</span>
            </h1>
            <p className="m-0 text-[17px] text-ll-ink-muted">
              {isTemplateUser ? "เลือกหน้าจอที่ต้องการเข้าใช้งาน" : "เลือกระบบที่ต้องการเข้าใช้งาน"}
            </p>
          </div>
        </section>

        {nothingFound && (
          <p className="mb-8 rounded-xl border border-ll-hairline bg-ll-surface-1 px-4 py-6 text-center text-sm text-ll-ink-subtle">
            ไม่พบระบบหรือเทมเพลตที่ตรงกับ “{search.trim()}”
          </p>
        )}

        {shownSystems.length > 0 && (
          <section aria-labelledby="hub-systems" className="flex flex-col gap-[18px]">
            <div className="flex flex-col gap-0.5">
              <h2 id="hub-systems" className="m-0 text-2xl font-extrabold text-ll-ink">
                ระบบทั้งหมด
              </h2>
              <p className="m-0 text-sm text-ll-ink-subtle">
                {query ? `พบ ${shownSystems.length} จาก ${accessibleSystems.length} ระบบ` : `จำนวน ${accessibleSystems.length} ระบบ`}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {shownSystems.map((system) => {
                const Icon = system.icon;
                const main = system.key === "systemdb";
                return (
                  <NextLink
                    key={system.key}
                    href={system.href}
                    className={`group flex flex-col items-center gap-3 rounded-xl border px-4 pb-[22px] pt-7 text-center transition hover:-translate-y-[3px] hover:shadow-[0_14px_28px_-12px_rgba(143,0,25,0.45)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ll-ink ${
                      main
                        ? "border-[#D90005] bg-[#D90005] text-white shadow-[0_14px_28px_-14px_rgba(143,0,25,0.5)] hover:border-[#B80004] hover:bg-[#B80004]"
                        : "border-ll-hairline bg-ll-surface-1 text-ll-ink shadow-[var(--ll-shadow-card)] hover:border-[#D90005] hover:bg-[#D90005] hover:text-white"
                    }`}
                  >
                    <span
                      className={`flex h-[60px] w-[60px] items-center justify-center rounded-2xl transition ${
                        main
                          ? "bg-white/20 text-white"
                          : "bg-ll-primary-subtle-bg text-ll-primary-subtle-text group-hover:bg-white/20 group-hover:text-white"
                      }`}
                    >
                      <Icon size={28} strokeWidth={2} />
                    </span>
                    <span className="text-[17px] font-black leading-tight">{system.label}</span>
                    <span
                      className={`text-[13px] leading-relaxed ${main ? "text-[#FFE4E4]" : "text-ll-ink-subtle group-hover:text-[#FFE4E4]"}`}
                    >
                      {system.desc}
                    </span>
                  </NextLink>
                );
              })}
            </div>
          </section>
        )}

        <div className="mt-10 flex flex-wrap gap-4">
          {isSuperAdmin && !query && (
            <section
              aria-labelledby="hub-admin"
              className="flex min-w-0 flex-[1_1_420px] flex-col gap-3.5 rounded-xl border border-ll-hairline bg-ll-surface-1 p-5 shadow-[var(--ll-shadow-card)]"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 id="hub-admin" className="m-0 text-[13px] font-extrabold text-ll-ink-muted">
                  เครื่องมือผู้ดูแล
                </h2>
                <span className="rounded bg-ll-emphasis-bg px-[7px] py-0.5 text-[10px] font-black tracking-[0.12em] text-ll-emphasis-text">
                  ADMIN
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: "users", label: "จัดการสิทธิ์ผู้ใช้", icon: Users, onClick: () => setUsersModal(true) },
                  { key: "log", label: "ประวัติการใช้งาน", icon: History, href: "/log", title: "ประวัติการใช้งาน (การเข้าสู่ระบบ / แก้ไขข้อมูล)" },
                  { key: "createdb", label: "สร้างตาราง/คอลัมน์", icon: Table2, href: "/createdb", title: "สร้างตารางใหม่ / เพิ่มคอลัมน์ในตารางเดิม" },
                ].map((tool) => {
                  const Icon = tool.icon;
                  const className =
                    "flex flex-col items-center gap-2 rounded-xl px-2 py-4 text-center text-ll-ink transition hover:bg-ll-primary-subtle-bg focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ll-ink";
                  const body = (
                    <>
                      <Icon size={30} strokeWidth={2} className="text-[#D90005]" aria-hidden="true" />
                      <span className="text-[13px] font-semibold">{tool.label}</span>
                    </>
                  );
                  return tool.href ? (
                    <NextLink key={tool.key} href={tool.href} title={tool.title} className={className}>
                      {body}
                    </NextLink>
                  ) : (
                    <button key={tool.key} type="button" onClick={tool.onClick} className={className}>
                      {body}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Only for a "user" account: its assigned screens are its only way
              in, so the card shows even when empty, to say so plainly. Staff
              and admins open screens from System DB; the hub no longer lists
              them as shortcuts. */}
          {isTemplateUser && (viewsLoading || shownViews.length > 0 || !query) && (
            <section
              aria-labelledby="hub-templates"
              className="flex min-w-0 flex-[1_1_420px] flex-col gap-3.5 rounded-xl border border-ll-hairline bg-ll-surface-1 p-5 shadow-[var(--ll-shadow-card)]"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div className="flex flex-wrap items-baseline gap-2">
                  <h2 id="hub-templates" className="m-0 text-[13px] font-extrabold text-ll-ink-muted">
                    {isTemplateUser ? "หน้าจอของคุณ" : "ทางลัดเทมเพลตหน้าจอ"}
                  </h2>
                  {!isTemplateUser && <span className="text-xs text-ll-ink-subtle">อยู่ใน System DB</span>}
                </div>
                {!isTemplateUser && (
                  <NextLink
                    href="/systemdb"
                    className="flex items-center gap-1 text-[13px] font-bold text-[#D90005] hover:text-[#A80004]"
                  >
                    ดูทั้งหมด <ArrowUpRight size={13} strokeWidth={2.4} aria-hidden="true" />
                  </NextLink>
                )}
              </div>
              {viewsLoading ? (
                <p className="m-0 flex items-center gap-2 py-3 text-[13px] text-ll-ink-subtle">
                  <Loader2 size={13} className="animate-spin" /> กำลังโหลด...
                </p>
              ) : shownViews.length === 0 ? (
                <p className="m-0 py-4 text-center text-[13px] text-ll-ink-subtle">
                  ยังไม่มีหน้าจอที่กำหนดให้บัญชีนี้ — ติดต่อผู้ดูแลระบบ
                </p>
              ) : (
                <div className="flex flex-wrap gap-4">
                  {shownViews.map((view) => (
                    <NextLink
                      key={view.id}
                      href={`/view/${view.id}`}
                      title={view.description || `${view.config?.panels?.length || 0} ตาราง`}
                      className="group flex w-[104px] flex-col items-center gap-2 text-center text-ll-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ll-ink"
                    >
                      <span className="flex h-24 w-24 flex-col items-center justify-center gap-1.5 rounded-xl bg-[#18181B] px-2 text-white shadow-[0_1px_3px_rgba(0,0,0,0.2)] transition group-hover:-translate-y-[3px]">
                        <Layers size={22} strokeWidth={2} className="text-[#FF5A5F]" aria-hidden="true" />
                        <span className="line-clamp-2 break-all font-[family-name:var(--font-ib-lato)] text-sm font-black leading-tight tracking-[0.04em]">
                          {view.name}
                        </span>
                      </span>
                      <span className="line-clamp-2 text-xs leading-snug text-ll-ink-muted">
                        {view.description || `${view.config?.panels?.length || 0} ตาราง`}
                      </span>
                      {(view.isDefault || view.isReadOnly) && (
                        <span className="flex flex-wrap justify-center gap-1">
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
                      )}
                    </NextLink>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </main>

      <footer className="border-t-2 border-[#D90005] bg-ll-surface-1">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4 px-4 py-7 sm:px-8">
          <div className="flex flex-col gap-0.5">
            <span className="font-[family-name:var(--font-ib-lato)] text-xl font-black tracking-[0.01em] text-[#D90005]">
              INBLACKM <span className="text-ll-ink">TOOLS</span>
            </span>
            <span className="text-[13px] font-extrabold text-ll-ink">INBLACK GAMING CO., LTD.</span>
          </div>
          <span className="text-xs text-ll-ink-subtle">
            © {new Date().getFullYear()} INBLACK GAMING CO., LTD. — All rights reserved.
          </span>
        </div>
      </footer>

      {usersModal && <UsersModal me={me} onClose={() => setUsersModal(false)} onChanged={onPermissionsChanged} />}
    </div>
  );
}

function LoginScreen({ onLoggedIn }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [ssoError, setSsoError] = useState("");
  const [theme, toggleTheme] = useLLTheme();
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
    setSsoError(SSO_ERROR_MESSAGES[code] || "เข้าสู่ระบบด้วยบัญชี TopUp ไม่สำเร็จ");
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  // Built from window.location, so it has to wait for the client: computing
  // it during the server render (this component ships to the client, but
  // still renders once on the server first) would throw on the missing
  // `window`.
  // TopUp's /admin/tools-sso is behind its admin gate: it sends the person
  // through TopUp's own OTP and PIN first, then back here with a code.
  const [topupSsoUrl, setTopupSsoUrl] = useState("");
  useEffect(() => {
    if (!TOPUP_BASE_URL) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- window.location is only known once mounted on the client
    setTopupSsoUrl(
      `${TOPUP_BASE_URL}/admin/tools-sso?return=${encodeURIComponent(
        `${window.location.origin}/api/sso/from-topup`
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
    <div
      data-theme={theme}
      className={`${linearSans.variable} flex min-h-screen flex-col items-center justify-center bg-ll-canvas p-6`}
      style={{ fontFamily: "var(--font-linear-sans), sans-serif" }}
    >
      <LLThemeToggle theme={theme} onToggle={toggleTheme} />
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-lg border border-ll-hairline bg-ll-surface-1 p-8 shadow-[var(--ll-shadow-modal)]"
      >
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-ll-emphasis-bg text-ll-emphasis-text">
            <Lock size={18} />
          </div>
          <h1
            className="font-semibold text-ll-ink"
            style={{ fontSize: 22, lineHeight: 1.25, letterSpacing: "-0.4px" }}
          >
            GameDB
          </h1>
          <p className="mt-1.5 text-[14px] text-ll-ink-subtle">
            เข้าสู่ระบบด้วยบัญชี GameDB
          </p>
        </div>

        <label className="mb-1 block text-[12px] font-medium text-ll-ink-subtle">Username</label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoFocus
          className="mb-3.5 h-10 w-full rounded-md border border-ll-hairline-strong bg-ll-surface-2 px-3 text-[14px] text-ll-ink outline-none transition focus:border-ll-primary focus:bg-ll-surface-1"
        />
        <label className="mb-1 block text-[12px] font-medium text-ll-ink-subtle">รหัสผ่าน</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          className="mb-4 h-10 w-full rounded-md border border-ll-hairline-strong bg-ll-surface-2 px-3 text-[14px] text-ll-ink outline-none transition focus:border-ll-primary focus:bg-ll-surface-1"
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
          <div className="mb-3.5 rounded-md border border-ll-hairline-strong bg-ll-surface-2 px-3 py-2.5 text-[13px] text-ll-ink-subtle">
            {turnstileConfig.misconfigured
              ? "ระบบ Turnstile ยังตั้งค่าไม่ครบ กรุณาติดต่อผู้ดูแล"
              : turnstileConfig.error}
          </div>
        )}

        {error && (
          <div className="mb-3.5 rounded-md border border-ll-primary/20 bg-ll-primary-subtle-bg px-3 py-2 text-[13px] text-ll-primary-subtle-text">
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
          className="flex h-10 w-full items-center justify-center gap-1.5 rounded-md bg-ll-primary text-[14px] font-medium text-ll-on-primary transition hover:bg-ll-primary-hover disabled:opacity-50"
        >
          {submitting ? <Loader2 size={14} className="animate-spin" /> : <Lock size={13} />}
          เข้าสู่ระบบ
        </button>

        {(topupSsoUrl || MOCK_SSO_ENABLED) && (
          <>
            <div className="my-4 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-ll-ink-tertiary">
              <span className="h-px flex-1 bg-ll-hairline" />
              หรือ
              <span className="h-px flex-1 bg-ll-hairline" />
            </div>
            {topupSsoUrl ? (
              <a
                href={topupSsoUrl}
                className="flex h-10 w-full items-center justify-center gap-1.5 rounded-md border border-ll-hairline-strong text-[14px] font-medium text-ll-ink transition hover:bg-ll-surface-2"
              >
                เข้าสู่ระบบด้วยบัญชี TopUp
              </a>
            ) : null}
            {MOCK_SSO_ENABLED ? (
              <a
                href="/api/sso/mock"
                className="mt-2 flex h-10 w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-ll-hairline-strong text-[13px] font-medium text-ll-ink-subtle transition hover:bg-ll-surface-2"
              >
                เข้าสู่ระบบด้วยบัญชีทดสอบ (Mock)
              </a>
            ) : null}
          </>
        )}
      </form>

      {ssoError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-lg border border-ll-hairline bg-ll-surface-1 p-6 text-center shadow-[var(--ll-shadow-modal)]">
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-md bg-ll-primary-subtle-bg text-ll-primary-subtle-text">
              <AlertTriangle size={22} />
            </div>
            <h2 className="mb-1 text-[15px] font-semibold text-ll-ink">เข้าสู่ระบบไม่สำเร็จ</h2>
            <p className="mb-4 text-[13px] leading-relaxed text-ll-ink-subtle">{ssoError}</p>
            <button
              type="button"
              onClick={() => setSsoError("")}
              className="flex h-10 w-full items-center justify-center gap-1.5 rounded-md bg-ll-primary text-[14px] font-medium text-ll-on-primary transition hover:bg-ll-primary-hover"
            >
              <X size={13} /> ปิด
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
