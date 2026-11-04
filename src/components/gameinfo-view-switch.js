"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Boxes, Eye } from "lucide-react";
import { normalizeGameinfoView, rememberGameinfoView } from "@/lib/gameinfo-view";
import GameinfoBackLink from "./gameinfo-back-link";

const VIEWS = [
  { id: "product", label: "Product", icon: Boxes, note: "มุมมองสินค้า: ดูต้นทุน กำไร และเทียบทุกช่องทางขาย" },
  { id: "topup", label: "Topup", icon: Eye, note: "มุมมองทีมเติม: ดูราคา ช่องทาง และปุ่มเปิดลิงก์เติม · ไม่แสดงคอลัมน์ที่ตั้งซ่อนไว้สำหรับ Topup" },
];

// The bar over a game's detail page (the one page the views change; it
// renders the bar itself): back to the list, the two views anyone can switch
// between, and whatever the page puts at the end (UID / ID-Pass).
export default function GameinfoViewSwitch({ savedView, isAdmin, backHref, children = null }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const current = normalizeGameinfoView(searchParams.get("view")) || savedView;
  const active = VIEWS.find((view) => view.id === current) || VIEWS[0];

  function choose(view) {
    if (view === current) return;
    rememberGameinfoView(view);
    // Drop a ?view= so the URL does not pin the old view over the cookie.
    const params = new URLSearchParams(searchParams.toString());
    params.delete("view");
    const query = params.toString();
    startTransition(() => {
      router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
      router.refresh();
    });
  }

  return (
    <div className="gd-modebar">
      {backHref ? <GameinfoBackLink className="gd-btn sm" href={backHref} /> : null}
      <div role="group" aria-label="มุมมอง" className="gd-seg">
        {VIEWS.map((view) => {
          const Icon = view.icon;
          return (
            <button key={view.id} type="button" aria-pressed={view.id === active.id} disabled={pending} onClick={() => choose(view.id)}>
              <Icon size={15} aria-hidden="true" /> {view.label}
            </button>
          );
        })}
      </div>
      <span className="gd-modetxt">
        {active.note}
        {isAdmin ? "" : " · ดูได้อย่างเดียว แก้ไขได้เฉพาะ Admin"}
      </span>
      {children}
    </div>
  );
}
