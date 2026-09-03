import { normalizeRussiaCheckCatalog } from "../lib/gameinfo-russia-check.js";

export const MIDASBUY_CATALOG_URL = "https://www.midasbuy.com/frontend/api/midasbuy/v1/shelves/query";
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

function fail(message, retryable = false) {
  return Object.assign(new Error(`Midasbuy: ${message}`), { status: 502, retryable });
}

function sourceConfig(source) {
  const appId = String(source.projectId ?? source.project_id ?? "");
  const region = String(source.country ?? "").toUpperCase();
  const language = String(source.locale ?? "");
  if (!/^\d{1,20}$/.test(appId) || !/^[A-Z]{2}$/.test(region) || !/^[a-z]{2}(?:-[A-Za-z]{2})?$/.test(language)) {
    throw fail("การตั้งค่า app/ประเทศ/ภาษาไม่ถูกต้อง");
  }
  return { appId, region, language };
}

// Observed anonymous storefront contract, 2026-09-03. Request the complete
// Items shelf, not individual category tabs or nested bundle contents.
export function parseMidasbuyPage(payload, source) {
  const { appId, region } = sourceConfig(source);
  const shelf = payload?.shelf;
  if (!shelf || shelf.app_id !== appId || !Array.isArray(shelf.products) ||
      typeof shelf.product_offset !== "string" || shelf.product_offset.length > 4096) {
    throw fail("รูปแบบรายการแพ็กหรือข้อมูลหน้าถัดไปไม่ถูกต้อง จะไม่เปลี่ยนข้อมูลเดิม");
  }
  if (shelf.is_part_activity_fail !== false || shelf.is_channel_activity_fail !== false || shelf.loss_level !== "") {
    throw fail("ร้านส่งข้อมูลไม่ครบหรือระบบบางส่วนขัดข้อง จะไม่เปลี่ยนข้อมูลเดิม");
  }
  const items = shelf.products.map((product) => {
    if (product?.app_id !== appId || String(product?.region ?? "").toUpperCase() !== region ||
        typeof product.product_id !== "string" || !product.product_id.trim() ||
        typeof product.name !== "string" || !product.name.trim() ||
        !Array.isArray(product.available_channel_ids) ||
        product.available_channel_ids.some((id) => typeof id !== "string" || !id.trim()) ||
        typeof product.isMaintaining !== "boolean") {
      throw fail("แพ็กมีชื่อ/รหัส/ประเทศ/สถานะไม่ครบ จะไม่เปลี่ยนข้อมูลเดิม");
    }
    if (product.isMaintaining) throw fail("มีสินค้าปิดปรับปรุง จะไม่เปลี่ยนข้อมูลเดิม");
    return { sku: product.product_id.trim(), name: product.name, can_be_bought: product.available_channel_ids.length > 0 };
  });
  if (!items.length && shelf.product_offset) throw fail("มีหน้าถัดไปแต่ไม่ส่งรายการแพ็ก");
  return { items, nextOffset: shelf.product_offset };
}

async function readJson(response) {
  if (Number(response.headers.get("content-length")) > MAX_RESPONSE_BYTES) throw fail("ข้อมูลเกินขนาดที่รองรับ");
  const reader = response.body?.getReader();
  if (!reader) throw fail("ไม่ได้รับข้อมูลจากร้าน");
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw fail("ข้อมูลเกินขนาดที่รองรับ");
      }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw fail("ร้านไม่ได้ส่ง JSON ที่สมบูรณ์"); }
}

async function fetchPage(body, { fetchImpl, retryDelay }) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetchImpl(MIDASBUY_CATALOG_URL, {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body), credentials: "omit", cache: "no-store", redirect: "error",
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw fail(`HTTP ${response.status}`, response.status === 429 || response.status >= 500);
      }
      return await readJson(response);
    } catch (error) {
      // Do not persist upstream bodies, payment tokens, or arbitrary fetch errors.
      const safe = typeof error?.retryable === "boolean" ? error : fail("เชื่อมต่อร้านไม่สำเร็จ กรุณาลองใหม่", true);
      if (!safe.retryable || attempt === 2) throw safe;
      await retryDelay(attempt);
    }
  }
}

export async function fetchMidasbuyCatalog(source, options = {}) {
  const { appId, region, language } = sourceConfig(source);
  const request = {
    app_id: appId, language, region, shop_code: "midasbuy", product_types: ["Rp", "Subscription"],
    game_openid: "", isReady: true, mid: "", role_id: "", server_id: "1",
    is_vip_product: true, client_ver: "android", tab_lab: "", is_editor: false,
  };
  const transport = {
    fetchImpl: options.fetchImpl || fetch,
    retryDelay: options.retryDelay || ((attempt) => new Promise((resolve) => setTimeout(resolve, [1000, 3000][attempt]))),
  };
  const collected = [];
  const offsets = new Set();
  const skus = new Set();
  for (let page = 0; page < 100; page++) {
    const { items, nextOffset } = parseMidasbuyPage(await fetchPage(request, transport), source);
    for (const item of items) {
      if (skus.has(item.sku)) throw fail("มีรหัสสินค้าซ้ำ จะไม่เปลี่ยนข้อมูลเดิม");
      skus.add(item.sku);
      collected.push(item);
    }
    if (collected.length > 10000) throw fail("จำนวนแพ็กเกินขีดจำกัด");
    if (!nextOffset) {
      try { return normalizeRussiaCheckCatalog(collected); }
      catch { throw fail("รายการแพ็กว่างหรือไม่สมบูรณ์ จะไม่เปลี่ยนข้อมูลเดิม"); }
    }
    if (offsets.has(nextOffset)) throw fail("ข้อมูลหน้าถัดไปวนซ้ำ จะไม่เปลี่ยนข้อมูลเดิม");
    offsets.add(nextOffset);
    request.product_offset = nextOffset;
  }
  throw fail("จำนวนหน้ารายการเกินขีดจำกัด จะไม่เปลี่ยนข้อมูลเดิม");
}
