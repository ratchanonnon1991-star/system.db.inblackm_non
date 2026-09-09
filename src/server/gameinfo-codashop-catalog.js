import { normalizeRussiaCheckCatalog } from "../lib/gameinfo-russia-check.js";

const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

function fail(message, retryable = false) {
  return Object.assign(new Error(`Codashop: ${message}`), { status: 502, retryable });
}

function sourceUrl(source) {
  let url;
  try { url = new URL(source.sourceUrl ?? source.source_url); }
  catch { throw fail("URL ร้านไม่ถูกต้อง"); }
  if (url.protocol !== "https:" || url.hostname !== "www.codashop.com" || !/^\/[a-z]{2}-[a-z]{2}\/[a-z0-9-]+\/?$/.test(url.pathname)) {
    throw fail("URL ร้านไม่ถูกต้อง");
  }
  return url;
}

function decodeAttribute(value) {
  return value.replace(/&(#(?:x[0-9a-f]+|\d+)|amp|quot|apos|lt|gt);/gi, (entity, code) => {
    const named = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">" };
    if (code[0] !== "#") return named[code.toLowerCase()];
    const point = Number.parseInt(code.slice(code[1]?.toLowerCase() === "x" ? 2 : 1), code[1]?.toLowerCase() === "x" ? 16 : 10);
    return Number.isFinite(point) ? String.fromCodePoint(point) : entity;
  });
}

function attribute(tag, name) {
  const match = tag.match(new RegExp(`(?:^|\\s)${name}=(?:"([^"]*)"|'([^']*)')`, "i"));
  return match ? decodeAttribute(match[1] ?? match[2]) : "";
}

export function parseCodashopPage(html) {
  if (typeof html !== "string" || !html.includes('id="__NUXT_DATA__"')) {
    throw fail("หน้าเว็บไม่สมบูรณ์ จะไม่เปลี่ยนข้อมูลเดิม");
  }
  const items = [];
  const seen = new Set();
  for (const match of html.matchAll(/<[^>]*\bdata-auto-capture=["']skuClick["'][^>]*>/gi)) {
    const sku = attribute(match[0], "capture-custom-sku-id").trim();
    const name = attribute(match[0], "capture-custom-sku-name").trim();
    if (!/^\d+$/.test(sku) || !name || seen.has(sku)) throw fail("ข้อมูล SKU ไม่ถูกต้อง จะไม่เปลี่ยนข้อมูลเดิม");
    seen.add(sku);
    if (!/\bsku-card--disabled\b/i.test(attribute(match[0], "class"))) items.push({ sku, name });
  }
  try { return normalizeRussiaCheckCatalog(items); }
  catch { throw fail("รายการแพ็กว่างหรือไม่สมบูรณ์ จะไม่เปลี่ยนข้อมูลเดิม"); }
}

async function readHtml(response) {
  if (Number(response.headers.get("content-length")) > MAX_RESPONSE_BYTES) throw fail("ข้อมูลเกินขนาดที่รองรับ");
  const text = await response.text();
  if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) throw fail("ข้อมูลเกินขนาดที่รองรับ");
  return text;
}

export async function fetchCodashopCatalog(source, options = {}) {
  const url = sourceUrl(source);
  const fetchImpl = options.fetchImpl || fetch;
  const retryDelay = options.retryDelay || ((attempt) => new Promise((resolve) => setTimeout(resolve, [1000, 3000][attempt])));
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        headers: { Accept: "text/html", "User-Agent": "GameInfo-Russia-Check/1.0" },
        cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw fail(`HTTP ${response.status}`, response.status === 429 || response.status >= 500);
      return parseCodashopPage(await readHtml(response));
    } catch (error) {
      const safe = typeof error?.retryable === "boolean" ? error : fail("เชื่อมต่อร้านไม่สำเร็จ กรุณาลองใหม่", true);
      if (!safe.retryable || attempt === 2) throw safe;
      await retryDelay(attempt);
    }
  }
}
