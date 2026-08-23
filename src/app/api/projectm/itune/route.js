import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireProjectmAdmin } from "@/server/auth";
import {
  deleteItuneEntries,
  insertItuneEntry,
  listItuneEntries,
  saveItuneEntries,
} from "@/server/itune-entries-repository";

function parseAmount(value) {
  if (value === undefined || value === null || value === "") return 0;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : undefined;
}

// The client captures this the instant "เพิ่มรายการ" is clicked, before the
// row is ever saved, so the 24h countdown doesn't reset/jump on save. It's a
// client-supplied clock reading from a trusted (projectm-admin-gated) caller,
// but still sanity-checked — a bit of clock skew is tolerated, an implausible
// value just falls back to the column's own NOW() default instead of erroring.
const FUTURE_SKEW_TOLERANCE_MS = 5 * 60 * 1000;

function parseAddedAt(value) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  if (date.getTime() > Date.now() + FUTURE_SKEW_TOLERANCE_MS) return undefined;
  return date.toISOString();
}

function parseDate(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : value;
}

function parseFields(body, { requireProof = false } = {}) {
  const amount = parseAmount(body.amount);
  if (amount === undefined) throw Object.assign(new Error("Amount ต้องเป็นตัวเลขไม่ติดลบ"), { status: 400 });
  const amountConfirmImage = String(body.amountConfirmImage || "").trim();
  if (requireProof && !amountConfirmImage) {
    throw Object.assign(new Error("กรุณาแนบรูปยืนยันยอดเริ่มต้น"), { status: 400 });
  }
  return {
    email: String(body.email || "").trim(),
    password: String(body.password || "").trim(),
    currency: String(body.currency || "").trim(),
    supplier: String(body.supplier || "").trim(),
    amount,
    amountConfirmImage,
    linkSms: String(body.linkSms || "").trim(),
    qna: String(body.qna || "").trim(),
  };
}

export async function GET(request) {
  try {
    await requireProjectmAdmin(request);
    const url = new URL(request.url);
    const rawFrom = url.searchParams.get("from");
    const rawTo = url.searchParams.get("to");
    const from = parseDate(rawFrom);
    const to = parseDate(rawTo);
    if ((rawFrom && !from) || (rawTo && !to) || (from && to && from > to)) {
      return jsonError("ช่วงวันที่ไม่ถูกต้อง", 400);
    }
    const entries = await listItuneEntries({ from, to, all: url.searchParams.get("all") === "1" });
    return jsonOk({ entries });
  } catch (err) {
    return handleApiError(err, "โหลดรายการไม่สำเร็จ");
  }
}

export async function POST(request) {
  try {
    const actor = await requireProjectmAdmin(request);
    const body = await request.json();

    const amount = parseAmount(body.amount);
    if (amount === undefined) {
      return jsonError("Amount ต้องเป็นตัวเลขไม่ติดลบ", 400);
    }

    const amountConfirmImage = String(body.amountConfirmImage || "").trim();
    if (!amountConfirmImage) {
      return jsonError("กรุณาแนบรูปยืนยันยอดเริ่มต้น", 400);
    }

    const entry = await insertItuneEntry({
      createdByUserId: actor.id,
      addedAt: parseAddedAt(body.addedAt),
      email: String(body.email || "").trim(),
      password: String(body.password || "").trim(),
      currency: String(body.currency || "").trim(),
      supplier: String(body.supplier || "").trim(),
      amount,
      amountConfirmImage,
      linkSms: String(body.linkSms || "").trim(),
      qna: String(body.qna || "").trim(),
    }, actor);
    return jsonOk({ entry }, 201);
  } catch (err) {
    return handleApiError(err, "เพิ่มรายการไม่สำเร็จ");
  }
}

export async function PUT(request) {
  try {
    const actor = await requireProjectmAdmin(request);
    const body = await request.json();
    if (!Array.isArray(body.creates) || !Array.isArray(body.updates)) {
      return jsonError("รูปแบบรายการที่บันทึกไม่ถูกต้อง", 400);
    }
    const clientIds = body.creates.map((item) => String(item.clientId || ""));
    if (clientIds.some((id) => !id) || new Set(clientIds).size !== clientIds.length) {
      return jsonError("รหัสรายการใหม่ไม่ถูกต้อง", 400);
    }
    const result = await saveItuneEntries({
      creates: body.creates.map((item) => ({
        clientId: String(item.clientId),
        addedAt: parseAddedAt(item.addedAt),
        fields: parseFields(item, { requireProof: true }),
      })),
      updates: body.updates.map((item) => ({
        id: item.id,
        fields: parseFields(item),
      })),
    }, actor);
    return jsonOk(result);
  } catch (err) {
    return handleApiError(err, "บันทึกรายการไม่สำเร็จ");
  }
}

export async function DELETE(request) {
  try {
    const actor = await requireProjectmAdmin(request);
    const body = await request.json();
    if (!Array.isArray(body.ids)) return jsonError("ไม่ได้ระบุรายการที่จะลบ", 400);
    const deleted = await deleteItuneEntries(body.ids, actor);
    return jsonOk({ deleted });
  } catch (err) {
    return handleApiError(err, "ลบรายการไม่สำเร็จ");
  }
}
