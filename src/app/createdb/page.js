import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/session-user";
import CreateDbPage from "@/components/createdb-page";

export const metadata = {
  title: "GameDB — สร้างตาราง/คอลัมน์",
};

// Same gate /log uses -- Admin-only, checked server-side before the client
// bundle even ships, since the API route this page calls (requireSuperAdmin)
// would refuse anyone else anyway.
export default async function CreateDbRoute() {
  const user = await getSessionUser();
  if (!user) redirect("/");
  if (user.role !== "admin") redirect("/systemdb");
  return <CreateDbPage />;
}
