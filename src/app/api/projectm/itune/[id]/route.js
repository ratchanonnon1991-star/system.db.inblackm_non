import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireProjectmAdmin } from "@/server/auth";
import {
  deleteItuneEntry,
  updateItuneEntry,
} from "@/server/itune-entries-repository";

function parseAmount(value) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return 0;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : NaN;
}

export async function PUT(request, { params }) {
  try {
    const actor = await requireProjectmAdmin(request);
    const { id } = await params;

    const body = await request.json();
    const fields = {};

    if (body.email !== undefined) fields.email = String(body.email || "").trim();
    if (body.password !== undefined) fields.password = String(body.password || "").trim();
    if (body.currency !== undefined) fields.currency = String(body.currency || "").trim();
    if (body.supplier !== undefined) fields.supplier = String(body.supplier || "").trim();
    if (body.linkSms !== undefined) fields.linkSms = String(body.linkSms || "").trim();
    if (body.qna !== undefined) fields.qna = String(body.qna || "").trim();
    if (body.amountConfirmImage !== undefined) {
      fields.amountConfirmImage = String(body.amountConfirmImage || "").trim();
    }
    if (body.amount !== undefined) {
      const amount = parseAmount(body.amount);
      if (Number.isNaN(amount)) {
        return jsonError("Amount ต้องเป็นตัวเลขไม่ติดลบ", 400);
      }
      fields.amount = amount;
    }

    const entry = await updateItuneEntry(id, fields, actor);
    return jsonOk({ entry });
  } catch (err) {
    return handleApiError(err, "บันทึกรายการไม่สำเร็จ");
  }
}

export async function DELETE(request, { params }) {
  try {
    const actor = await requireProjectmAdmin(request);
    const { id } = await params;
    await deleteItuneEntry(id, actor);
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err, "ลบรายการไม่สำเร็จ");
  }
}
