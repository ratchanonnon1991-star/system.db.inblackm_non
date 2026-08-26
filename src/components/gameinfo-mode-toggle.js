"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Eye, Settings } from "lucide-react";
import { gameinfoGameHref, gameinfoListHref, normalizeGameinfoDataMode } from "@/lib/gameinfo-data-mode";

// Everyone lands on the card dashboard. Admin/staff can open /manage;
// role "user" only gets the dashboard link.
export default function GameinfoModeToggle({ lang, editableRole }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const dataMode = normalizeGameinfoDataMode(searchParams.get("mode"));
  const topupView = searchParams.get("view") === "topup";
  const botAutoSection = searchParams.get("section") === "game-bot-auto";

  if (!editableRole) {
    return (
      <Link href={gameinfoListHref(lang, dataMode)} className="text-linear-ink-muted hover:text-linear-primary">
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
        className="flex h-10 items-center gap-2 rounded-lg border border-linear-ink bg-linear-ink px-3 text-xs font-medium text-linear-canvas hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-linear-primary"
      >
        <Settings size={14} aria-hidden="true" /> มุมมอง Admin
      </Link>
    );
  }

  const topupButton = (
    <Link
      href={topupHref}
      className="flex h-10 items-center gap-2 rounded-lg border border-linear-hairline-strong px-3 text-xs font-medium text-linear-ink-muted hover:bg-linear-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-linear-primary"
    >
      <Eye size={14} aria-hidden="true" /> มุมมอง Topup
    </Link>
  );
  if (isBotAutoPage) return topupButton;

  return (
    <>
      {topupButton}
      <Link
        href={href}
        className={`flex h-10 items-center rounded-lg border px-3 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-linear-primary ${
          isManageMode
            ? "border-linear-hairline-strong text-linear-ink-muted hover:bg-linear-surface-2"
            : "border-linear-ink bg-linear-ink text-linear-canvas hover:opacity-90"
        }`}
        title={isManageMode ? "กลับหน้ารวมเกม" : "เปิดตารางจัดการข้อมูลเกม"}
      >
        {isManageMode ? "กลับหน้ารวมเกม" : "จัดการข้อมูล"}
      </Link>
    </>
  );
}
