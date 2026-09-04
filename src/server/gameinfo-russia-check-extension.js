import { readFile } from "node:fs/promises";
import path from "node:path";
import { buildZipBlob } from "@/lib/gamedb-xlsx";
import { VERSION } from "../../extensions/russia-check/protocol.js";

export { VERSION as RUSSIA_CHECK_EXTENSION_VERSION };
const FILES = ["background.js", "connector.js", "protocol.js", "bridge.js", "confirm.html", "confirm.css", "confirm.js"];

export function extensionManifest(origin) {
  const url = new URL(origin);
  if (url.origin !== origin || url.username || url.password ||
      (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))) {
    throw Object.assign(Error("ดาวน์โหลดจากเว็บ HTTPS หรือ localhost เท่านั้น"), { status: 400 });
  }
  // Chrome match patterns cannot pin a port. Both bridge and worker additionally
  // check the exact origin (including port) from the generated config.
  const appPattern = `${url.protocol}//${url.hostname}/*`;
  return {
    manifest_version: 3, minimum_chrome_version: "120", name: "GameInfo — Russia Check Connector", version: VERSION,
    description: "เชื่อม Love and Deepspace / Infinity Nikki / Endfield กับ GameInfo หลังผู้ดูแลอนุญาต ไม่อ่านรหัสผ่านหรือ Cookie",
    permissions: ["webRequest", "storage", "alarms", "browsingData"],
    host_permissions: [appPattern, "https://loveanddeepspace.infoldgames.com/*", "https://infinitynikki.infoldgames.com/*", "https://passport.infoldgames.com/*", "https://topup.gryphline.com/*", "https://as.gryphline.com/*"],
    background: { service_worker: "background.js", type: "module" },
    // Next.js uses client-side navigation: load the bridge on this origin, but
    // enforce the Russia Check pathname in both bridge and worker at each call.
    content_scripts: [{ matches: [appPattern], js: ["config.js", "bridge.js"], run_at: "document_start", all_frames: false }],
    content_security_policy: { extension_pages: "script-src 'self'; object-src 'none'; base-uri 'none'" },
  };
}

export async function buildRussiaCheckExtension(origin) {
  const manifest = extensionManifest(origin);
  const files = await Promise.all(FILES.map(async (name) => ({ path: name, data: await readFile(path.join(process.cwd(), "extensions", "russia-check", name), "utf8") })));
  files.push({ path: "manifest.json", data: JSON.stringify(manifest, null, 2) });
  files.push({ path: "config.js", data: `globalThis.RUSSIA_CHECK_CONFIG = Object.freeze(${JSON.stringify({ origin })});\n` });
  files.push({ path: "README.txt", data: `GameInfo Russia Check Connector ${VERSION}\nWebsite: ${origin}\n\n1. Extract this ZIP to a permanent folder.\n2. Open chrome://extensions or edge://extensions.\n3. Enable Developer mode, choose Load unpacked, and select the folder containing manifest.json.\n4. Reload Russia Check, select a game or All Games, and click Refresh. Missing logins open one at a time. Manage Login also allows connecting in advance.\n5. Confirm the website in the extension popup, log in on Infold or Gryphline and select your character. Keep GameInfo open until verification completes.\n\nInstall only one copy for this website. This package is pinned to the website above. Only the account connector needs it; viewers do not. No passwords/cookies are read. Only the products request in the approved popup is captured. Session data is submitted to GameInfo for verification and encrypted storage, never stored in the extension. Uninstall via Remove on the extensions page. Neither Infold nor Gryphline is affiliated with this extension. Update: extract the new ZIP into the installed folder, click Reload in chrome://extensions, approve any new host permissions, then reload GameInfo.\n` });
  return buildZipBlob(files);
}
