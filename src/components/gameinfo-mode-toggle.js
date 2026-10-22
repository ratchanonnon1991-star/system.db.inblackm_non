"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Eye, LayoutGrid, Pencil, Settings } from "lucide-react";
import { gameinfoGameHref, gameinfoListHref, normalizeGameinfoDataMode } from "@/lib/gameinfo-data-mode";

// Everyone lands on the card dashboard. Admin/staff can open /manage;
// role "user" only gets the dashboard link. These sit on the red GameInfo
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
  const topupView = searchParams.get("view") === "topup";
  const botAutoSection = searchParams.get("section") === "game-bot-auto";

  if (!editableRole) {
    return (
      <Link href={gameinfoListHref(lang, dataMode)} className={OUTLINE_PILL}>
        หน้าเว็บ
      </Link>
    );
  }

  const isManageMode = pathname.split("/").includes("manage");
  const isBotAutoPage = pathname.split("/").includes("game-bot-auto") || botAutoSection;
  const botAutoMode = dataMode === "uid" ? "" : `&mode=${dataMode}`;
  const href = gameinfoListHref(lang, dataMode, !isManageMode);
  const gameId = pathname.split("/")[3];
  const isGamePage = /^\d+$/.test(gameId || "");
  const topupHref = isBotAutoPage
    ? `/gameinfo/${lang}?section=game-bot-auto${botAutoMode}&view=topup`
    : isGamePage
    ? gameinfoGameHref(lang, gameId, dataMode, false, !topupView)
    : gameinfoListHref(lang, dataMode, false, !topupView);
  const adminHref = isBotAutoPage
    ? `/gameinfo/${lang}?section=game-bot-auto${botAutoMode}`
    : isGamePage
    ? gameinfoGameHref(lang, gameId, dataMode, true)
    : gameinfoListHref(lang, dataMode);

  if (topupView) {
    return (
      <Link
        href={adminHref}
        className={SOLID_PILL}
        aria-label="มุมมอง Admin"
        title="มุมมอง Admin"
      >
        <Settings size={16} strokeWidth={2.4} aria-hidden="true" /> <span className="hidden md:inline">มุมมอง Admin</span>
      </Link>
    );
  }

  const topupButton = (
    <Link
      href={topupHref}
      className={OUTLINE_PILL}
      aria-label="มุมมอง Topup"
      title="มุมมอง Topup"
    >
      <Eye size={16} strokeWidth={2.2} aria-hidden="true" /> <span className="hidden md:inline">มุมมอง Topup</span>
    </Link>
  );
  if (isBotAutoPage) return topupButton;

  return (
    <>
      {topupButton}
      <Link
        href={href}
        className={SOLID_PILL}
        aria-label={isManageMode ? "กลับหน้ารวมเกม" : "จัดการข้อมูล"}
        title={isManageMode ? "กลับหน้ารวมเกม" : "เปิดตารางจัดการข้อมูลเกม"}
      >
        {isManageMode ? <LayoutGrid size={16} strokeWidth={2.4} aria-hidden="true" /> : <Pencil size={16} strokeWidth={2.4} aria-hidden="true" />}
        <span className="hidden sm:inline">{isManageMode ? "กลับหน้ารวมเกม" : "จัดการข้อมูล"}</span>
      </Link>
    </>
  );
}
