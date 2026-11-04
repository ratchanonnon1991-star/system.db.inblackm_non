import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ADDRESS_CHAINS, ADDRESS_COINS, addressDecision, addressesFor, addressGroups, chainsForCoin, validateCryptoAddress } from "../src/lib/stock-addresses.js";

let passed = 0;
function check(condition, message) {
  assert.ok(condition, message);
  passed += 1;
}

const tron = "TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE";
const evm = "0x52908400098527886E0F7030069857D2E4169EE7";
const ok = (input) => validateCryptoAddress({ recipient: "YAYA", coin: "usdt", chain: "TRC20", address: tron, ...input });

check(ok({}).address.coin === "USDT" && ok({}).address.chain === "TRC20", "a TRC20 address is saved with its coin upper-cased");
check(ok({ address: ` ${tron.slice(0, 10)}\n${tron.slice(10)} ` }).address.address === tron, "spaces and line breaks pasted with an address are removed");
check(!ok({ address: evm }).error && /TRC20/.test(ok({ address: evm }).warning) && !ok({}).warning, "an address unlike its known chain is saved with a warning, not refused");
check(/TRC20/.test(ok({ address: tron.slice(0, -1) }).warning), "a cut-off paste is warned about");
check(!ok({ chain: "Sei", address: "37SVMgKchmtb2XJB4r2ApCme6U181JbPZ7" }).error && ok({ chain: "Sei", address: "x" }).address.chain === "Sei" && !ok({ chain: "Sei", address: "x" }).warning, "any other app's chain and address are accepted as given");
check(ok({ chain: "BSC (BEP20)", address: evm }).address.chain === "BEP20", "a chain picked by its Bybit name is stored by its code");
check(!ok({ chain: "BEP20", address: evm }).error && !ok({ chain: "ARBITRUM", address: evm.toLowerCase() }).error, "EVM chains take a 0x address");
check(!ok({ chain: "TON", address: "UQBvW8Z5huBkMJYdnfAEM5JqTNkuWX3diqYENkWsIL0XggGG", memo: "123 456" }).error
  && ok({ chain: "TON", address: "UQBvW8Z5huBkMJYdnfAEM5JqTNkuWX3diqYENkWsIL0XggGG", memo: "123 456" }).address.memo === "123456", "TON takes a memo, spaces removed");
check(!ok({ chain: "BYBIT_UID", address: "123456789" }).warning && Boolean(ok({ chain: "BYBIT_UID", address: "12ab" }).warning), "an internal Bybit transfer goes by UID");
check(Boolean(ok({ recipient: " " }).error) && Boolean(ok({ chain: " " }).error) && Boolean(ok({ coin: "u$" }).error) && Boolean(ok({ address: "x".repeat(201) }).error), "a recipient, a chain, a coin and a sane address length are needed");

const pending = { status: "pending", createdById: 5 };
check(Boolean(addressDecision(pending, "confirm", { id: 5 }).error) && Boolean(addressDecision(pending, "confirm", { id: "5" }).error), "whoever added an address cannot confirm it");
check(addressDecision(pending, "confirm", { id: 9 }).status === "confirmed", "someone else confirms it");
check(Boolean(addressDecision({ ...pending, status: "confirmed" }, "confirm", { id: 9 }).error), "a confirmed address is not confirmed twice");
check(Boolean(addressDecision(pending, "retire", { id: 9 }).error) && addressDecision(pending, "retire", { id: 9 }, "ผู้รับเปลี่ยน address").status === "retired", "retiring needs a reason");
check(Boolean(addressDecision({ status: "retired" }, "confirm", { id: 9 }).error) && Boolean(addressDecision(pending, "confirm", null).error), "a retired address stays retired; nobody signed in decides nothing");

check(addressGroups("TQn9Y2kh").join() === "TQn9,Y2kh" && addressGroups("").length === 0, "addresses read in groups of four");
const list = [
  { id: 1, recipient: "YAYA", coin: "USDT", status: "pending" },
  { id: 2, recipient: "YAYA", coin: "USDT", status: "confirmed" },
  { id: 3, recipient: "YAYA", coin: "BTC", status: "confirmed" },
  { id: 4, recipient: "BAO", coin: "USDT", status: "confirmed" },
  { id: 5, recipient: "YAYA", coin: "USDT", status: "retired" },
];
check(addressesFor(list, { recipient: "yaya", coin: "usdt" }).map((entry) => entry.id).join() === "2,1", "an order's supplier and coin pick its addresses, usable first, retired left out");

const repository = readFileSync(new URL("../src/server/stock-address-repository.js", import.meta.url), "utf8");
check(!/DELETE FROM stock_crypto_addresses/.test(repository) && repository.includes("addressDecision") && repository.includes("WHERE status <> 'retired'"), "addresses are never deleted, decisions go through the rule, one live row per address");
const card = readFileSync(new URL("../src/components/crypto-address-card.js", import.meta.url), "utf8");
check(card.includes("copy={usable ? { value: entry.address"), "only a confirmed address can be copied");

const usdt = chainsForCoin("USDT");
check(usdt.usual.some((chain) => chain.code === "TRC20") && usdt.usual.some((chain) => chain.code === "BEP20") && usdt.other.some((chain) => chain.code === "BTC")
  && usdt.usual.length + usdt.other.length === ADDRESS_CHAINS.length, "every chain is offered, the coin's usual ones first");
check(chainsForCoin("BTC").usual.map((chain) => chain.code).join() === "BTC,BYBIT_UID" && chainsForCoin("SHIB").usual.length === 1, "a coin's chains follow it; an unlisted coin still gets every chain under the rest");
check(ADDRESS_COINS.includes("USDT") && ADDRESS_COINS.includes("ETH") && ADDRESS_COINS.length >= 15 && new Set(ADDRESS_CHAINS.map((chain) => chain.code)).size === ADDRESS_CHAINS.length, "the coin and chain lists are full and unique");
check(!ok({ chain: "XRP", address: "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh", memo: "12345" }).warning && !ok({ chain: "LTC", address: "ltc1qg82ekspz2p6dvz2jlrlvnfy4x6mmmxwdtxs8vz" }).warning, "XRP and Litecoin addresses are recognised");
console.log(`stock addresses: ${passed} passed`);
