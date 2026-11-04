import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/session-user";
import StaffLinks from "@/components/staff-links";

export const metadata = { title: "จับคู่พนักงาน | Topup Inventory" };

// Reading and saving are Super Admin only (the API checks); others see that message.
export default async function StaffLinksPage({ params }) {
  const { lang } = await params, actor = await getSessionUser();
  if (!actor) redirect("/");
  return <StaffLinks lang={lang} />;
}
