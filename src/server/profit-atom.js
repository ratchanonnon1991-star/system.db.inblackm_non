// Live feed: ATOM telco airtime via codashop_auto_api
// (codashop_orders.payment_method = 'ATOM'). Card = phone MSISDN.
// pack_price is MMK ("Ks4,200"); balances always N/A → ยอดตัด = pack_price.
// Same airtime-mm engine as U9 / Smart-Sun in codashop_auto_api.
import { createCodashopPhoneFeed } from "@/server/profit-codashop-phone-feed";

const feed = createCodashopPhoneFeed({ paymentMethods: ["ATOM"] });

export const getAllRows = feed.getAllRows;
export const accountKey = feed.accountKey;
export const listAccounts = feed.listAccounts;
export const listOrdersForAccounts = feed.listOrdersForAccounts;
export const listGameNames = feed.listGameNames;
