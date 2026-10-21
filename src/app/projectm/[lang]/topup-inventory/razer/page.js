import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/session-user";
import { canViewUsdInventory } from "@/lib/usdcodashop-inventory";
import { topupInventoryPath } from "@/lib/topup-inventory";
import RazerInventory from "@/components/razer-inventory";
export const metadata = { title: "Razer Gold | Topup Inventory" };
export default async function RazerPage({ params }) {
  const { lang } = await params, actor = await getSessionUser();
  if (!actor) redirect("/");
  if (!canViewUsdInventory(actor)) redirect(topupInventoryPath(lang));
  return <RazerInventory lang={lang} />;
}
