import { redirect } from "next/navigation";
import { Lato, Noto_Sans_Thai } from "next/font/google";
import Link from "next/link";
import { Boxes, ChevronRight, LayoutGrid } from "lucide-react";
import { getSessionUser } from "@/server/session-user";
import { hasStockAccess } from "@/server/auth";
import GameinfoProfileMenu from "@/components/gameinfo-profile-menu";
import StockNav from "@/components/stock-nav";

const notoThai = Noto_Sans_Thai({ subsets: ["thai", "latin"], variable: "--font-noto-thai" });
const lato = Lato({ subsets: ["latin"], weight: ["400", "700", "900"], variable: "--font-ib-lato" });
const ROLE_LABELS = { admin: "Admin", staff: "Staff", user: "User" };

export const metadata = { title: "GameDB — Stock" };

// The same inblackm.com-style header as GameInfo, over a light page.
export default async function StockLayout({ children }) {
  const user = await getSessionUser();
  if (!hasStockAccess(user)) redirect("/");

  return (
    <div
      className={`${notoThai.variable} ${lato.variable} flex min-h-screen flex-col bg-zinc-100 text-zinc-900 antialiased`}
      style={{ fontFamily: "var(--font-ib-lato), var(--font-noto-thai), system-ui, sans-serif" }}
    >
      <header className="sticky top-0 z-40 bg-[#D90005] shadow-[0_10px_30px_rgba(143,0,25,0.28)]">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-3 px-4 sm:px-7">
          <Link href="/" title="กลับเมนู" aria-label="กลับเมนู" className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-white/95 text-[#D90005] transition hover:bg-white">
            <LayoutGrid size={18} strokeWidth={2.2} />
          </Link>
          <div className="flex min-w-0 items-center gap-2.5 text-white">
            <span className="hidden text-[22px] font-black leading-none sm:inline">INBLACKM</span>
            <ChevronRight size={16} strokeWidth={2.4} className="hidden text-[#FFC9CB] sm:block" aria-hidden="true" />
            <Link href="/stock" className="flex items-center gap-2 text-xl font-black text-white">
              <Boxes size={22} strokeWidth={2.2} aria-hidden="true" /> Stock
            </Link>
          </div>
          <nav className="ml-auto flex items-center gap-2">
            <GameinfoProfileMenu name={user?.displayName || user?.username || ""} role={ROLE_LABELS[user?.role] || ""} />
          </nav>
        </div>
      </header>
      <StockNav />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
