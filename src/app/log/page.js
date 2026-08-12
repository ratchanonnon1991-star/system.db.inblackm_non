import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/session-user";
import LogPage from "@/components/log-page";

export const metadata = {
  title: "GameDB — ประวัติการใช้งาน",
};

// Same session gate as /systemdb, plus an Admin-only check up front so a
// Staff/User session never even reaches the client bundle -- the API routes
// this page calls (requireSuperAdmin) would refuse them anyway, but there is
// no reason to ship the page at all to someone who cannot use it.
export default async function LogRoute() {
  const user = await getSessionUser();
  if (!user) redirect("/");
  if (user.role !== "admin") redirect("/systemdb");
  return <LogPage />;
}
