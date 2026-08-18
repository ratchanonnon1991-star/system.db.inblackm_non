"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

// Replaces the plain "หน้าเว็บ" nav link for admin/staff — toggles the list
// page between the normal editable view and a forced read-only preview
// (?view=1, read by src/app/gameinfo/[lang]/page.js). Role "user" never had
// edit access to begin with, so they get the plain link back, no toggle.
export default function GameinfoModeToggle({ lang, editableRole }) {
  const searchParams = useSearchParams();

  if (!editableRole) {
    return (
      <Link href={`/gameinfo/${lang}`} className="text-linear-ink-muted hover:text-linear-primary">
        หน้าเว็บ
      </Link>
    );
  }

  const isViewMode = searchParams.get("view") === "1";
  const nextParams = new URLSearchParams(searchParams.toString());
  if (isViewMode) nextParams.delete("view");
  else nextParams.set("view", "1");
  const query = nextParams.toString();
  const href = `/gameinfo/${lang}${query ? `?${query}` : ""}`;

  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 text-xs font-medium ${
        isViewMode
          ? "border-linear-hairline-strong text-linear-ink-muted hover:bg-linear-surface-2"
          : "border-linear-primary/40 bg-linear-primary/10 text-linear-primary hover:bg-linear-primary/15"
      }`}
      title={
        isViewMode
          ? "กำลังดูอย่างเดียว — กดเพื่อกลับไปโหมดแก้ไข"
          : "กำลังแก้ไขได้ — กดเพื่อดูอย่างเดียว (พรีวิว)"
      }
    >
      หน้าเว็บ · {isViewMode ? "ดูอย่างเดียว" : "แก้ไข"}
    </Link>
  );
}
