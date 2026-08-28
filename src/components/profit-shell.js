"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
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

const GROUP_LABELS = { bot: "BOT (AUTO)", human: "HUMAN (MANUAL)" };

export default function ProfitShell({ displayName, canEdit, children }) {
  const { theme, toggleTheme } = useProfitTheme();
  const pathname = usePathname();
  const isDark = theme === "dark";

  const [categories, setCategories] = useState(null);
  const [error, setError] = useState("");

  const loadCategories = useCallback(() => {
    apiJson("/api/profit/categories", { fallbackError: "โหลดเมนูไม่สำเร็จ" })
      .then((data) => setCategories(data.categories || []))
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories, pathname]);

  const isDashboard = pathname === "/profit";
  const isPackCosts = pathname === "/profit/pack-costs";
  const isSalePrices = pathname.startsWith("/profit/sale-prices");
  const isGocashHistory = pathname === "/profit/gocash-history";
  const isOxideHistory = pathname === "/profit/oxide-history";
  const isWavepayHistory = pathname === "/profit/wavepay-history";

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

          {categories && Object.keys(GROUP_LABELS).map((group) => (
            <div key={group} className="mt-2">
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-ll-ink-tertiary">
                {GROUP_LABELS[group]}
              </p>
              {categories.filter((c) => c.group === group).map((cat) => (
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
                      <History size={12} aria-hidden="true" /> ประวัติ Multi Game Card
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
                </div>
              ))}
            </div>
          ))}
        </aside>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6">
          <ProfitCapabilitiesProvider canEdit={canEdit}>{children}</ProfitCapabilitiesProvider>
        </main>
      </div>
    </div>
  );
}
