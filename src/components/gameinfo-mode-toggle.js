"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

// Everyone lands on the card dashboard. admin/staff can open the existing
// inline table editor at ?manage=1; role "user" only gets the dashboard link.
export default function GameinfoModeToggle({ lang, editableRole }) {
  const searchParams = useSearchParams();

  if (!editableRole) {
    return (
      <Link href={`/gameinfo/${lang}`} className="text-linear-ink-muted hover:text-linear-primary">
        หน้าเว็บ
      </Link>
    );
  }

  const isManageMode = searchParams.get("manage") === "1";
  const nextParams = new URLSearchParams(searchParams.toString());
  nextParams.delete("view");
  if (isManageMode) nextParams.delete("manage");
  else nextParams.set("manage", "1");
  const query = nextParams.toString();
  const href = `/gameinfo/${lang}${query ? `?${query}` : ""}`;

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
