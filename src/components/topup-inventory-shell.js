"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, Contrast, Moon, Sun } from "lucide-react";
import { useProjectmTheme } from "@/components/projectm-theme-context";
import { topupInventoryPath } from "@/lib/topup-inventory";
import "./topup-inventory.css";

const THEMES = [{ key: "light", label: "สว่าง", Icon: Sun }, { key: "auto", label: "ตามระบบ", Icon: Contrast }, { key: "dark", label: "มืด", Icon: Moon }];

// The frame of every Topup Inventory page: background, the bar with the way
// back (the main menu from the home, the home from a service) and the theme switch.
export default function TopupInventoryShell({ lang, children }) {
  const pathname = usePathname() || "";
  const { choice, setChoice } = useProjectmTheme();
  const home = topupInventoryPath(lang);
  const atHome = pathname.replace(/\/$/, "") === home;
  return (
    <div className="tiv">
      <div className="tiv-aurora" aria-hidden><i /><i /><i /></div>
      <div className="tiv-shell">
        <header className="tiv-rail">
          <Link className="tiv-back" href={atHome ? "/" : home}><ChevronLeft className="tiv-i" size="1em" aria-hidden />{atHome ? "กลับเมนูหลัก" : "Topup Inventory"}</Link>
          <div className="tiv-brand">ProjectM</div>
          <div className="tiv-seg" role="radiogroup" aria-label="ธีมสี">
            {THEMES.map(({ key, label, Icon }) => (
              <button key={key} type="button" role="radio" aria-checked={choice === key} aria-label={label} title={label} onClick={() => setChoice?.(key)}><Icon className="tiv-i" size="1em" aria-hidden /></button>
            ))}
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
