import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/session-user";
import { canViewUsdInventory } from "@/lib/usdcodashop-inventory";
import { topupInventoryPath } from "@/lib/topup-inventory";
import GamepointInventory from "@/components/gamepoint-inventory";
export const metadata = { title: "(MYR) Gamepoint | Topup Inventory" };
export default async function GamepointPage({ params }) {
  const { lang } = await params, actor = await getSessionUser();
  if (!actor) redirect("/");
  if (!canViewUsdInventory(actor)) redirect(topupInventoryPath(lang));
  return <GamepointInventory lang={lang} />;
}
