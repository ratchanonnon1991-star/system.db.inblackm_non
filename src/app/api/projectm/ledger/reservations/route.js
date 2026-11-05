import { requireAdmin } from "@/server/auth";
import { jsonOk } from "@/lib/http";
import { canManageUsdInventory } from "@/lib/usdcodashop-inventory";
import { inventoryLedger } from "@/server/inventory-ledger";
import { orderMappingFor } from "@/server/itune-order-usage";
import { balanceReaders, loadAlertBalances } from "@/server/inventory-alert-balances";
import { matchBotBalances } from "@/lib/inventory-bot-balances";
import { inventoryChannelOf } from "@/lib/topup-inventory";
import { ledgerFailure, readLedgerJson } from "@/server/inventory-ledger-http";

export const dynamic = "force-dynamic";

// Bot wallets that can be matched to a registry account (iTunes has its own page; card pools have no account).
const BOT_BALANCE_PROVIDERS = ["razer", "wavepay", "netease", "garena-shell", "gamepoint", "plsbuy", "donshop", "agenh2h"]
  .filter((p) => Object.hasOwn(balanceReaders, p));

// GET: every account, who holds it, and its balance (the bot's own reading when there is one,
// else the sheet's last balance plus what was recorded since). ?channel=<page key>: only that
// page's accounts, and only that page's bot is read. POST { accountId }: reserve. DELETE: release.
export async function GET(request) {
  try {
    const actor = await requireAdmin(request), channel = new URL(request.url).searchParams.get("channel");
    const [all, mapping, bot] = await Promise.all([inventoryLedger().reservations(actor), orderMappingFor(actor.id).catch(() => null),
      loadAlertBalances(BOT_BALANCE_PROVIDERS.filter((p) => !channel || p === channel)).catch(() => ({ channels: [], errors: [{ provider: "all" }] }))]);
    const accounts = channel ? all.filter((a) => inventoryChannelOf(a) === channel) : all;
    const balances = matchBotBalances(accounts, bot.channels);
    const response = jsonOk({ accounts: accounts.map((a) => ({ ...a, bot: balances.get(a.id) ?? null })),
      botErrors: bot.errors.map((e) => e.provider), mapped: Boolean(mapping), canManage: canManageUsdInventory(actor) });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (e) { return ledgerFailure(e, "reservations"); }
}

export async function POST(request) {
  try {
    const actor = await requireAdmin(request), body = await readLedgerJson(request, 1024);
    return jsonOk(await inventoryLedger().reserve(body?.accountId, actor));
  } catch (e) { return ledgerFailure(e, "reserve"); }
}

export async function DELETE(request) {
  try {
    const actor = await requireAdmin(request), body = await readLedgerJson(request, 1024);
    return jsonOk(await inventoryLedger().release(body?.accountId, actor));
  } catch (e) { return ledgerFailure(e, "release"); }
}
