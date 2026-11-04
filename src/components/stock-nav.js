"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Boxes, ClipboardList, FileSpreadsheet, LayoutDashboard, PackageSearch, Wallet } from "lucide-react";

// The tabs every Stock page shares. An account page (/stock/<code>) belongs to the inventory tab.
const TABS = [
  { href: "/stock", label: "ภาพรวม", icon: LayoutDashboard, match: (path) => path === "/stock" },
  { href: "/stock/inventory", label: "คลัง", icon: Boxes, match: (path) => path === "/stock/inventory" || /^\/stock\/(?!purchase-orders|wallets|sheets|sheet-stock)[^/]+$/.test(path) },
  { href: "/stock/sheet-stock", label: "คลังตามชีต", icon: PackageSearch, match: (path) => path.startsWith("/stock/sheet-stock") },
  { href: "/stock/purchase-orders", label: "ใบสั่งซื้อ", icon: ClipboardList, match: (path) => path.startsWith("/stock/purchase-orders") },
  { href: "/stock/wallets", label: "กระเป๋าเงิน", icon: Wallet, match: (path) => path.startsWith("/stock/wallets") },
  { href: "/stock/sheets", label: "ข้อมูลบัญชี", icon: FileSpreadsheet, match: (path) => path.startsWith("/stock/sheets") },
];

export default function StockNav() {
  const path = usePathname() || "/stock";
  return (
    <nav aria-label="เมนู Stock" className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-[1400px] gap-1 overflow-x-auto px-4 sm:px-7">
        {TABS.map(({ href, label, icon: Icon, match }) => {
          const active = match(path);
          return (
            <Link key={href} href={href} aria-current={active ? "page" : undefined}
              className={`flex h-12 shrink-0 items-center gap-2 border-b-[3px] px-3.5 text-sm font-extrabold ${active ? "border-[#D90005] text-[#B00004]" : "border-transparent text-zinc-600 hover:text-zinc-900"}`}>
              <Icon size={16} strokeWidth={2.3} aria-hidden="true" /> {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
