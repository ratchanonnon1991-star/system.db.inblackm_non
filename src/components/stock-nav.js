"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Boxes, ClipboardList, FileSpreadsheet, LayoutDashboard, PackageSearch, Pin, Receipt, Send, Wallet, X } from "lucide-react";
import { pinHref, removePin, usePins } from "@/components/stock-nav-pins";

// The tabs every Stock page shares. An account page (/stock/<code>) belongs to the inventory tab.
const TABS = [
  { href: "/stock", label: "ภาพรวม", icon: LayoutDashboard, match: (path) => path === "/stock" },
  { href: "/stock/inventory", label: "คลัง", icon: Boxes, match: (path) => path === "/stock/inventory" || /^\/stock\/(?!purchase-orders|wallets|sheets|sheet-stock|addresses|expenses)[^/]+$/.test(path) },
  { href: "/stock/sheet-stock", label: "คลังตามชีต", icon: PackageSearch, match: (path) => path.startsWith("/stock/sheet-stock") },
  { href: "/stock/purchase-orders", label: "ใบสั่งซื้อ", icon: ClipboardList, match: (path) => path.startsWith("/stock/purchase-orders") },
  { href: "/stock/wallets", label: "กระเป๋าเงิน", icon: Wallet, match: (path) => path.startsWith("/stock/wallets") },
  { href: "/stock/expenses", label: "ค่าใช้จ่าย", icon: Receipt, match: (path) => path.startsWith("/stock/expenses") },
  { href: "/stock/addresses", label: "ที่อยู่โอน", icon: Send, match: (path) => path.startsWith("/stock/addresses") },
  { href: "/stock/sheets", label: "ข้อมูลบัญชี", icon: FileSpreadsheet, match: (path) => path.startsWith("/stock/sheets") },
];

const tabClass = (active) =>
  `flex h-12 shrink-0 items-center gap-2 border-b-[3px] px-3.5 text-sm font-extrabold ${active ? "border-[#D90005] text-[#B00004]" : "border-transparent text-zinc-600 hover:text-zinc-900"}`;

export default function StockNav() {
  const path = usePathname() || "/stock";
  const search = useSearchParams();
  const pins = usePins();
  const openPin = path === "/stock/sheets" && search?.get("kind")
    ? pins.find((pin) => pin.kind === search.get("kind") && pin.tab.trim().toLowerCase() === (search.get("name") || "").trim().toLowerCase())
    : null;

  return (
    <nav aria-label="เมนู Stock" className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-[1400px] gap-1 overflow-x-auto px-4 sm:px-7">
        {TABS.map(({ href, label, icon: Icon, match }) => {
          const active = match(path) && !(openPin && href === "/stock/sheets");
          return (
            <Link key={href} href={href} aria-current={active ? "page" : undefined} className={tabClass(active)}>
              <Icon size={16} strokeWidth={2.3} aria-hidden="true" /> {label}
            </Link>
          );
        })}
        {pins.map((pin) => {
          const active = pin === openPin;
          return (
            <span key={`${pin.kind}-${pin.tab}`} className="group flex shrink-0 items-center">
              <Link href={pinHref(pin)} title={`${pin.kind} › ${pin.tab}`} aria-current={active ? "page" : undefined} className={`${tabClass(active)} pr-1`}>
                <Pin size={14} strokeWidth={2.3} aria-hidden="true" /> {pin.tab}
              </Link>
              <button type="button" onClick={() => removePin(pin)} aria-label={`เอา ${pin.tab} ออกจากเมนู`} title="เอาออกจากเมนู"
                className="rounded p-0.5 text-zinc-300 hover:bg-zinc-100 hover:text-zinc-700">
                <X size={13} aria-hidden="true" />
              </button>
            </span>
          );
        })}
      </div>
    </nav>
  );
}
