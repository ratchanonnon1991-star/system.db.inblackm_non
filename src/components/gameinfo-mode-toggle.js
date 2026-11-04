"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { LayoutGrid, Pencil } from "lucide-react";
import { gameinfoGameHref, gameinfoListHref, normalizeGameinfoDataMode } from "@/lib/gameinfo-data-mode";

// Everyone lands on the card dashboard. Admins can open /manage; everyone
// else only gets the dashboard link. These sit on the red GameInfo
// header: a solid white pill is the primary action, an outlined one the
// secondary.
const SOLID_PILL =
  "flex h-[42px] items-center gap-2 whitespace-nowrap rounded-full bg-white/95 px-4 text-sm font-black text-[#D90005] transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";
const OUTLINE_PILL =
  "flex h-[42px] items-center gap-2 whitespace-nowrap rounded-full border-[1.5px] border-white/70 px-4 text-sm font-bold text-white transition hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";
export default function GameinfoModeToggle({ lang, editableRole }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const dataMode = normalizeGameinfoDataMode(searchParams.get("mode"));

  if (!editableRole) {
    return (
      <Link href={gameinfoListHref(lang, dataMode)} className={OUTLINE_PILL}>
        หน้าเว็บ
      </Link>
    );
  }

  // Topup / Product is the view switch under the header now (for everyone);
  // this pill is only the way in and out of editing.
  const parts = pathname.split("/");
  const isManageMode = parts.includes("manage");
  const isBotAutoPage = parts.includes("game-bot-auto") || searchParams.get("section") === "game-bot-auto";
  if (isBotAutoPage) return null;
  const gameId = parts[3];
  const isGamePage = /^\d+$/.test(gameId || "");
  // A game's own page has แก้ไขข้อมูล on its card, behind the day's notices.
  if (isGamePage && !isManageMode) return null;
  const href = isGamePage
    ? gameinfoGameHref(lang, gameId, dataMode, !isManageMode)
    : gameinfoListHref(lang, dataMode, !isManageMode);
  const label = isManageMode ? (isGamePage ? "กลับหน้าเกม" : "กลับหน้ารวมเกม") : "จัดการข้อมูล";

  return (
    // On a game, edit ↔ view is the same game: replace, so back is the list.
    <Link href={href} replace={isGamePage} className={SOLID_PILL} aria-label={label} title={label}>
      {isManageMode ? <LayoutGrid size={16} strokeWidth={2.4} aria-hidden="true" /> : <Pencil size={16} strokeWidth={2.4} aria-hidden="true" />}
      <span className="hidden sm:inline">{label}</span>
    </Link>
  );
}
