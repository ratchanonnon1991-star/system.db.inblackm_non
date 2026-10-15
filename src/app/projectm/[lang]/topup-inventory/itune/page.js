import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ShieldCheck, Wallet } from "lucide-react";
import { getSessionUser } from "@/server/session-user";
import { hasPermission } from "@/lib/permissions";
import { topupInventoryPath } from "@/lib/topup-inventory";

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
    <div className="flex min-h-screen flex-col items-center gap-8 px-4 pb-14 pt-10">
      <div className="w-full max-w-2xl">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <span
              className="inline-flex items-center rounded-md bg-ll-surface-2 px-2 py-1 text-[12px] font-medium text-ll-ink-subtle"
              style={{ letterSpacing: "0.4px" }}
            >
              TOPUP INVENTORY
            </span>
            <h1
              className="mt-2 font-semibold text-ll-ink"
              style={{ fontSize: 28, lineHeight: 1.2, letterSpacing: "-0.6px" }}
            >
              iTune — เลือกฝั่งที่ต้องการเข้าใช้งาน
            </h1>
          </div>
          <Link
            href={topupInventoryPath(lang)}
            title="กลับ Topup Inventory"
            aria-label="กลับ Topup Inventory"
            className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md border border-ll-hairline-strong text-ll-ink-subtle hover:bg-ll-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ll-primary"
          >
            <ArrowLeft size={15} aria-hidden />
          </Link>
        </div>
        <div className={`grid gap-3 ${SECTIONS.length > 1 ? "sm:grid-cols-2" : ""}`}>
          {SECTIONS.map((section) => {
            const Icon = section.icon;
            return (
              <Link
                key={section.key}
                href={`/projectm/${lang}/itune/${section.key}`}
                className="flex items-center gap-3 rounded-lg border border-ll-hairline bg-ll-surface-1 p-4 text-left shadow-[var(--ll-shadow-card)] hover:border-ll-hairline-strong hover:bg-ll-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ll-primary"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-ll-surface-2 text-ll-ink-subtle">
                  <Icon size={18} />
                </span>
                <span className="text-left">
                  <span className="block text-[16px] font-medium text-ll-ink">
                    {section.label}
                  </span>
                  <span className="block text-[13px] text-ll-ink-subtle">
                    {section.desc}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
        {!SECTIONS.length && <p className="rounded-lg border border-ll-hairline bg-ll-surface-1 p-4 text-sm text-ll-ink-subtle">บัญชีนี้ยังไม่มีสิทธิ์ iTune กรุณาติดต่อผู้ดูแลเพื่อขอสิทธิ์ Admin หรือ Topup</p>}
      </div>
    </div>
  );
}
