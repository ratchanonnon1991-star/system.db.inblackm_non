// An uploaded game image is stored as a base64 data: URL (there is no file
// storage, see gameinfo-image-picker-modal.js). Inlined into the game list
// page, a handful of them made the page several MB and the click from the hub
// looked dead for half a minute, so the list hands the browser a short,
// cacheable URL instead and /api/gameinfo/gamelist/[id]/image/raw decodes the
// stored value. Pure so both sides and the tests share one definition.

const DATA_URL = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i;
const RAW_HREF = /^\/api\/gameinfo\/gamelist\/(\d+)\/image\/raw(?:\?.*)?$/;

export function isImageDataUrl(value) {
  return DATA_URL.test(String(value ?? ""));
}

/** { contentType, base64 } for a base64 image data: URL, otherwise null. */
export function parseImageDataUrl(value) {
  const match = DATA_URL.exec(String(value ?? ""));
  if (!match) return null;
  return { contentType: match[1].toLowerCase(), base64: match[2].replace(/\s+/g, "") };
}

/** `version` changes whenever the stored image does, so the response can be cached for good. */
export function gamelistImageRawHref(gameId, version) {
  return `/api/gameinfo/gamelist/${gameId}/image/raw?v=${encodeURIComponent(version)}`;
}

/** True when `value` is the raw href this game's own list row was given. */
export function isGamelistImageRawHref(value, gameId) {
  const match = RAW_HREF.exec(String(value ?? "").trim());
  return Boolean(match) && Number(match[1]) === Number(gameId);
}
