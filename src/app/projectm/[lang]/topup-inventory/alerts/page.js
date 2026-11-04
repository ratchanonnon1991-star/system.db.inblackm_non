import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/session-user";
import { canViewUsdInventory } from "@/lib/usdcodashop-inventory";
import TopupInventoryPage from "@/components/topup-inventory-page";
import InventoryAlertSettings from "@/components/inventory-alert-settings";

export const metadata = { title: "แจ้งเตือนสต็อก Telegram | Topup Inventory" };
export default async function InventoryAlertsPage() {
  if (!canViewUsdInventory(await getSessionUser())) redirect("/");
  return <TopupInventoryPage provider="alerts"><InventoryAlertSettings /></TopupInventoryPage>;
}
