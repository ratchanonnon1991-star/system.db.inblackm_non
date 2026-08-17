import { notFound, redirect } from "next/navigation";
import { isSupportedLang } from "@/lib/projectm-i18n";
import { getSessionUser } from "@/server/session-user";
import ProjectmThemeRoot from "@/components/projectm-theme-root";

export default async function ProjectmLangLayout({ children, params }) {
  const { lang } = await params;
  if (!isSupportedLang(lang)) notFound();
  // /projectm used to be reachable by anyone who typed the URL. Every page
  // under it now needs a logged-in GameDB user so Admin-vs-Topup visibility
  // (see itune/page.js) has someone to check the permission of.
  const user = await getSessionUser();
  if (!user) redirect("/");
  return <ProjectmThemeRoot>{children}</ProjectmThemeRoot>;
}
