"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  BarChart3,
  Camera,
  FileSpreadsheet,
  History,
  Inbox,
  ListOrdered,
  Moon,
  Settings,
  Sun,
  Users,
} from "lucide-react";
import ItuneAdminSettingsDrawer from "@/components/itune-admin-settings-drawer";
import { ItuneSettingsProvider } from "@/lib/itune-settings";
import { useProjectmTheme } from "@/components/projectm-theme-context";
import { ituneInventoryPath } from "@/lib/topup-inventory";

export default function ItuneAdminShell({ lang, displayName, children }) {
  const pathname = usePathname();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsButtonRef = useRef(null);
  const { theme, toggleTheme } = useProjectmTheme();
  const isDark = theme === "dark";
  const base = `/projectm/${lang}/itune/admin`;

  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
    requestAnimationFrame(() => settingsButtonRef.current?.focus());
  }, []);

  function isActive(item) {
    if (item.href === base) return pathname === base;
    return (
      pathname === item.href ||
      (item.href === `${base}/priority` && pathname.startsWith(`${item.href}/`))
    );
  }

  const groups = [
    {
      label: "รายการ",
      items: [
        { label: "รายการเมล", href: base, icon: Inbox },
        { label: "สถิติ", href: `${base}/stats`, icon: BarChart3 },
      ],
    },
    {
      label: "งานรับเมล",
      items: [
        { label: "จัดคิว", href: `${base}/priority`, icon: ListOrdered },
        {
          label: "ผู้ถือเมล",
          href: `${base}/topup-log`,
          icon: Users,
        },
      ],
    },
    {
      label: "ชีท & เช็คยอด",
      items: [
        { label: "ออเดอร์จากชีท", href: `${base}/sheet-orders`, icon: FileSpreadsheet },
        { label: "เช็คยอดจริง", href: `${base}/balance-check`, icon: Camera },
      ],
    },
    {
      label: "ประวัติ",
      items: [
        {
          label: "ประวัติ iTune",
          href: `${base}/history`,
          icon: History,
        },
      ],
    },
  ];

  return (
    <ItuneSettingsProvider>
      <div className="min-h-screen bg-ll-canvas">
        <header className="sticky top-0 z-40 border-b border-ll-hairline bg-ll-surface-1">
          <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-6">
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-ll-ink-tertiary">
                PROJECTM · ITUNE ADMIN
              </p>
              <p className="mt-0.5 truncate text-sm font-semibold text-ll-ink">{displayName}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={toggleTheme}
                className="flex h-10 items-center gap-2 rounded-lg border border-ll-hairline-strong bg-ll-surface-1 px-3 text-[12px] font-medium text-ll-ink hover:bg-ll-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ll-primary"
                aria-label={isDark ? "เปลี่ยนเป็นธีมสว่าง" : "เปลี่ยนเป็นธีมมืด"}
                title={isDark ? "เปลี่ยนเป็นธีมสว่าง" : "เปลี่ยนเป็นธีมมืด"}
              >
                {isDark ? <Sun size={15} aria-hidden="true" /> : <Moon size={15} aria-hidden="true" />}
                <span className="hidden sm:inline">{isDark ? "ธีมสว่าง" : "ธีมมืด"}</span>
              </button>
              <Link
                href={ituneInventoryPath(lang)}
                className="flex h-10 items-center gap-2 rounded-lg border border-ll-hairline-strong bg-ll-surface-1 px-3 text-[12px] font-medium text-ll-ink hover:bg-ll-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ll-primary"
              >
                <ArrowLeft size={14} aria-hidden="true" />
                <span className="hidden sm:inline">กลับ Itune</span>
              </Link>
            </div>
          </div>

          <nav aria-label="เมนูผู้ดูแล Itune" className="overflow-x-auto px-4 pb-3 sm:px-6">
            <div className="flex min-w-max items-end gap-6">
              {groups.map((group) => (
                <div key={group.label} className="border-l border-ll-hairline pl-3 first:border-l-0 first:pl-0">
                  <p className="mb-1 px-2 text-[10px] font-medium uppercase tracking-[0.12em] text-ll-ink-tertiary">
                    {group.label}
                  </p>
                  <div className="flex gap-1">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const active = isActive(item);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          aria-current={active ? "page" : undefined}
                          className={`flex h-10 items-center gap-2 rounded-lg px-3 text-[12px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ll-primary ${
                            active
                              ? "bg-ll-emphasis-bg text-ll-emphasis-text"
                              : "text-ll-ink-subtle hover:bg-ll-surface-2 hover:text-ll-ink"
                          }`}
                        >
                          <Icon size={14} aria-hidden="true" />
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}

              <div className="border-l border-ll-hairline pl-3">
                <p className="mb-1 px-2 text-[10px] font-medium uppercase tracking-[0.12em] text-ll-ink-tertiary">
                  ตั้งค่า
                </p>
                <button
                  ref={settingsButtonRef}
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                  aria-expanded={settingsOpen}
                  className="flex h-10 items-center gap-2 rounded-lg px-3 text-[12px] font-medium text-ll-ink-subtle hover:bg-ll-surface-2 hover:text-ll-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ll-primary"
                >
                  <Settings size={14} aria-hidden="true" /> ตั้งค่าระบบ
                </button>
              </div>
            </div>
          </nav>
        </header>

        <main className="flex flex-col gap-5 px-4 pb-14 pt-6 sm:px-6">{children}</main>
        {settingsOpen && <ItuneAdminSettingsDrawer onClose={closeSettings} />}
      </div>
    </ItuneSettingsProvider>
  );
}
