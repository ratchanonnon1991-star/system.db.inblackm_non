import { getSessionUser } from "@/server/session-user";
import { canManageStock } from "@/server/auth";
import { listPendingStockOrders } from "@/server/stock-pending-orders";
import StockPendingOrders from "@/components/stock-pending-orders";

export const dynamic = "force-dynamic";
export const metadata = { title: "GameDB — รอตัด Stock" };

// ?days= picks the window (7/14/30/60, default 14).
export default async function StockPendingPage({ searchParams }) {
  const params = (await searchParams) || {};
  const user = await getSessionUser();
  const data = await listPendingStockOrders({ days: params.days });
  return <StockPendingOrders data={data} canEdit={canManageStock(user)} />;
}
