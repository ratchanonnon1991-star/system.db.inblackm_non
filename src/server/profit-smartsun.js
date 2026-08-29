// Live feed: Smart/Sun (PH) telco airtime via codashop_auto_api
// (codashop_orders.payment_method = 'Smart/Sun'). Card = phone MSISDN.
// pack_price is PHP ("₱299"); balances always N/A → ยอดตัด = pack_price.
import { createCodashopPhoneFeed } from "@/server/profit-codashop-phone-feed";

const feed = createCodashopPhoneFeed({ paymentMethods: ["Smart/Sun"] });

export const getAllRows = feed.getAllRows;
export const accountKey = feed.accountKey;
export const listAccounts = feed.listAccounts;
export const listOrdersForAccounts = feed.listOrdersForAccounts;
export const listGameNames = feed.listGameNames;
