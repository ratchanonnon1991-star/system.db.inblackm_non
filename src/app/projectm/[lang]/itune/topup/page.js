import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { getSessionUser } from "@/server/session-user";
import { hasPermission } from "@/lib/permissions";
import {
  listClaimedItuneEntriesForUser,
  getItuneReleaseThreshold,
} from "@/server/itune-entries-repository";
import ItuneTopupView from "@/components/itune-topup-view";

export default async function ItuneTopupPage({ params }) {
  const { lang } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/");
  if (!hasPermission(user, "projectm.claim")) redirect(`/projectm/${lang}/itune`);
  const isProjectmAdmin = hasPermission(user, "projectm.admin");

  // Same "topup_inblackm" connection as itune/admin/page.js — show a notice
  // instead of a hard 500 if it hasn't been configured yet (see that page's
  // identical try/catch).
  let claims = null;
  let releaseThreshold = null;
  let loadError = null;
  try {
    [claims, releaseThreshold] = await Promise.all([
      listClaimedItuneEntriesForUser(user.id),
      getItuneReleaseThreshold(),
    ]);
  } catch (err) {
    loadError = err.message || "โหลดข้อมูลไม่สำเร็จ";
  }

  return (
    <div className="flex min-h-screen flex-col gap-5 px-4 pb-14 pt-10">
      <div className="flex items-center justify-between">
        <div>
          <span
            className="inline-flex items-center rounded-md bg-ll-surface-2 px-2 py-1 text-[12px] font-medium text-ll-ink-subtle"
            style={{ letterSpacing: "0.4px" }}
          >
            PROJECTM · ITUNE
          </span>
          <h1
            className="mt-2 font-semibold text-ll-ink"
            style={{ fontSize: 28, lineHeight: 1.2, letterSpacing: "-0.6px" }}
          >
            Topup : {user.displayName}
          </h1>
        </div>
        <div className="flex items-center gap-2">
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

      {loadError ? (
        <div className="rounded-lg border border-ll-warning/40 bg-ll-warning-bg p-6 text-sm text-ll-warning">
          {loadError}
        </div>
      ) : (
        <ItuneTopupView initialClaims={claims} releaseThreshold={releaseThreshold} />
      )}
    </div>
  );
}
