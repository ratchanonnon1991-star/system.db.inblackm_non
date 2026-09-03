import { createHash } from "node:crypto";
import { normalizeRussiaCheckCatalog } from "../lib/gameinfo-russia-check.js";

export const GRYPHLINE_PRODUCTS_URL = "https://as.gryphline.com/user/pay/v3/query_web_product";
export const GRYPHLINE_APP_CODE = "d9f6dbb6bbd6bb33";
const ACCOUNT_URL = "https://as.gryphline.com/user/info/v1/basic";
const fail = (message, status = 502, authInvalid = false) => Object.assign(new Error(message), { status, authInvalid, safeMessage: true });

// Only the selected role's catalog query is accepted, never a login/password
// request, arbitrary URL, page filter, headers or browser cookie collection.
export function parseGryphlineRequest(value) {
  if (typeof value !== "string" || value.length > 65536) throw fail("คำขอ Endfield ไม่ถูกต้อง", 400);
  let url;
  try { url = new URL(value); } catch { throw fail("ต้องใช้คำขอรายการแพ็ก Endfield", 400); }
  if (url.origin + url.pathname !== GRYPHLINE_PRODUCTS_URL || url.username || url.password || url.hash) throw fail("ต้องใช้คำขอรายการแพ็ก Endfield", 400);
  const keys = ["token", "appCode", "serverId"];
  if ([...url.searchParams].length !== keys.length || keys.some((key) => url.searchParams.getAll(key).length !== 1)) throw fail("คำขอ Endfield ไม่ครบหรือมีตัวกรองที่ไม่รองรับ", 400);
  const { token, appCode, serverId } = Object.fromEntries(url.searchParams);
  if (appCode !== GRYPHLINE_APP_CODE || !/^[A-Za-z0-9+/]+={0,2}$/.test(token) || token.length > 16384 || !/^[A-Za-z0-9_-]{1,128}$/.test(serverId)) throw fail("Token หรือข้อมูลตัวละคร Endfield ไม่ถูกต้อง", 400);
  return { version: 1, kind: "gryphline", token, appCode, serverId };
}

export function parseGryphlineCatalog(payload) {
  if (!payload || !Array.isArray(payload.productList) || !payload.productList.length || !Array.isArray(payload.productType) || typeof payload.region !== "string" || !payload.region.trim()) throw fail("Endfield ส่งรายการแพ็กไม่ครบ จะไม่เปลี่ยนข้อมูลเดิม");
  // Storefront v3 requests one entire shelf. Refuse any newly introduced paging
  // marker until that contract is supported, instead of inferring removals.
  if (payload.hasMore || payload.has_more || payload.nextCursor || payload.next_cursor || payload.pagination || (payload.total != null && payload.total !== payload.productList.length)) throw fail("Endfield ส่งรายการแบบแบ่งหน้าที่ไม่ครบ จะไม่เปลี่ยนข้อมูลเดิม");
  const packs = payload.productList.map((item) => {
    if (typeof item?.productCode !== "string" || typeof item?.productName !== "string") throw fail("Endfield ส่งรหัสหรือชื่อแพ็กไม่ถูกต้อง");
    return { sku: item.productCode, name: item.productName };
  });
  try { return normalizeRussiaCheckCatalog(packs); }
  catch { throw fail("Endfield ส่งแพ็กว่าง/ซ้ำ/ไม่สมบูรณ์ จะไม่เปลี่ยนข้อมูลเดิม"); }
}

async function request(url, { fetchImpl = fetch, retryDelay = (attempt) => new Promise((resolve) => setTimeout(resolve, [1000, 3000][attempt])) } = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    let response;
    try {
      response = await fetchImpl(url, { headers: { "X-Language": "en-us", Accept: "application/json" }, credentials: "omit", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) });
    } catch {
      if (attempt < 2) { await retryDelay(attempt); continue; }
      throw fail("เชื่อมต่อ Gryphline ไม่สำเร็จ กรุณาลองใหม่");
    }
    if ((response.status === 429 || response.status >= 500) && attempt < 2) { await response.body?.cancel(); await retryDelay(attempt); continue; }
    if ([401, 403].includes(response.status)) { await response.body?.cancel(); throw fail("Login Endfield หมดอายุ กรุณาเชื่อมบัญชีใหม่", 409, true); }
    if (!response.ok) { await response.body?.cancel(); throw fail(`Gryphline ตอบ HTTP ${response.status}`); }
    let envelope;
    try {
      const reader = response.body.getReader();
      const chunks = [];
      let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 2_000_000) { await reader.cancel(); throw Error(); }
          chunks.push(Buffer.from(value));
        }
      } finally { reader.releaseLock(); }
      envelope = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch { throw fail("Gryphline ส่งข้อมูลไม่สมบูรณ์หรือเกินขนาดที่รองรับ"); }
    if (envelope?.status === 3) throw fail("Login Endfield หมดอายุ กรุณาเชื่อมบัญชีใหม่", 409, true);
    if (envelope?.status !== 0) throw fail("Gryphline ไม่อนุญาตให้โหลดข้อมูล กรุณาตรวจบัญชีและตัวละคร");
    return envelope.data;
  }
}

function sessionUrl(session, base) {
  if (session?.kind !== "gryphline" || session.version !== 1 || !session.token || session.appCode !== GRYPHLINE_APP_CODE || !session.serverId) throw fail("ต้องเชื่อม Login Endfield ใหม่", 409, true);
  const url = new URL(base);
  url.searchParams.set("token", session.token);
  if (base === GRYPHLINE_PRODUCTS_URL) {
    url.searchParams.set("appCode", GRYPHLINE_APP_CODE);
    url.searchParams.set("serverId", session.serverId);
  }
  return url;
}

export async function verifyGryphlineSession(value, options = {}) {
  const session = parseGryphlineRequest(value);
  const account = await request(sessionUrl(session, ACCOUNT_URL), options);
  if (!["string", "number"].includes(typeof account?.hgId) || !String(account.hgId).trim()) throw fail("Gryphline ไม่ส่งรหัสบัญชีสำหรับยืนยัน Login");
  const payload = await request(sessionUrl(session, GRYPHLINE_PRODUCTS_URL), options);
  const catalog = parseGryphlineCatalog(payload);
  session.region = payload.region;
  session.scopeHash = createHash("sha256").update(JSON.stringify([String(account.hgId), session.serverId, session.region])).digest("hex");
  return { session, catalog };
}

export async function fetchGryphlineCatalog(session, options = {}) {
  const payload = await request(sessionUrl(session, GRYPHLINE_PRODUCTS_URL), options);
  if (!session.region || payload?.region !== session.region) throw fail("ภูมิภาค Endfield เปลี่ยน กรุณาเชื่อมบัญชีเดิมอีกครั้ง", 409, true);
  return parseGryphlineCatalog(payload);
}
