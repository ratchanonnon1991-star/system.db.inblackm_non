"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronDown,
  History,
  LayoutGrid,
  Loader2,
  Moon,
  Settings2,
  Sun,
  Tag,
  Wallet,
} from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { useProfitTheme } from "@/components/profit-theme-context";
import { ProfitCapabilitiesProvider } from "@/components/profit-capabilities-context";

const GROUP_LABELS = { bot: "Bot", api: "API", human: "Human (manual)" };
const COLLAPSIBLE_GROUPS = new Set(["bot", "api"]);
const GROUP_OPEN_KEY = "profit-sidebar-groups";

function readOpenGroups() {
  try {
    const raw = window.localStorage.getItem(GROUP_OPEN_KEY);
    if (!raw) return { bot: true, api: true };
    const parsed = JSON.parse(raw);
    return {
      bot: parsed.bot !== false,
      api: parsed.api !== false,
    };
  } catch {
    return { bot: true, api: true };
  }
}

export default function ProfitShell({ displayName, canEdit, children }) {
  const { theme, toggleTheme } = useProfitTheme();
  const pathname = usePathname();
  const isDark = theme === "dark";

  const [categories, setCategories] = useState(null);
  const [error, setError] = useState("");
  const [openGroups, setOpenGroups] = useState({ bot: true, api: true });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage only after mount
    setOpenGroups(readOpenGroups());
  }, []);

  const toggleGroup = useCallback((group) => {
    setOpenGroups((prev) => {
      const next = { ...prev, [group]: !prev[group] };
      try {
        window.localStorage.setItem(GROUP_OPEN_KEY, JSON.stringify(next));
      } catch {
        // preference is cosmetic
      }
      return next;
    });
  }, []);

  const loadCategories = useCallback(() => {
    apiJson("/api/profit/categories", { fallbackError: "โหลดเมนูไม่สำเร็จ" })
      .then((data) => setCategories(data.categories || []))
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories, pathname]);

  // Keep the group that owns the current page open, even if the user
  // collapsed it earlier — otherwise the active link disappears.
  useEffect(() => {
    if (!categories) return;
    for (const group of COLLAPSIBLE_GROUPS) {
      const items = categories.filter((c) => c.group === group);
      const active = items.some((c) => {
        if (pathname === `/profit/category/${c.id}`) return true;
        if (c.id === "gocash" && pathname === "/profit/gocash-history") return true;
        if (c.id === "oxide" && pathname === "/profit/oxide-history") return true;
        if (c.id === "wavepay" && pathname === "/profit/wavepay-history") return true;
        if (c.id === "u9" && pathname === "/profit/u9-history") return true;
        if (c.id === "donshop" && pathname === "/profit/donshop-history") return true;
        if (c.id === "gamepoint" && pathname === "/profit/gamepoint-history") return true;
        if (c.id === "agenh2h" && pathname === "/profit/agenh2h-history") return true;
        if (c.id === "codareseller" && pathname === "/profit/codareseller-history") return true;
        if (c.id === "netease" && pathname === "/profit/netease-history") return true;
        if (c.id === "truemoney" && pathname === "/profit/truemoney-history") return true;
        if (c.id === "atom" && pathname === "/profit/atom-history") return true;
        if (c.id === "smartsun" && pathname === "/profit/smartsun-history") return true;
        return false;
      });
      if (active) {
        setOpenGroups((prev) => (prev[group] ? prev : { ...prev, [group]: true }));
      }
    }
  }, [categories, pathname]);

  const isDashboard = pathname === "/profit";
  const isPackCosts = pathname === "/profit/pack-costs";
  const isSalePrices = pathname.startsWith("/profit/sale-prices");
  const isGocashHistory = pathname === "/profit/gocash-history";
  const isOxideHistory = pathname === "/profit/oxide-history";
  const isWavepayHistory = pathname === "/profit/wavepay-history";
  const isU9History = pathname === "/profit/u9-history";
  const isDonshopHistory = pathname === "/profit/donshop-history";
  const isGamepointHistory = pathname === "/profit/gamepoint-history";
  const isAgenh2hHistory = pathname === "/profit/agenh2h-history";
  const isCodaresellerHistory = pathname === "/profit/codareseller-history";
  const isNeteaseHistory = pathname === "/profit/netease-history";
  const isTruemoneyHistory = pathname === "/profit/truemoney-history";
  const isAtomHistory = pathname === "/profit/atom-history";
  const isSmartsunHistory = pathname === "/profit/smartsun-history";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-ll-hairline bg-ll-surface-1">
        <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/profit" className="flex items-center gap-2.5 min-w-0">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ll-primary text-white">
              <Wallet size={17} />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-ll-ink-tertiary">Profit</p>
              <p className="mt-0.5 truncate text-sm font-semibold text-ll-ink">{displayName}</p>
            </div>
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-ll-hairline-strong bg-ll-surface-1 text-ll-ink hover:bg-ll-surface-2"
              aria-label={isDark ? "เปลี่ยนเป็นธีมสว่าง" : "เปลี่ยนเป็นธีมมืด"}
              title={isDark ? "เปลี่ยนเป็นธีมสว่าง" : "เปลี่ยนเป็นธีมมืด"}
            >
              {isDark ? <Sun size={15} aria-hidden="true" /> : <Moon size={15} aria-hidden="true" />}
            </button>
            <Link
              href="/"
              title="กลับเมนู"
              aria-label="กลับเมนู"
              className="flex h-10 items-center gap-2 rounded-lg border border-ll-hairline-strong bg-ll-surface-1 px-3 text-[12px] font-medium text-ll-ink hover:bg-ll-surface-2"
            >
              <LayoutGrid size={15} aria-hidden="true" />
              <span className="hidden sm:inline">กลับเมนู</span>
            </Link>
          </div>
        </div>
      </header>

      <div className="flex min-w-0 flex-1">
        <aside className="hidden w-60 shrink-0 flex-col gap-1 border-r border-ll-hairline bg-ll-surface-1 p-3 md:flex">
          <Link
            href="/profit"
            className={`rounded-md px-3 py-2 text-[13px] font-medium transition ${
              isDashboard ? "bg-ll-primary-subtle-bg text-ll-primary-subtle-text" : "text-ll-ink hover:bg-ll-surface-2"
            }`}
          >
            ภาพรวม
          </Link>
          <Link
            href="/profit/pack-costs"
            className={`flex items-center gap-1.5 rounded-md px-3 py-2 text-[13px] font-medium transition ${
              isPackCosts ? "bg-ll-primary-subtle-bg text-ll-primary-subtle-text" : "text-ll-ink hover:bg-ll-surface-2"
            }`}
          >
            <Settings2 size={13} aria-hidden="true" /> ตั้งค่าต้นทุนตามแพ็ก
          </Link>
          <Link
            href="/profit/sale-prices"
            className={`flex items-center gap-1.5 rounded-md px-3 py-2 text-[13px] font-medium transition ${
              isSalePrices ? "bg-ll-primary-subtle-bg text-ll-primary-subtle-text" : "text-ll-ink hover:bg-ll-surface-2"
            }`}
          >
            <Tag size={13} aria-hidden="true" /> ตั้งราคาขายตามแพ็ก
          </Link>

          {error && <p className="px-3 py-2 text-[11px] text-ll-primary-subtle-text">{error}</p>}
          {!categories && !error && (
            <p className="flex items-center gap-2 px-3 py-2 text-[12px] text-ll-ink-subtle">
              <Loader2 size={13} className="animate-spin" /> กำลังโหลด...
            </p>
          )}

          {categories && Object.keys(GROUP_LABELS).map((group) => {
            const items = categories.filter((c) => c.group === group);
            if (!items.length) return null;
            const collapsible = COLLAPSIBLE_GROUPS.has(group);
            const open = !collapsible || openGroups[group] !== false;
            return (
              <div key={group} className={collapsible ? "mt-3" : "mt-2"}>
                {collapsible ? (
                  <button
                    type="button"
                    onClick={() => toggleGroup(group)}
                    aria-expanded={open}
                    className="flex w-full items-center gap-2 rounded-lg border border-ll-hairline bg-ll-surface-2 px-2.5 py-2 text-left transition hover:border-ll-hairline-strong hover:bg-ll-surface-3"
                  >
                    <span className="min-w-0 flex-1 text-[12px] font-semibold tracking-wide text-ll-ink">
                      {GROUP_LABELS[group]}
                    </span>
                    <span className="rounded-full bg-ll-surface-1 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-ll-ink-subtle">
                      {items.length}
                    </span>
                    <ChevronDown
                      size={14}
                      aria-hidden="true"
                      className={`shrink-0 text-ll-ink-subtle transition-transform ${open ? "" : "-rotate-90"}`}
                    />
                  </button>
                ) : (
                  <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-ll-ink-tertiary">
                    {GROUP_LABELS[group]}
                  </p>
                )}
                {open && (
                  <div className={collapsible ? "mt-1 border-l-2 border-ll-hairline pl-1" : undefined}>
                    {items.map((cat) => (
                      <div key={cat.id}>
                        <Link
                          href={`/profit/category/${cat.id}`}
                          className={`flex items-center justify-between rounded-md px-3 py-2 text-[13px] font-medium transition ${
                            pathname === `/profit/category/${cat.id}`
                              ? "bg-ll-primary-subtle-bg text-ll-primary-subtle-text"
                              : "text-ll-ink hover:bg-ll-surface-2"
                          }`}
                        >
                          <span>{cat.name}</span>
                          <span className="rounded-full bg-ll-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-ll-ink-subtle">
                            {cat.cardCount}
                          </span>
                        </Link>
                        {cat.id === "gocash" && (
                          <Link
                            href="/profit/gocash-history"
                            className={`ml-3 flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] transition ${
                              isGocashHistory
                                ? "bg-ll-primary-subtle-bg text-ll-primary-subtle-text"
                                : "text-ll-ink-subtle hover:bg-ll-surface-2"
                            }`}
                          >
                            <History size={12} aria-hidden="true" /> ประวัติ GoCash
                          </Link>
                        )}
                        {cat.id === "oxide" && (
                          <Link
                            href="/profit/oxide-history"
                            className={`ml-3 flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] transition ${
                              isOxideHistory
                                ? "bg-ll-primary-subtle-bg text-ll-primary-subtle-text"
                                : "text-ll-ink-subtle hover:bg-ll-surface-2"
                            }`}
                          >
                            <History size={12} aria-hidden="true" /> ประวัติ Multigamecard
                          </Link>
                        )}
                    {cat.id === "wavepay" && (
                      <Link
                        href="/profit/wavepay-history"
                        className={`ml-3 flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] transition ${
                          isWavepayHistory
                            ? "bg-ll-primary-subtle-bg text-ll-primary-subtle-text"
                            : "text-ll-ink-subtle hover:bg-ll-surface-2"
                        }`}
                      >
                        <History size={12} aria-hidden="true" /> ประวัติ Wavepay
                      </Link>
                    )}
                    {cat.id === "u9" && (
                      <Link
                        href="/profit/u9-history"
                        className={`ml-3 flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] transition ${
                          isU9History
                            ? "bg-ll-primary-subtle-bg text-ll-primary-subtle-text"
                            : "text-ll-ink-subtle hover:bg-ll-surface-2"
                        }`}
                      >
                        <History size={12} aria-hidden="true" /> ประวัติ U9
                      </Link>
                    )}
                    {cat.id === "donshop" && (
                      <Link
                        href="/profit/donshop-history"
                        className={`ml-3 flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] transition ${
                          isDonshopHistory
                            ? "bg-ll-primary-subtle-bg text-ll-primary-subtle-text"
                            : "text-ll-ink-subtle hover:bg-ll-surface-2"
                        }`}
                      >
                        <History size={12} aria-hidden="true" /> ประวัติ Donshop
                      </Link>
                    )}
                    {cat.id === "gamepoint" && (
                      <Link
                        href="/profit/gamepoint-history"
                        className={`ml-3 flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] transition ${
                          isGamepointHistory
                            ? "bg-ll-primary-subtle-bg text-ll-primary-subtle-text"
                            : "text-ll-ink-subtle hover:bg-ll-surface-2"
                        }`}
                      >
                        <History size={12} aria-hidden="true" /> ประวัติ Gamepoint
                      </Link>
                    )}
                    {cat.id === "agenh2h" && (
                      <Link
                        href="/profit/agenh2h-history"
                        className={`ml-3 flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] transition ${
                          isAgenh2hHistory
                            ? "bg-ll-primary-subtle-bg text-ll-primary-subtle-text"
                            : "text-ll-ink-subtle hover:bg-ll-surface-2"
                        }`}
                      >
                        <History size={12} aria-hidden="true" /> ประวัติ Agenh2h
                      </Link>
                    )}
                    {cat.id === "codareseller" && (
                      <Link
                        href="/profit/codareseller-history"
                        className={`ml-3 flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] transition ${
                          isCodaresellerHistory
                            ? "bg-ll-primary-subtle-bg text-ll-primary-subtle-text"
                            : "text-ll-ink-subtle hover:bg-ll-surface-2"
                        }`}
                      >
                        <History size={12} aria-hidden="true" /> ประวัติ Codareseller
                      </Link>
                    )}
                    {cat.id === "netease" && (
                      <Link
                        href="/profit/netease-history"
                        className={`ml-3 flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] transition ${
                          isNeteaseHistory
                            ? "bg-ll-primary-subtle-bg text-ll-primary-subtle-text"
                            : "text-ll-ink-subtle hover:bg-ll-surface-2"
                        }`}
                      >
                        <History size={12} aria-hidden="true" /> ประวัติ Netease
                      </Link>
                    )}
                    {cat.id === "truemoney" && (
                      <Link
                        href="/profit/truemoney-history"
                        className={`ml-3 flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] transition ${
                          isTruemoneyHistory
                            ? "bg-ll-primary-subtle-bg text-ll-primary-subtle-text"
                            : "text-ll-ink-subtle hover:bg-ll-surface-2"
                        }`}
                      >
                        <History size={12} aria-hidden="true" /> ประวัติ TrueMoney
                      </Link>
                    )}
                    {cat.id === "atom" && (
                      <Link
                        href="/profit/atom-history"
                        className={`ml-3 flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] transition ${
                          isAtomHistory
                            ? "bg-ll-primary-subtle-bg text-ll-primary-subtle-text"
                            : "text-ll-ink-subtle hover:bg-ll-surface-2"
                        }`}
                      >
                        <History size={12} aria-hidden="true" /> ประวัติ ATOM
                      </Link>
                    )}
                    {cat.id === "smartsun" && (
                      <Link
                        href="/profit/smartsun-history"
                        className={`ml-3 flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] transition ${
                          isSmartsunHistory
                            ? "bg-ll-primary-subtle-bg text-ll-primary-subtle-text"
                            : "text-ll-ink-subtle hover:bg-ll-surface-2"
                        }`}
                      >
                        <History size={12} aria-hidden="true" /> ประวัติ Smart-Sun
                      </Link>
                    )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </aside>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6">
          <ProfitCapabilitiesProvider canEdit={canEdit}>{children}</ProfitCapabilitiesProvider>
        </main>
      </div>
    </div>
  );
}
