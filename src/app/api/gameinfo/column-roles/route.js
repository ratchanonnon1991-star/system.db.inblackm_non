import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireGameinfoAccess, requireGameinfoEditor } from "@/server/auth";
import {
  listGameinfoColumnRoleRules,
  saveGameinfoColumnRoleRules,
} from "@/server/gameinfo-column-roles";
import { listGamelistPackColumnRegistry } from "@/server/gameinfo-gamelist-packs";
import { GAMEINFO_COLUMN_ROLES } from "@/lib/gameinfo-column-roles";

// Read is open to anyone who can see GameInfo: every pack page needs the rules
// to know what to draw, including the topup users the rules are about.
export async function GET(request) {
  try {
    await requireGameinfoAccess(request);
    const [rules, columns] = await Promise.all([
      listGameinfoColumnRoleRules(),
      listGamelistPackColumnRegistry(),
    ]);
    return jsonOk({
      rules,
      columns: columns.map((column) => ({ key: column.columnKey, label: column.label })),
      roles: GAMEINFO_COLUMN_ROLES,
    });
  } catch (error) {
    return handleApiError(error, "โหลดสิทธิ์คอลัมน์ไม่สำเร็จ");
  }
}

// Writing is an admin decision about what other people see.
export async function PUT(request) {
  try {
    await requireGameinfoEditor(request);
    const body = await request.json();
    if (!GAMEINFO_COLUMN_ROLES.includes(body?.role)) return jsonError("role ไม่ถูกต้อง", 400);
    const gameId = Number(body?.gameId) || 0;
    if (!Number.isSafeInteger(gameId) || gameId < 0) return jsonError("gameId ไม่ถูกต้อง", 400);
    const hiddenColumnKeys = Array.isArray(body?.hiddenColumnKeys)
      ? body.hiddenColumnKeys.map((key) => String(key))
      : [];
    const shownColumnKeys = Array.isArray(body?.shownColumnKeys)
      ? body.shownColumnKeys.map((key) => String(key))
      : [];
    const rules = await saveGameinfoColumnRoleRules({
      role: body.role,
      gameId,
      hiddenColumnKeys,
      shownColumnKeys,
    });
    return jsonOk({ rules });
  } catch (error) {
    return handleApiError(error, "บันทึกสิทธิ์คอลัมน์ไม่สำเร็จ");
  }
}
