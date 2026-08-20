import { notFound } from "next/navigation";
import { Noto_Sans_Thai } from "next/font/google";
import Link from "next/link";
import { Gamepad2, LayoutGrid } from "lucide-react";
import { isSupportedLang } from "@/lib/gameinfo-i18n";
import { getSessionUser } from "@/server/session-user";
import GameinfoModeToggle from "@/components/gameinfo-mode-toggle";
import GameinfoThemeRoot from "@/components/gameinfo-theme-root";
import GameinfoThemeToggle from "@/components/gameinfo-theme-toggle";

const notoThai = Noto_Sans_Thai({
  subsets: ["thai", "latin"],
  variable: "--font-noto-thai",
});

// Light-first Linear structure with the shared red GameInfo accent. Body copy
// stays on Noto Sans Thai; negative tracking is applied only to headings.
//
// staff/admin open the existing inline game_list editor through the
// "จัดการข้อมูล" mode; role "user" gets the card dashboard only.
export default async function GameinfoLangLayout({ children, params }) {
  const { lang } = await params;
  if (!isSupportedLang(lang)) notFound();
  const user = await getSessionUser();
  const editableRole = user?.role === "admin" || user?.role === "staff";

  return (
    <GameinfoThemeRoot
      className={`${notoThai.variable} flex min-h-screen flex-col bg-linear-canvas text-linear-ink antialiased`}
      style={{ fontFamily: "var(--font-noto-thai), system-ui, sans-serif" }}
    >
      <header className="sticky top-0 z-40 border-b border-linear-hairline bg-linear-surface-1">
        <div className="flex min-h-16 items-center justify-between px-4 sm:px-6">
          <Link
            href={`/gameinfo/${lang}`}
            className="flex items-center gap-2 text-lg font-semibold tracking-[-0.2px] text-linear-ink"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-linear-primary text-white"><Gamepad2 size={19} /></span>
            <span>GameInfo</span>
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            <Link
              href="/"
              title="กลับเมนู"
              aria-label="กลับเมนู"
              className="flex h-8 w-8 items-center justify-center rounded-md border border-linear-hairline-strong text-linear-ink-muted hover:bg-linear-surface-2"
            >
              <LayoutGrid size={15} />
            </Link>
            <GameinfoThemeToggle />
            <GameinfoModeToggle lang={lang} editableRole={editableRole} />
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
