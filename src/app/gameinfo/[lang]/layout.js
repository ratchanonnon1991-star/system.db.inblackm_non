import { notFound, redirect } from "next/navigation";
import { Lato, Noto_Sans_Thai } from "next/font/google";
import Link from "next/link";
import { ChevronRight, Gamepad2, LayoutGrid } from "lucide-react";
import { isSupportedLang } from "@/lib/gameinfo-i18n";
import { getSessionUser } from "@/server/session-user";
import { canManageGameinfo, hasGameinfoAccess } from "@/server/auth";
import GameinfoModeToggle from "@/components/gameinfo-mode-toggle";
import GameinfoProfileMenu from "@/components/gameinfo-profile-menu";
import GameinfoThemeRoot from "@/components/gameinfo-theme-root";
import GameinfoThemeToggle from "@/components/gameinfo-theme-toggle";

const notoThai = Noto_Sans_Thai({
  subsets: ["thai", "latin"],
  variable: "--font-noto-thai",
});
const ROLE_LABELS = { admin: "Admin", staff: "Staff", user: "User" };
const lato = Lato({
  subsets: ["latin"],
  weight: ["400", "700", "900"],
  variable: "--font-ib-lato",
});

// Light-first Linear structure under an inblackm.com-style header: brand red
// (the same in both themes), Lato for Latin copy and numbers, Noto Sans Thai
// for the Thai.
//
// Topup and role "user" get the card dashboard only.
export default async function GameinfoLangLayout({ children, params }) {
  const { lang } = await params;
  if (!isSupportedLang(lang)) notFound();
  const user = await getSessionUser();
  if (!hasGameinfoAccess(user)) redirect("/");
  const editableRole = canManageGameinfo(user);

  return (
    <GameinfoThemeRoot
      className={`${notoThai.variable} ${lato.variable} flex min-h-screen flex-col bg-linear-canvas text-linear-ink antialiased`}
      style={{ fontFamily: "var(--font-ib-lato), var(--font-noto-thai), system-ui, sans-serif" }}
    >
      {/* Kept at h-16: the mobile filter drawer in gameinfo-gamelist-cards.js
          opens below it at top-16. */}
      <header className="sticky top-0 z-40 bg-[#D90005] shadow-[0_10px_30px_rgba(143,0,25,0.28)]">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-3 px-4 sm:px-7">
          <Link
            href="/"
            title="กลับเมนู"
            aria-label="กลับเมนู"
            className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-white/95 text-[#D90005] transition hover:bg-white"
          >
            <LayoutGrid size={18} strokeWidth={2.2} />
          </Link>
          <div className="flex min-w-0 items-center gap-2.5 text-white">
            <span className="hidden text-[22px] font-black leading-none tracking-[0.01em] sm:inline">INBLACKM</span>
            <ChevronRight size={16} strokeWidth={2.4} className="hidden text-[#FFC9CB] sm:block" aria-hidden="true" />
            <Link href={`/gameinfo/${lang}`} aria-label="GameInfo" className="flex items-center gap-2 text-xl font-black text-white">
              <Gamepad2 size={22} strokeWidth={2.2} aria-hidden="true" />
              {/* Phones need the room for the header buttons and the profile menu. */}
              <span className="hidden sm:inline">GameInfo</span>
            </Link>
          </div>
          <nav className="ml-auto flex items-center gap-2">
            <GameinfoThemeToggle />
            <GameinfoModeToggle lang={lang} editableRole={editableRole} />
            <GameinfoProfileMenu name={user?.displayName || user?.username || ""} role={ROLE_LABELS[user?.role] || ""} />
          </nav>
        </div>
      </header>
      {/* min-w-0 overrides the flex item's default min-width:auto — without
          it, a wide pack table nested inside forces this whole column wider
          than the viewport instead of scrolling inside its own box. */}
      <main className="min-w-0 flex-1">{children}</main>
      <footer className="border-t border-linear-hairline bg-linear-canvas py-4 text-center text-xs text-linear-ink-tertiary">
        GameInfo · ฐานข้อมูลการเติมเกม
      </footer>
    </GameinfoThemeRoot>
  );
}
