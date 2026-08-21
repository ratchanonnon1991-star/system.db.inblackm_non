"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { gameinfoListHref, normalizeGameinfoDataMode } from "@/lib/gameinfo-data-mode";

// Everyone lands on the card dashboard. Admin/staff can open /manage;
// role "user" only gets the dashboard link.
export default function GameinfoModeToggle({ lang, editableRole }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const dataMode = normalizeGameinfoDataMode(searchParams.get("mode"));

  if (!editableRole) {
    return (
      <Link href={gameinfoListHref(lang, dataMode)} className="text-linear-ink-muted hover:text-linear-primary">
        หน้าเว็บ
      </Link>
    );
  }

  const isManageMode = pathname.split("/").includes("manage");
  const href = gameinfoListHref(lang, dataMode, !isManageMode);

  return (
    <Link
      href={href}
      className={`rounded-lg border px-3 py-2 text-xs font-medium ${
        isManageMode
          ? "border-linear-hairline-strong text-linear-ink-muted hover:bg-linear-surface-2"
          : "border-linear-ink bg-linear-ink text-linear-canvas hover:opacity-90"
      }`}
      title={
        isManageMode
          ? "กลับหน้ารวมเกม"
          : "เปิดตารางจัดการข้อมูลเกม"
      }
    >
      {isManageMode ? "กลับหน้ารวมเกม" : "จัดการข้อมูล"}
    </Link>
  );
}
