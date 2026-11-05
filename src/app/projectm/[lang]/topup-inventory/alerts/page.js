import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/session-user";
import { canViewUsdInventory } from "@/lib/usdcodashop-inventory";
import { topupInventoryPath } from "@/lib/topup-inventory";
import InventoryAlertSettings from "@/components/inventory-alert-settings";

export const metadata = { title: "แจ้งเตือนสต็อก Telegram | Topup Inventory" };
export default async function InventoryAlertsPage({ params }) {
  const { lang } = await params;
  if (!canViewUsdInventory(await getSessionUser())) redirect("/");
  return <main className="mx-auto min-h-screen max-w-7xl space-y-6 px-4 py-10 text-ll-ink sm:px-6">
    <Link className="inline-flex min-h-11 items-center underline" href={topupInventoryPath(lang)}>กลับ Topup Inventory</Link>
    <h1 className="text-2xl font-semibold">แจ้งเตือนสต็อกผ่าน Telegram</h1>
    <InventoryAlertSettings />
  </main>;
}
