import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/session-user";
import { canViewUsdInventory } from "@/lib/usdcodashop-inventory";
import { topupInventoryPath } from "@/lib/topup-inventory";
import NeteaseInventory from "@/components/netease-inventory";

export const metadata = { title: "Netease | Topup Inventory" };
export default async function NeteasePage({ params }) {
  const { lang } = await params, actor = await getSessionUser();
  if (!actor) redirect("/");
  if (!canViewUsdInventory(actor)) redirect(topupInventoryPath(lang));
  return <NeteaseInventory lang={lang} />;
}
