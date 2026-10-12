import { createRoot } from "react-dom/client";
import AdminItuneUsagePanel from "@orders-panel";
import ItuneOrderAccounts from "@/components/itune-order-accounts";
createRoot(document.getElementById("root")).render(<div style={{maxWidth:960,margin:"auto",padding:12}}>
  <AdminItuneUsagePanel orderId="order-1" queueItemId="9" externalUserId="worker" />
  <ItuneOrderAccounts />
</div>);
