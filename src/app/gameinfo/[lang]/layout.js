import { notFound } from "next/navigation";
import { Noto_Sans_Thai } from "next/font/google";
import Link from "next/link";
import { isSupportedLang } from "@/lib/gameinfo-i18n";
import { getSessionUser } from "@/server/session-user";

const notoThai = Noto_Sans_Thai({
  subsets: ["thai", "latin"],
  variable: "--font-noto-thai",
});

// Header/footer chrome matches gameinfo's own root layout (logo, "หน้าเว็บ" /
// "จัดการข้อมูล" nav, slate-50 background, Noto Sans Thai) so the module reads
// as a continuation of that app rather than a generic systemdb screen.
export default async function GameinfoLangLayout({ children, params }) {
  const { lang } = await params;
  if (!isSupportedLang(lang)) notFound();

  const user = await getSessionUser();
  const canEdit = Boolean(user) && user.role !== "user";

  return (
    <div
      className={`${notoThai.variable} flex min-h-screen flex-col bg-slate-50 text-slate-800 antialiased`}
      style={{ fontFamily: "var(--font-noto-thai), system-ui, sans-serif" }}
    >
      <header className="border-b border-slate-200 bg-white">
        <div className="flex items-center justify-between px-4 py-3">
          <Link href={`/gameinfo/${lang}`} className="flex items-center gap-2 font-bold text-indigo-600">
            <span className="text-xl">🎮</span>
            <span>GameInfo</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href={`/gameinfo/${lang}`} className="text-slate-600 hover:text-indigo-600">
              หน้าเว็บ
            </Link>
            {canEdit && (
              <Link
                href={`/gameinfo/${lang}/admin`}
                className="rounded-md bg-indigo-600 px-3 py-1.5 font-medium text-white hover:bg-indigo-700"
              >
                จัดการข้อมูล
              </Link>
            )}
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-400">
        GameInfo · ฐานข้อมูลการเติมเกม
      </footer>
    </div>
  );
}
