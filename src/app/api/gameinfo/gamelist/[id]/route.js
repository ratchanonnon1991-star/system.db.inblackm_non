import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireGameinfoEditor } from "@/server/auth";
import { deleteGameListRow, getGameListRow, updateGameListRow } from "@/server/gameinfo-gamelist";
import { recordEdit } from "@/server/gamedb-edit-log";
import { requestMeta } from "@/lib/request-meta";
import { normalizeGameinfoDataMode } from "@/lib/gameinfo-data-mode";
import { updateGameinfoModeData } from "@/server/gameinfo-mode-data";

export async function PUT(request, { params }) {
  try {
    const admin = await requireGameinfoEditor(request);
    const { id } = await params;
    const body = await request.json();
    const mode = normalizeGameinfoDataMode(request.nextUrl.searchParams.get("mode"));
    if (mode === "idpass") {
      const data = await updateGameinfoModeData(Number(id), mode, (current) => ({
        ...current,
        fields: {
          ...current.fields,
          ...Object.fromEntries(
            ["region", "platform", "server", "botManual"]
              .filter((field) => body[field] !== undefined)
              .map((field) => [field, body[field]])
          ),
        },
      }));
      return jsonOk({ row: { id: Number(id), ...data.fields, links: data.links } });
    }
    if (body.game !== undefined && !String(body.game).trim()) {
      return jsonError("กรุณากรอกชื่อเกม", 400);
    }
    const before = await getGameListRow(Number(id));
    const row = await updateGameListRow(Number(id), body);
    if (!row) return jsonError("ไม่พบเกมนี้", 404);
    await recordEdit({
      queryId: null,
      actor: admin.username || admin.displayName || "",
      table: "game_list",
      pkColumn: "id",
      pkValue: Number(id),
      column: "(แก้ไขเกม)",
      oldValue: before ? JSON.stringify(before).slice(0, 2000) : null,
      newValue: JSON.stringify(row).slice(0, 2000),
      ...requestMeta(request),
    });
    return jsonOk({ row });
  } catch (err) {
    return handleApiError(err, "บันทึกข้อมูลเกมไม่สำเร็จ");
  }
}

export async function DELETE(request, { params }) {
  try {
    const admin = await requireGameinfoEditor(request);
    const { id } = await params;
    const before = await getGameListRow(Number(id));
    await deleteGameListRow(Number(id));
    await recordEdit({
      queryId: null,
      actor: admin.username || admin.displayName || "",
      table: "game_list",
      pkColumn: "id",
      pkValue: Number(id),
      column: "(ลบเกม)",
      oldValue: before ? JSON.stringify(before).slice(0, 2000) : null,
      newValue: null,
      ...requestMeta(request),
    });
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err, "ลบเกมไม่สำเร็จ");
  }
}
