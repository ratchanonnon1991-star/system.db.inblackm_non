"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Boxes, Eye, Layers } from "lucide-react";
import { normalizeGameinfoView, rememberGameinfoView } from "@/lib/gameinfo-view";

const VIEWS = [
  { id: "topup", label: "Topup", icon: Eye, note: "สำหรับทีมเติม: ราคา ช่องทาง และคำแนะนำ · ไม่แสดงคอลัมน์ที่ตั้งซ่อนไว้สำหรับ Topup" },
  { id: "product", label: "Product", icon: Boxes, note: "แสดงราคา ต้นทุน กำไร และทุกคอลัมน์" },
];

// The bar under the GameInfo header: anyone can switch between the two
// views; whether they can edit is shown beside it and depends only on the
// gameinfo.admin permission.
export default function GameinfoViewSwitch({ savedView, isAdmin }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const current = normalizeGameinfoView(searchParams.get("view")) || savedView;
  const active = VIEWS.find((view) => view.id === current) || VIEWS[0];

  // Only a game's detail page (/gameinfo/<lang>/<id>) differs between the
  // views; everywhere else the bar would switch nothing visible.
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length !== 3 || !/^\d+$/.test(segments[2])) return null;

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
    <div className="border-b border-linear-hairline bg-linear-surface-1">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 sm:px-7">
        <span className="flex items-center gap-1.5 text-[13px] font-extrabold text-linear-ink-muted">
          <Layers size={15} aria-hidden="true" /> มุมมอง
        </span>
        <div role="group" aria-label="สลับมุมมอง" className="flex gap-[3px] rounded-full bg-linear-surface-3 p-[3px]">
          {VIEWS.map((view) => {
            const Icon = view.icon;
            const on = view.id === active.id;
            return (
              <button
                key={view.id}
                type="button"
                aria-pressed={on}
                disabled={pending}
                onClick={() => choose(view.id)}
                className={`flex h-9 items-center gap-1.5 rounded-full px-4 text-[13px] font-extrabold transition disabled:opacity-70 ${on
                  ? view.id === "topup" ? "bg-[#D90005] text-white" : "bg-[#18181B] text-white dark:bg-white dark:text-[#18181B]"
                  : "text-linear-ink-muted hover:text-linear-ink"}`}
              >
                <Icon size={15} aria-hidden="true" /> {view.label}
              </button>
            );
          })}
        </div>
        <span className="hidden text-[13px] text-linear-ink-muted md:inline">{active.note}</span>
        <span className="ml-auto flex items-center gap-2 text-[13px] text-linear-ink-muted">
          <span className={`rounded-md px-2 py-0.5 text-[11px] font-black tracking-[0.08em] ${isAdmin ? "bg-[#18181B] text-white dark:bg-white dark:text-[#18181B]" : "bg-linear-surface-3 text-linear-ink-muted"}`}>
            {isAdmin ? "ADMIN" : "USER"}
          </span>
          {isAdmin ? "แก้ไขข้อมูลได้" : "ดูได้อย่างเดียว · แก้ไขได้เฉพาะ Admin"}
        </span>
      </div>
    </div>
  );
}
