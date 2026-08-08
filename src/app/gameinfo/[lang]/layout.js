import { notFound } from "next/navigation";
import { Noto_Sans_Thai } from "next/font/google";
import Link from "next/link";
import { Gamepad2 } from "lucide-react";
import { isSupportedLang } from "@/lib/gameinfo-i18n";
import { getSessionUser } from "@/server/session-user";
import GameinfoModeToggle from "@/components/gameinfo-mode-toggle";

const notoThai = Noto_Sans_Thai({
  subsets: ["thai", "latin"],
  variable: "--font-noto-thai",
});

// Header/footer chrome follows the Linear-inspired system (see
// ~/.claude/skills/linear-design): near-black canvas, hairline dividers
// instead of card shadows, lavender-blue as the single accent. Body copy
// stays on Noto Sans Thai (Linear's own type family is proprietary and the
// module's copy is mostly Thai, which doesn't take the spec's negative
// letter-spacing well — see the pack/game name headings for where a little
// negative tracking is applied selectively instead of blanket-wide).
//
// No separate "จัดการข้อมูล" (admin) nav link — the module now edits
// Topup Panel's `game_list` directly, inline, on the same page everyone
// sees (see src/server/gameinfo-gamelist.js, src/components/
// gameinfo-gamelist-table.js). staff/admin get edit affordances there
// automatically by role; role "user" gets the same page read-only. The old
// games/game_packs admin pages (CRUD, CSV import, formulas) are left in the
// codebase but unlinked.
export default async function GameinfoLangLayout({ children, params }) {
  const { lang } = await params;
  if (!isSupportedLang(lang)) notFound();
  const user = await getSessionUser();
  const editableRole = user?.role === "admin" || user?.role === "staff";

  return (
    <div
      className={`${notoThai.variable} flex min-h-screen flex-col bg-linear-canvas text-linear-ink antialiased`}
      style={{ fontFamily: "var(--font-noto-thai), system-ui, sans-serif" }}
    >
      <header className="border-b border-linear-hairline bg-linear-canvas">
        <div className="flex items-center justify-between px-4 py-3">
          <Link
            href={`/gameinfo/${lang}`}
            className="flex items-center gap-2 font-bold text-linear-primary"
          >
            <Gamepad2 size={20} />
            <span>GameInfo</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm">
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
    </div>
  );
}
