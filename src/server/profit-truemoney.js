// Live feed: TrueMoney wallet topups via codashop_auto_api
// (codashop_orders.payment_method = 'TrueMoney'). Card = phone MSISDN.
// pack_price is THB ("฿79.20"); balances always N/A → ยอดตัด = pack_price.
import { createCodashopPhoneFeed } from "@/server/profit-codashop-phone-feed";

const feed = createCodashopPhoneFeed({ paymentMethods: ["TrueMoney"] });

export const getAllRows = feed.getAllRows;
export const accountKey = feed.accountKey;
export const listAccounts = feed.listAccounts;
export const listOrdersForAccounts = feed.listOrdersForAccounts;
export const listGameNames = feed.listGameNames;
