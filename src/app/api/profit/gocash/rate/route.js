import { handleApiError, jsonOk } from "@/lib/http";
import { requireProfitAccess, requireProfitEditor } from "@/server/auth";
import { getGocashRate, setGocashRate } from "@/server/profit-repository";

// GoCash's own deal rate (support's actual buy-in rate, see the comment in
// profit-repository.js) -- plain manual entry, no live source yet. Combines
// with the auto-synced USD:THB rate (see /api/profit/gocash/usd-thb-rate) to
// produce the cost multiplier: cost = deducted(USD) * usdThbRate * gocashRate.
export async function GET(request) {
  try {
    await requireProfitAccess(request);
    return jsonOk({ rate: await getGocashRate() });
  } catch (err) {
    return handleApiError(err, "โหลดเรท GoCash ไม่สำเร็จ");
  }
}

export async function PATCH(request) {
  try {
    await requireProfitEditor(request);
    const body = await request.json();
    const rate = await setGocashRate(body.rate);
    return jsonOk({ rate });
  } catch (err) {
    return handleApiError(err, "ตั้งเรท GoCash ไม่สำเร็จ");
  }
}
