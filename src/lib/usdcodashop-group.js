import { allocateShellSale } from "./garena-shell-inventory.js";
import { convertSaleThb } from "./usdcodashop-sale-conversion.js";

// Conversion/retained quotes operate on the full payment first, then distribute
// exact satang by global bot-row position. Do not round every pack independently.
export function allocateCodaReceipt(details) {
  if (!details.saleAllocation) return details;
  const full = details.saleConversion ? convertSaleThb(details.saleNative, details.saleConversion.rate)
    : details.saleTotalThb ?? details.saleThb;
  return allocateShellSale({ ...details, saleThb: full });
}
