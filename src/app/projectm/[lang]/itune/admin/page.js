import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSessionUser } from "@/server/session-user";
import { listItuneEntries } from "@/server/itune-entries-repository";
import ItuneAdminTable from "@/components/itune-admin-table";

export default async function ItuneAdminPage({ params }) {
  const { lang } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/");
  // Only the projectm-admin permission (independent of the GameDB role) may
  // reach this page — typing the URL directly doesn't bypass it, the hub's
  // card being hidden is a courtesy, not the actual gate.
  if (user.projectmRole !== "admin") redirect(`/projectm/${lang}/itune/topup`);

  // projectm_itune_entries lives in the "topup_inblackm" external connection
  // (see itune-entries-repository.js), not this app's own primary DB — if
  // that connection hasn't been added yet via the Connections page, show a
  // notice instead of a hard 500 (same fallback shape as
  // gameinfo/[lang]/page.js's loadError handling).
  let entries = null;
  let loadError = null;
  try {
    entries = await listItuneEntries();
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
            Admin
          </h1>
        </div>
        <Link
          href={`/projectm/${lang}/itune`}
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
        <ItuneAdminTable initialEntries={entries} />
      )}
    </div>
  );
}
