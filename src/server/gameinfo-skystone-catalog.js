import { normalizeRussiaCheckCatalog } from "../lib/gameinfo-russia-check.js";

export const SKYSTONE_CATALOG_HOST = "topup.games.skystone.games";
export const SKYSTONE_PAY_CHANNEL = "xsolla_paystation";
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

function fail(message, retryable = false) {
  return Object.assign(new Error(`Skystone: ${message}`), { status: 502, retryable });
}

function sourceConfig(source) {
  const appId = String(source.projectId ?? source.project_id ?? "");
  const country = String(source.country ?? "").toUpperCase();
  let base;
  try { base = new URL(source.sourceUrl ?? source.source_url); }
  catch { throw fail("URL ร้านไม่ถูกต้อง"); }
  if (base.protocol !== "https:" || base.hostname !== SKYSTONE_CATALOG_HOST) throw fail("URL ร้านไม่ถูกต้อง");
  if (!/^\d{1,20}$/.test(appId) || !/^[A-Z]{2}$/.test(country)) throw fail("การตั้งค่า app/ประเทศไม่ถูกต้อง");
  return { appId, country, url: `https://${SKYSTONE_CATALOG_HOST}/web/payment/app/${appId}/country/${country}/all_goods_detail` };
}

// Observed anonymous storefront contract, 2026-09-10. The web shop asks for the
// whole catalog in one call: `normal` holds the standing packs and `activity`
// the limited-time ones. `classify_products` only regroups the same packs, so it
// is ignored; an empty `normal` fails the run instead of clearing stored packs.
export function parseSkystoneGoods(payload, source) {
  const { appId, country } = sourceConfig(source);
  if (payload?.code !== 0 || !payload.data || typeof payload.data !== "object") {
    throw fail(`ร้านไม่ส่งรายการแพ็ก (code ${payload?.code ?? "?"}) จะไม่เปลี่ยนข้อมูลเดิม`, payload?.code === -5000);
  }
  const { normal, activity } = payload.data;
  if (!Array.isArray(normal) || (activity != null && !Array.isArray(activity))) {
    throw fail("รูปแบบรายการแพ็กไม่ถูกต้อง จะไม่เปลี่ยนข้อมูลเดิม");
  }
  const items = [];
  const bySku = new Map();
  for (const product of [...normal, ...(activity || [])]) {
    if (typeof product?.product_id !== "string" || !product.product_id.trim() ||
        typeof product.product_name !== "string" || !product.product_name.trim() ||
        typeof product.goods_type !== "number" || !Array.isArray(product.channels) ||
        product.channels.some((channel) => typeof channel !== "string" || !channel.trim())) {
      throw fail("แพ็กมีชื่อ/รหัส/ช่องทางไม่ครบ จะไม่เปลี่ยนข้อมูลเดิม");
    }
    const item = { sku: product.product_id.trim(), name: product.product_name, can_be_bought: product.channels.length > 0 };
    const previous = bySku.get(item.sku);
    // `activity` may repeat a standing pack; only a conflicting copy is a broken payload.
    if (previous) {
      if (previous.name !== item.name || previous.can_be_bought !== item.can_be_bought) {
        throw fail("มีรหัสสินค้าซ้ำแต่ข้อมูลไม่ตรงกัน จะไม่เปลี่ยนข้อมูลเดิม");
      }
      continue;
    }
    bySku.set(item.sku, item);
    items.push(item);
  }
  if (items.length > 10000) throw fail("จำนวนแพ็กเกินขีดจำกัด");
  try { return normalizeRussiaCheckCatalog(items); }
  catch { throw fail(`รายการแพ็กของ ${appId}/${country} ว่างหรือไม่สมบูรณ์ จะไม่เปลี่ยนข้อมูลเดิม`); }
}

async function readJson(response) {
  if (Number(response.headers.get("content-length")) > MAX_RESPONSE_BYTES) throw fail("ข้อมูลเกินขนาดที่รองรับ");
  const text = await response.text();
  if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) throw fail("ข้อมูลเกินขนาดที่รองรับ");
  try { return JSON.parse(text); }
  catch { throw fail("ร้านไม่ได้ส่ง JSON ที่สมบูรณ์"); }
}

export async function fetchSkystoneCatalog(source, options = {}) {
  const { appId, country, url } = sourceConfig(source);
  const fetchImpl = options.fetchImpl || fetch;
  const retryDelay = options.retryDelay || ((attempt) => new Promise((resolve) => setTimeout(resolve, [1000, 3000][attempt])));
  const body = JSON.stringify({ country, role_id: "", pay_channel: SKYSTONE_PAY_CHANNEL, aid: Number(appId) });
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetchImpl(url, {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body, credentials: "omit", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw fail(`HTTP ${response.status}`, response.status === 429 || response.status >= 500);
      return parseSkystoneGoods(await readJson(response), source);
    } catch (error) {
      // Do not persist upstream bodies, payment tokens, or arbitrary fetch errors.
      const safe = typeof error?.retryable === "boolean" ? error : fail("เชื่อมต่อร้านไม่สำเร็จ กรุณาลองใหม่", true);
      if (!safe.retryable || attempt === 2) throw safe;
      await retryDelay(attempt);
    }
  }
}
