// Saving a secret is not evidence that a provider accepted it.
export function getRussiaCheckSourceAvailability(source, now = new Date()) {
  const catalogSupported = ["xsolla", "infold", "midasbuy", "gryphline", "codashop"].includes(source.provider);
  const authExpired = Boolean(source.authExpiresAt && new Date(source.authExpiresAt) <= now);
  const verified = ["infold", "gryphline"].includes(source.provider) && source.credentialKind === source.provider && Boolean(source.authVerifiedAt);
  const authState = !source.authRequired ? "not_required" : !source.authConfigured ? "missing" : authExpired ? "expired" : source.authInvalidated ? "invalid" : verified ? "verified" : "saved_unverified";
  let refreshBlockedReason = "";
  if (source.isDemo) refreshBlockedReason = "demo data เป็นข้อมูลตัวอย่างแบบอ่านอย่างเดียว";
  else if (!catalogSupported) refreshBlockedReason = "ยังไม่มีตัวดึงรายการแพ็กสำหรับ Source นี้";
  else if (source.provider === "infold" && authState !== "verified") refreshBlockedReason = "เปิดจัดการ Login แล้วนำเข้า Form Data จาก request products เพื่อตรวจสอบ Login (Cookie เดิมใช้ไม่ได้)";
  else if (source.provider === "gryphline" && authState !== "verified") refreshBlockedReason = "กดรีข้อมูลเพื่อ Login Gryphline และเลือกตัวละคร Endfield ผ่าน Browser";
  else if (!source.sourceEnabled) refreshBlockedReason = "Source นี้ยังไม่เปิดดึงข้อมูลอัตโนมัติ";
  else if (!["not_required", "verified"].includes(authState)) refreshBlockedReason = "ต้องตรวจสอบ Login กับผู้ให้บริการก่อนรีข้อมูล";
  return { catalogSupported, authState, authExpired, refreshBlockedReason };
}
