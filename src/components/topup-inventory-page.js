import { TOPUP_INVENTORY_PROVIDERS } from "@/lib/topup-inventory";

/**
 * A Topup Inventory service page in the design's layout: "TOPUP INVENTORY · name",
 * the name large with the description under it and the page's actions beside it,
 * then the content stacked below. Name and description default to the service's
 * card on the home (provider = its key).
 */
export default function TopupInventoryPage({ provider, title, description, actions, children }) {
  const card = TOPUP_INVENTORY_PROVIDERS.find((item) => item.key === provider);
  const name = title ?? card?.name ?? "";
  return (
    <main className="tiv-page">
      <div className="tiv-crumb"><b>Topup Inventory</b> · {name}</div>
      <div className="tiv-svc-h">
        <div className="min-w-0">
          <h1>{name}</h1>
          {(description ?? card?.description) && <p className="tiv-sub">{description ?? card.description}</p>}
        </div>
        {actions && <div className="tiv-acts">{actions}</div>}
      </div>
      <div className="tiv-stack">{children}</div>
    </main>
  );
}
