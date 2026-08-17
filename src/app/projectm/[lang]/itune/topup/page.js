import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ShieldCheck, Wallet } from "lucide-react";
import { getSessionUser } from "@/server/session-user";

export default async function ItuneTopupPage({ params }) {
  const { lang } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/");
  const isProjectmAdmin = user.projectmRole === "admin";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-16">
      <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-lg border border-ll-hairline bg-ll-surface-1 p-10 text-center shadow-[var(--ll-shadow-card)]">
        <span className="flex h-11 w-11 items-center justify-center rounded-md bg-ll-surface-2 text-ll-ink-subtle">
          <Wallet size={20} />
        </span>
        <h1
          className="font-semibold text-ll-ink"
          style={{ fontSize: 22, lineHeight: 1.25, letterSpacing: "-0.4px" }}
        >
          Itune Topup
        </h1>
        <p className="text-[14px] text-ll-ink-subtle">อยู่ระหว่างพัฒนา</p>
        <div className="mt-2 flex items-center gap-2">
          <Link
            href={`/projectm/${lang}/itune`}
            className="flex items-center gap-2 rounded-md border border-ll-hairline-strong px-3 py-2 text-[13px] font-medium text-ll-ink transition hover:bg-ll-surface-2"
          >
            <ArrowLeft size={14} /> กลับ
          </Link>
          {isProjectmAdmin && (
            <Link
              href={`/projectm/${lang}/itune/admin`}
              className="flex items-center gap-2 rounded-md bg-ll-primary px-3 py-2 text-[13px] font-medium text-ll-on-primary transition hover:bg-ll-primary-hover"
            >
              <ShieldCheck size={14} /> ไปหน้า Admin
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
