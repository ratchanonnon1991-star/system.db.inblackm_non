import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireProjectmAdmin } from "@/server/auth";
import {
  getItuneClaimSettings,
  saveItuneClaimSettings,
} from "@/server/itune-entries-repository";

// Admin-only reader/writer for the shared claim settings singleton.
// PUT remains partial so the settings drawer and priority controls do not
// overwrite one another's fields.
export async function GET(request) {
  try {
    await requireProjectmAdmin(request);
    return jsonOk(await getItuneClaimSettings());
  } catch (err) {
    return handleApiError(err, "โหลดการตั้งค่ารับ/คืนเมลไม่สำเร็จ");
  }
}

export async function PUT(request) {
  try {
    const admin = await requireProjectmAdmin(request);
    const body = await request.json();
    const fields = {};

    if (body.maxAmount !== undefined) {
      const numeric = Number(body.maxAmount);
      if (!Number.isFinite(numeric) || numeric < 0) {
        return jsonError("ยอดต้องเป็นตัวเลขไม่ติดลบ", 400);
      }
      fields.maxAmount = numeric;
    }

    if (body.priorityAmountThreshold !== undefined) {
      const numeric = Number(body.priorityAmountThreshold);
      if (!Number.isFinite(numeric) || numeric < 0) {
        return jsonError("เกณฑ์ยอดด่วนต้องเป็นตัวเลขไม่ติดลบ", 400);
      }
      fields.priorityAmountThreshold = numeric;
    }

    const numericSettings = [
      ["targetHours", "ชั่วโมงเป้าหมาย", 0.01, 168],
      ["burnRateUsdPerHour", "อัตราการใช้เงิน", 0.01, 1_000_000],
      ["expectedIdleHours", "เวลารอระหว่างผู้ใช้", 0, 168],
      ["claimWarningHours", "ชั่วโมงเตือนเคลม", 0.01, 168],
    ];
    for (const [key, label, min, max] of numericSettings) {
      if (body[key] === undefined) continue;
      const numeric = Number(body[key]);
      if (!Number.isFinite(numeric) || numeric < min || numeric > max) {
        return jsonError(`${label} ต้องอยู่ระหว่าง ${min}–${max}`, 400);
      }
      fields[key] = numeric;
    }

    if (
      fields.claimWarningHours !== undefined &&
      fields.targetHours !== undefined &&
      fields.claimWarningHours < fields.targetHours
    ) {
      return jsonError("ชั่วโมงเตือนเคลมต้องไม่น้อยกว่าชั่วโมงเป้าหมาย", 400);
    }

    if (body.claimPaused !== undefined) {
      fields.claimPaused = Boolean(body.claimPaused);
    }

    if (!Object.keys(fields).length) {
      return jsonError("ไม่มีการตั้งค่าที่จะบันทึก", 400);
    }

    const settings = await saveItuneClaimSettings(fields, admin);
    return jsonOk(settings);
  } catch (err) {
    return handleApiError(err, "บันทึกการตั้งค่าไม่สำเร็จ");
  }
}
