import { notFound, redirect } from "next/navigation";
import { isSupportedLang } from "@/lib/projectm-i18n";
import { getSessionUser } from "@/server/session-user";
import { hasProjectmAccess } from "@/server/auth";
import ProjectmThemeRoot from "@/components/projectm-theme-root";

export default async function ProjectmLangLayout({ children, params }) {
  const { lang } = await params;
  if (!isSupportedLang(lang)) notFound();
  const user = await getSessionUser();
  if (!hasProjectmAccess(user)) redirect("/");
  return <ProjectmThemeRoot>{children}</ProjectmThemeRoot>;
}
