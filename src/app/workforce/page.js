import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/session-user";
import { hasPermission } from "@/lib/permissions";
import WorkforceDashboard from "@/components/workforce-dashboard";

export const metadata = { title: "วางกำลังคน · INBLACKM Tools" };
export default async function WorkforcePage() {
  const user = await getSessionUser();
  if (!user || (user.role !== "admin" && !hasPermission(user, "workforce.access"))) redirect("/");
  return <WorkforceDashboard />;
}
