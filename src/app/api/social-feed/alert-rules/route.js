import { handleApiError, jsonOk } from "@/lib/http";
import { requireAdmin } from "@/server/auth";
import { deleteSocialAlertRule, listSocialAlertPosts, listSocialAlertRules, saveSocialAlertRule, updateSocialAlertRule } from "@/server/social-feed-repository";

export async function GET(request) {
  try {
    const user = await requireAdmin(request);
    const params = request.nextUrl.searchParams;
    const rules = await listSocialAlertRules();
    const requestedId = params.get("rule") || "";
    const selectedId = rules.some((rule) => rule.id === requestedId) ? requestedId : rules[0]?.id || "";
    const result = selectedId ? await listSocialAlertPosts(user.id, selectedId, params.get("page"), params.get("pageSize")) : { posts: [], pagination: { page: 1, pageSize: "20", total: 0, totalPages: 1 } };
    return jsonOk({ rules, selectedId, ...result });
  } catch (error) { return handleApiError(error, "โหลด Rule ไม่สำเร็จ"); }
}

export async function POST(request) {
  try {
    await requireAdmin(request);
    return jsonOk({ rule: await saveSocialAlertRule(await request.json()) }, 201);
  } catch (error) { return handleApiError(error, "บันทึก Rule ไม่สำเร็จ"); }
}

export async function PATCH(request) {
  try {
    await requireAdmin(request);
    const input = await request.json();
    return jsonOk({ rule: await updateSocialAlertRule(input.id, input) });
  } catch (error) { return handleApiError(error, "แก้ไข Rule ไม่สำเร็จ"); }
}

export async function DELETE(request) {
  try {
    await requireAdmin(request);
    await deleteSocialAlertRule(request.nextUrl.searchParams.get("id"));
    return jsonOk({ ok: true });
  } catch (error) { return handleApiError(error, "ลบ Rule ไม่สำเร็จ"); }
}
