import { handleApiError, jsonOk } from "@/lib/http";
import { requireProfitAccess } from "@/server/auth";
import { getRazerAccountOtpBundle } from "@/server/profit-razer-bot";

function readForceExternal(request, body) {
  if (body?.forceExternal) return true;
  return new URL(request.url).searchParams.get("force") === "external";
}

export async function GET(request, { params }) {
  try {
    await requireProfitAccess(request);
    const { id } = await params;
    const forceExternal = readForceExternal(request);
    const otp = await getRazerAccountOtpBundle(id, {
      includeSecrets: false,
      persistExternalSecret: true,
      forceExternal,
    });
    return jsonOk({ otp });
  } catch (err) {
    return handleApiError(err, "โหลด OTP ไม่สำเร็จ");
  }
}

/** ดึง OTP จาก api-system และบันทึก 2FA secret ลง DB ถ้ามี */
export async function POST(request, { params }) {
  try {
    await requireProfitAccess(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const forceExternal = readForceExternal(request, body);
    const otp = await getRazerAccountOtpBundle(id, {
      includeSecrets: false,
      persistExternalSecret: true,
      forceExternal,
    });
    return jsonOk({ otp });
  } catch (err) {
    return handleApiError(err, "ซิงก์ OTP ไม่สำเร็จ");
  }
}
