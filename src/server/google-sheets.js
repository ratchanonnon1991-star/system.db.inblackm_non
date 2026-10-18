import { createSign } from "node:crypto";
import { readFile } from "node:fs/promises";

// Google Sheets/Drive access with a service-account key (the same key auto-balance uses).
// Drive is read-only; Sheets needs write only for the Russia E←F paste (writeRaw).
// No googleapis dependency: one signed JWT exchanged for a short-lived token.
const SCOPES = "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.readonly";
const SHEETS = "https://sheets.googleapis.com/v4/spreadsheets";
const DRIVE = "https://www.googleapis.com/drive/v3/files";

const b64url = (value) => Buffer.from(value).toString("base64url");

export function signServiceAccountJwt(account, now = Date.now(), scopes = SCOPES) {
  if (!account?.client_email || !account?.private_key) throw new Error("Service account key is missing client_email/private_key");
  const iat = Math.floor(now / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({ iss: account.client_email, scope: scopes,
    aud: account.token_uri || "https://oauth2.googleapis.com/token", iat, exp: iat + 3600 }));
  const signer = createSign("RSA-SHA256"); signer.update(`${header}.${claims}`);
  return `${header}.${claims}.${signer.sign(account.private_key).toString("base64url")}`;
}

export function createGoogleReader({ keyFile = process.env.ITUNE_SHEETS_CREDENTIALS, fetchImpl = fetch, now = () => Date.now(), readOnly = false, readKeyFile = readFile } = {}) {
  let account; let token = null;
  async function accessToken() {
    if (token && token.expires > now() + 60_000) return token.value;
    if (!keyFile) throw new Error("Google Sheets credentials are not configured");
    account ||= JSON.parse(await readKeyFile(keyFile, "utf8"));
    const response = await fetchImpl(account.token_uri || "https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: signServiceAccountJwt(account, now(), readOnly ? "https://www.googleapis.com/auth/spreadsheets.readonly" : SCOPES) }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.access_token) throw new Error(`Google token request failed (HTTP ${response.status})`);
    token = { value: body.access_token, expires: now() + Number(body.expires_in || 3600) * 1000 };
    return token.value;
  }
  async function get(url, init = {}) {
    const response = await fetchImpl(url, { ...init, headers: { Authorization: `Bearer ${await accessToken()}`, ...init.headers }, signal: AbortSignal.timeout(20_000) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(`Google API HTTP ${response.status}: ${body?.error?.message || "request failed"}`), { status: response.status });
    return body;
  }
  return {
    async cell(spreadsheetId, range) {
      const body = await get(`${SHEETS}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE`);
      if (body.values?.length !== 1 || body.values[0]?.length !== 1) throw new Error("Expected one Google Sheets cell");
      return body.values[0][0];
    },
    async listSpreadsheets(query) {
      const files = []; let pageToken = "";
      do {
        const params = new URLSearchParams({ q: `${query} and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`,
          fields: "nextPageToken,files(id,name)", pageSize: "100", supportsAllDrives: "true", includeItemsFromAllDrives: "true" });
        if (pageToken) params.set("pageToken", pageToken);
        const body = await get(`${DRIVE}?${params}`);
        files.push(...(body.files || [])); pageToken = body.nextPageToken || "";
      } while (pageToken);
      return files;
    },
    async tabTitles(spreadsheetId) {
      const body = await get(`${SHEETS}/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties.title`);
      return (body.sheets || []).map((s) => s.properties.title);
    },
    // Displayed values, so formula cells read as the number staff see.
    async rows(spreadsheetId, tab) {
      const range = `'${tab.replaceAll("'", "''")}'!A:ZZ`;
      const body = await get(`${SHEETS}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`);
      return body.values || [];
    },
    // Literal values (RAW), one cell per update: { range: "'tab'!E12", value }.
    async writeRaw(spreadsheetId, updates) {
      if (readOnly) throw new Error("This Google Sheets reader is read-only");
      if (!updates.length) return;
      await get(`${SHEETS}/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ valueInputOption: "RAW", data: updates.map((u) => ({ range: u.range, values: [[u.value]] })) }),
      });
    },
  };
}
