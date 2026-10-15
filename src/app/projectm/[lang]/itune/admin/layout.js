import { Suspense } from "react";
import { redirect } from "next/navigation";
import ItuneAdminShell from "@/components/itune-admin-shell";
import { ituneInventoryPath } from "@/lib/topup-inventory";
import { getSessionUser } from "@/server/session-user";
import { hasPermission } from "@/lib/permissions";

export default async function ItuneAdminLayout({ children, params }) {
  const { lang } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/");
  if (!hasPermission(user, "projectm.admin")) redirect(ituneInventoryPath(lang));

  return (
    <Suspense fallback={null}>
      <ItuneAdminShell lang={lang} displayName={user.displayName}>
        {children}
      </ItuneAdminShell>
    </Suspense>
  );
}
