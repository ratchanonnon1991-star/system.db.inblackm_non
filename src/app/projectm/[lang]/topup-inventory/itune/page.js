import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, ShieldCheck, Wallet } from "lucide-react";
import { getSessionUser } from "@/server/session-user";
import { hasPermission } from "@/lib/permissions";
import TopupInventoryPage from "@/components/topup-inventory-page";

export const metadata = { title: "iTune | Topup Inventory" };

const ALL_SECTIONS = [
  {
    key: "admin",
    label: "Admin",
    desc: "จัดการฝั่งแอดมิน",
    icon: ShieldCheck,
  },
  {
    key: "topup",
    label: "Topup",
    desc: "จัดการฝั่งเติมเงิน",
    icon: Wallet,
  },
];

export default async function ItuneLangPage({ params }) {
  const { lang } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/");
  const SECTIONS = ALL_SECTIONS.filter((section) =>
    hasPermission(user, section.key === "admin" ? "projectm.admin" : "projectm.claim")
  );

  return (
    <TopupInventoryPage provider="itune" description="เลือกฝั่งที่ต้องการเข้าใช้งาน">
      {SECTIONS.length > 0 && <div className="tiv-two">
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          return (
            <Link key={section.key} href={`/projectm/${lang}/itune/${section.key}`} className="tiv-card group flex items-center gap-4 transition hover:-translate-y-1">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-ll-primary text-white shadow-[0_6px_14px_-4px_var(--red)]"><Icon size={22} aria-hidden /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-[family-name:var(--font-display)] text-lg font-bold">{section.label}</span>
                <span className="block text-sm text-ll-ink-subtle">{section.desc}</span>
              </span>
              <span className="grid h-8 w-8 place-items-center rounded-full bg-ll-surface-2 transition group-hover:rotate-45 group-hover:bg-ll-primary group-hover:text-white"><ArrowUpRight size={15} aria-hidden /></span>
            </Link>
          );
        })}
      </div>}
      {!SECTIONS.length && <div className="tiv-dempty"><strong>ยังไม่มีสิทธิ์ iTune</strong>บัญชีนี้ยังไม่มีสิทธิ์ iTune กรุณาติดต่อผู้ดูแลเพื่อขอสิทธิ์ Admin หรือ Topup</div>}
    </TopupInventoryPage>
  );
}
