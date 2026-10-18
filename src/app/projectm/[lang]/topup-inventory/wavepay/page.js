import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/session-user";
import { canViewUsdInventory } from "@/lib/usdcodashop-inventory";
import { topupInventoryPath } from "@/lib/topup-inventory";
import WavePayInventory from "@/components/wavepay-inventory";

export const metadata = { title: "WavePay | Topup Inventory" };
export default async function WavePayPage({ params }) {
  const { lang } = await params; const actor = await getSessionUser();
  if (!actor) redirect("/");
  if (!canViewUsdInventory(actor)) redirect(topupInventoryPath(lang));
  return <WavePayInventory lang={lang} />;
}
