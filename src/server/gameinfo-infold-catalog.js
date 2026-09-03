import { createCipheriv, createDecipheriv, createHmac, createHash, timingSafeEqual } from "node:crypto";
import { normalizeRussiaCheckCatalog } from "@/lib/gameinfo-russia-check";

// Public SDK protocol constants, NOT account credentials. Verified against
// custom.092eca0f.js (module 12107) and index.e6a0457f.js on assets.infoldgames.com.
const AES_KEY = Buffer.from("iu06nhf24FOxgKD9", "utf8");
const APP_KEY = "m6h0MReLDHp1XGFa";
export const INFOLD_CATALOG_URL = "https://passport.infoldgames.com/v2/payment/user/products";
const FORM_KEYS = ["app_id", "timestamp", "sign_type", "clientid", "lang", "data", "sign"];
const CONTEXT_KEYS = ["nid", "token", "role_id", "zone_id", "area", "region", "DOID", "web_deviceid", "sdk_channel", "os_platform"];

function fail(message, status = 400, authInvalid = false) {
  return Object.assign(new Error(message), { status, authInvalid, safeMessage: true });
}

export function encryptInfoldData(data) {
  const cipher = createCipheriv("aes-128-cbc", AES_KEY, AES_KEY);
  return Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]).toString("base64");
}

export function decryptInfoldData(value) {
  try {
    if (typeof value !== "string" || !value.length || value.length > 3_000_000) throw Error();
    const base64 = value.replace(/ /g, "+");
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || base64.length % 4) throw Error();
    const cipher = createDecipheriv("aes-128-cbc", AES_KEY, AES_KEY);
    const data = JSON.parse(Buffer.concat([cipher.update(Buffer.from(base64, "base64")), cipher.final()]).toString("utf8"));
    if (!data || typeof data !== "object" || Array.isArray(data)) throw Error();
    return data;
  } catch {
    throw fail("ถอดรหัสข้อมูล Infold ไม่สำเร็จ กรุณาคัดลอก Form Data ทั้งชุดจาก request products ใหม่");
  }
}

export function signInfoldForm(form) {
  const message = Object.keys(form).filter((key) => !["data", "sign"].includes(key) && form[key] !== "" && form[key] != null)
    .sort().map((key) => `${key}=${encodeURIComponent(form[key]).replace(/\*/g, "%2A")}`).join("&");
  return createHmac("md5", APP_KEY).update(message).digest("hex");
}

export function buildInfoldForm(session, now = Date.now()) {
  const form = { app_id: "1010001", timestamp: String(Math.floor(now / 1000)), sign_type: "hmac", clientid: "1067", lang: "en", data: encryptInfoldData(session.data) };
  form.sign = signInfoldForm(form);
  return new URLSearchParams(form).toString();
}

export function parseInfoldFormData(value) {
  if (typeof value !== "string" || !value.trim() || Buffer.byteLength(value) > 65536) throw fail("กรุณาใส่ Form Data ทั้งชุด (ไม่เกิน 64 KB)");
  const raw = value.trim();
  // DevTools Payload > View source is application/x-www-form-urlencoded.
  // Also accept the displayed key: value lines, without evaluating scripts/cURL.
  const entries = raw.includes("&") ? [...new URLSearchParams(raw)] : raw.split(/\r?\n/).map((line) => {
    const match = /^([a-z_]+)\s*[:=]\s*(.+)$/.exec(line.trim());
    if (!match) throw fail("รูปแบบไม่ถูกต้อง ใช้ Payload → View source แล้วคัดลอกทั้งชุด");
    return [match[1], match[2]];
  });
  const form = Object.create(null);
  for (const [key, item] of entries) {
    if (!FORM_KEYS.includes(key) || Object.hasOwn(form, key)) throw fail("Form Data มีฟิลด์ที่ไม่รองรับหรือซ้ำ");
    form[key] = item;
  }
  if (FORM_KEYS.some((key) => !form[key])) throw fail("Form Data ไม่ครบ ต้องมี app_id, timestamp, sign_type, clientid, lang, data และ sign");
  if (form.app_id !== "1010001" || form.clientid !== "1067" || form.lang !== "en" || form.sign_type !== "hmac") throw fail("คำขอนี้ไม่ใช่ Love and Deepspace ภาษาอังกฤษที่รองรับ");
  if (!/^\d{10,11}$/.test(form.timestamp) || !/^[a-f0-9]{32}$/i.test(form.sign) || !timingSafeEqual(Buffer.from(form.sign.toLowerCase()), Buffer.from(signInfoldForm(form)))) throw fail("ลายเซ็น Form Data ไม่ถูกต้อง กรุณาคัดลอกใหม่ทั้งชุด");
  const decoded = decryptInfoldData(form.data);
  if (decoded.shelf_id !== "payment") throw fail("ใช้ request products จากหน้า Top-up Center เท่านั้น");
  const data = { shelf_id: "payment", lang: "en" };
  for (const key of CONTEXT_KEYS) {
    if (decoded[key] == null) continue;
    if (!["string", "number"].includes(typeof decoded[key]) || String(decoded[key]).length > 8192) throw fail("ข้อมูล session Infold ไม่ถูกต้อง");
    data[key] = decoded[key];
  }
  for (const key of ["nid", "token", "role_id", "zone_id", "area", "region"]) {
    if (!String(data[key] ?? "").trim()) throw fail("คำขอไม่มี Login/ตัวละคร/ภูมิภาคครบ กรุณาเลือกตัวละครให้เห็นแพ็กก่อนคัดลอก");
  }
  // Never replay category/page/cart filters or arbitrary captured parameters.
  const scope = [data.nid, data.role_id, data.zone_id, data.area, data.region].map(String);
  return { version: 1, kind: "infold", data, scopeHash: createHash("sha256").update(JSON.stringify(scope)).digest("hex") };
}

export function parseInfoldCatalog(payload) {
  if (!Array.isArray(payload?.product_list) || !payload.product_list.length) throw fail("Infold ไม่ส่งรายการแพ็ก จะไม่เปลี่ยนข้อมูลเดิม", 502);
  // Official storefront requests the entire shelf without pagination parameters.
  // Refuse partial/unknown pagination rather than infer removals from one page.
  const paging = payload.pagination;
  if (paging != null) {
    if (typeof paging !== "object" || Array.isArray(paging)) throw fail("รูปแบบ pagination Infold ไม่รองรับ", 502);
    const keys = Object.keys(paging);
    const known = ["has_more", "has_next", "total", "total_count", "page", "page_size", "offset"];
    if (keys.some((key) => !known.includes(key)) ||
        ["has_more", "has_next"].some((key) => paging[key] != null && paging[key] !== false) ||
        ["total", "total_count"].some((key) => paging[key] != null && Number(paging[key]) !== payload.product_list.length) ||
        (paging.offset != null && Number(paging.offset) !== 0) || (paging.page != null && Number(paging.page) !== 1) ||
        (keys.length && !keys.some((key) => ["has_more", "has_next", "total", "total_count"].includes(key)))) {
      throw fail("Infold ส่งรายการแบ่งหน้าหรือไม่ครบ จะไม่เปลี่ยนข้อมูลเดิม", 502);
    }
  }
  // Track visible listings, including account purchase-limit states. Buying a
  // pack on this account must not by itself create a 'removed' event.
  const items = payload.product_list.map((row) => {
    const info = row?.product_info;
    const names = info?.name;
    const name = Array.isArray(names) ? (names.find((item) => item?.lang === "en") || names[0])?.text : names;
    if (typeof name !== "string" || !["string", "number"].includes(typeof info?.sku_id)) throw fail("รายการ Infold ไม่มีชื่อหรือ SKU ที่ถูกต้อง", 502);
    return { sku: String(info.sku_id), name };
  });
  try { return normalizeRussiaCheckCatalog(items); }
  catch { throw fail("Infold ส่งรายการที่มี SKU ซ้ำ หรือชื่อ/SKU ว่าง จะไม่เปลี่ยนข้อมูลเดิม", 502); }
}

export async function fetchInfoldCatalog(session, { fetchImpl = fetch, retryDelay = (attempt) => new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1))), now = Date.now } = {}) {
  if (session?.kind !== "infold" || session.version !== 1 || !session.data?.token) throw fail("ต้องนำเข้า Form Data ใหม่ Cookie เดิมใช้กับ Infold ไม่ได้", 409, true);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(INFOLD_CATALOG_URL, {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(15000),
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: buildInfoldForm(session, now()),
      });
    } catch {
      if (attempt < 2) { await retryDelay(attempt); continue; }
      throw fail("เชื่อมต่อ Infold ไม่สำเร็จ กรุณาลองใหม่", 502);
    }
    if ((response.status === 429 || response.status >= 500) && attempt < 2) { await response.body?.cancel(); await retryDelay(attempt); continue; }
    if (!response.ok) throw fail(`Infold ตอบ HTTP ${Number(response.status) || 0}`, 502, [401, 403].includes(response.status));
    let envelope;
    try {
      const reader = response.body.getReader();
      const chunks = [];
      let size = 0;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 2_000_000) { await reader.cancel(); throw Error(); }
        chunks.push(Buffer.from(value));
      }
      envelope = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch { throw fail("อ่านผลลัพธ์ Infold ไม่สำเร็จหรือข้อมูลใหญ่เกินขีดจำกัด", 502); }
    if (envelope?.code !== 0) {
      const code = Number.isInteger(envelope?.code) ? envelope.code : -1;
      const invalid = [1012, 1013, 401, 60502].includes(code);
      throw fail(invalid ? "Login Infold หมดอายุ กรุณาล็อกอินแล้วนำเข้า Form Data ใหม่" : `Infold ไม่อนุญาตให้โหลดรายการ (code ${code})`, 502, invalid);
    }
    const payload = typeof envelope.data === "string" ? decryptInfoldData(envelope.data) : envelope.data;
    return parseInfoldCatalog(payload);
  }
  throw fail("โหลด Infold ไม่สำเร็จ", 502);
}
