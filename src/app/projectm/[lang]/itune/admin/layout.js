import { Suspense } from "react";
import { redirect } from "next/navigation";
import ItuneAdminShell from "@/components/itune-admin-shell";
import { getSessionUser } from "@/server/session-user";

export default async function ItuneAdminLayout({ children, params }) {
  const { lang } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/");
  if (user.projectmRole !== "admin") redirect(`/projectm/${lang}/itune/topup`);

  return (
    <Suspense fallback={null}>
      <ItuneAdminShell lang={lang} displayName={user.displayName}>
        {children}
      </ItuneAdminShell>
    </Suspense>
  );
}
