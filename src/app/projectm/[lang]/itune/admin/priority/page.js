import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSessionUser } from "@/server/session-user";
import {
  getItuneClaimSettings,
  listItunePriorityQueue,
} from "@/server/itune-entries-repository";
import ItunePriorityTable from "@/components/itune-priority-table";

export default async function ItunePriorityPage({ params }) {
  const { lang } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/");
  // Same gate as itune/admin/page.js — projectm-admin only.
  if (user.projectmRole !== "admin") redirect(`/projectm/${lang}/itune/topup`);

  // The topup_inblackm connection may not be registered yet — show the
  // reason instead of a hard 500, same fallback shape as itune/admin/page.js.
  let entries = null;
  let settings = null;
  let loadError = null;
  try {
    [entries, settings] = await Promise.all([
      listItunePriorityQueue(),
      getItuneClaimSettings(),
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
            จัดคิวรับเมล
          </h1>
        </div>
        <Link
          href={`/projectm/${lang}/itune/admin`}
          className="flex items-center gap-2 rounded-md border border-ll-hairline-strong px-3 py-2 text-[13px] font-medium text-ll-ink transition hover:bg-ll-surface-2"
        >
          <ArrowLeft size={14} /> กลับ
        </Link>
      </div>

      {loadError ? (
        <div className="rounded-lg border border-ll-warning/40 bg-ll-warning-bg p-6 text-sm text-ll-warning">
          {loadError}
        </div>
      ) : (
        <ItunePriorityTable initialEntries={entries} initialSettings={settings} />
      )}
    </div>
  );
}
