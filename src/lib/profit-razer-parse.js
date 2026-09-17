export const RAZER_ZONES = ["CAD", "SGD", "PHP", "VND", "THB", "OTHER"];

const ZONE_ALIASES = {
  cad: "CAD",
  sgd: "SGD",
  php: "PHP",
  vnd: "VND",
  thb: "THB",
  th: "THB",
  other: "OTHER",
  vn: "VND",
};

export function normalizeZone(raw) {
  const key = String(raw || "").trim().toLowerCase();
  if (!key) return "OTHER";
  return ZONE_ALIASES[key] || (RAZER_ZONES.includes(String(raw).toUpperCase()) ? String(raw).toUpperCase() : "OTHER");
}

function detectDelimiter(line) {
  const trimmed = line.trim();
  if (trimmed.includes("|")) return "|";
  if (trimmed.includes("\t")) return "\t";
  if (trimmed.includes(",")) return ",";
  if (trimmed.includes(";")) return ";";
  if (trimmed.includes(":") && trimmed.includes("@")) return ":";
  if (/\S+@\S+\s+\S+/.test(trimmed)) return "whitespace";
  return "|";
}

function splitParts(line, delimiter) {
  if (delimiter === "whitespace") {
    return line.trim().split(/\s+/).map((p) => p.trim()).filter(Boolean);
  }
  if (delimiter === ",") {
    const parts = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (ch === "," && !inQuotes) {
        parts.push(current.trim());
        current = "";
        continue;
      }
      current += ch;
    }
    parts.push(current.trim());
    return parts.map((p) => p.replace(/^"|"$/g, ""));
  }
  return line.split(delimiter).map((p) => p.trim());
}

function normalizeHeaderKey(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

function isHeaderRow(email) {
  const lower = normalizeHeaderKey(email);
  return (
    lower === "email" ||
    lower === "e-mail" ||
    lower === "mail" ||
    lower === "account" ||
    lower === "razeraccount"
  );
}

function detectHeaderMap(line, delimiter) {
  const parts = splitParts(line, delimiter).map(normalizeHeaderKey);
  if (!parts.length) return null;

  const emailIdx = parts.findIndex((p) =>
    ["email", "e-mail", "mail", "account", "razeraccount"].includes(p)
  );
  const passwordIdx = parts.findIndex((p) =>
    ["password", "pass", "passwd", "pwd"].includes(p)
  );
  const zoneIdx = parts.findIndex((p) =>
    ["zone", "region", "โซน"].includes(p) || p === "regioncode"
  );

  // Minimal CSV: email,password,zone (with or without exact header names)
  if (emailIdx < 0 || passwordIdx < 0) return null;
  return {
    emailIdx,
    passwordIdx,
    zoneIdx: zoneIdx >= 0 ? zoneIdx : -1,
    tfaIdx: parts.findIndex((p) =>
      ["2fa", "tfa", "tfasecret", "2fasecret", "secret", "otpsecret"].includes(p)
    ),
    rateIdx: parts.findIndex((p) => ["rate", "rates", "thbperg"].includes(p)),
    goldIdx: parts.findIndex((p) => ["gold", "goldbalance"].includes(p)),
    silverIdx: parts.findIndex((p) => ["silver", "silverbalance"].includes(p)),
  };
}

function isZoneToken(raw) {
  const key = String(raw || "").trim().toLowerCase();
  if (!key) return false;
  return Boolean(ZONE_ALIASES[key]) || RAZER_ZONES.includes(String(raw).trim().toUpperCase());
}

function isNumericToken(raw) {
  const s = String(raw || "").trim();
  return s !== "" && !Number.isNaN(Number(s));
}

function emptyParsedRow() {
  return {
    email: "",
    password: "",
    tfaSecret: "",
    zone: "OTHER",
    rate: 0,
    goldBalance: 0,
    silverBalance: 0,
  };
}

function parseRowWithHeaderMap(parts, map) {
  const email = parts[map.emailIdx] || "";
  if (!email || !email.includes("@") || isHeaderRow(email)) return null;

  const password = parts[map.passwordIdx] || "";
  const zoneRaw = map.zoneIdx >= 0 ? parts[map.zoneIdx] : "";
  const tfaSecret = map.tfaIdx >= 0 ? parts[map.tfaIdx] || "" : "";
  const rate = map.rateIdx >= 0 ? Number(parts[map.rateIdx]) || 0 : 0;
  const goldBalance = map.goldIdx >= 0 ? Number(parts[map.goldIdx]) || 0 : 0;
  const silverBalance = map.silverIdx >= 0 ? Number(parts[map.silverIdx]) || 0 : 0;

  return {
    ...emptyParsedRow(),
    email,
    password,
    tfaSecret,
    zone: normalizeZone(zoneRaw),
    rate,
    goldBalance,
    silverBalance,
  };
}

/** Parse one row: Email | Password | 2FA | Region | Rate [| Gold | Silver]
 *  Also supports minimal: Email, Password, Zone
 */
export function parseRazerAccountLine(line, delimiter, headerMap = null) {
  const delim = delimiter || detectDelimiter(line);
  const parts = splitParts(line, delim);
  if (parts.length < 2) return null;

  if (headerMap) return parseRowWithHeaderMap(parts, headerMap);

  const email = parts[0];
  if (!email || !email.includes("@") || isHeaderRow(email)) return null;

  const password = parts[1] || "";

  // Email | Password | Region | Rate — ไม่มีคอลัมน์ 2FA
  if (parts.length >= 4 && isZoneToken(parts[2]) && isNumericToken(parts[3])) {
    return {
      email,
      password,
      tfaSecret: "",
      zone: normalizeZone(parts[2]),
      rate: Number(parts[3]) || 0,
      goldBalance: Number(parts[4]) || 0,
      silverBalance: Number(parts[5]) || 0,
    };
  }

  // Email | Password | Region  (เช่น CSV: email,password,CAD)
  if (parts.length === 3 && isZoneToken(parts[2])) {
    return {
      email,
      password,
      tfaSecret: "",
      zone: normalizeZone(parts[2]),
      rate: 0,
      goldBalance: 0,
      silverBalance: 0,
    };
  }

  // Email | Password | Region | (non-numeric junk…)
  if (parts.length >= 4 && isZoneToken(parts[2]) && !isNumericToken(parts[3])) {
    return {
      email,
      password,
      tfaSecret: "",
      zone: normalizeZone(parts[2]),
      rate: Number(parts[3]) || 0,
      goldBalance: Number(parts[4]) || 0,
      silverBalance: Number(parts[5]) || 0,
    };
  }

  // Email | Password only
  if (parts.length === 2) {
    return {
      email,
      password,
      tfaSecret: "",
      zone: "OTHER",
      rate: 0,
      goldBalance: 0,
      silverBalance: 0,
    };
  }

  return {
    email,
    password,
    tfaSecret: parts[2] || "",
    zone: normalizeZone(parts[3]),
    rate: Number(parts[4]) || 0,
    goldBalance: Number(parts[5]) || 0,
    silverBalance: Number(parts[6]) || 0,
  };
}

/** One field per line: email, password, [2FA], zone, rate, … */
function parseRazerVerticalBlock(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return null;

  const email = lines.find((l) => l.includes("@"));
  if (!email || isHeaderRow(email)) return null;

  const rest = lines.filter((l) => l !== email);
  if (!rest.length) return null;

  let i = 0;
  const password = rest[i++] || "";
  let tfaSecret = "";

  if (i < rest.length && !isZoneToken(rest[i]) && !isNumericToken(rest[i])) {
    tfaSecret = rest[i++];
  }

  let zone = "OTHER";
  let rate = 0;
  let goldBalance = 0;
  let silverBalance = 0;

  if (i < rest.length && isZoneToken(rest[i])) zone = normalizeZone(rest[i++]);
  if (i < rest.length && isNumericToken(rest[i])) rate = Number(rest[i++]) || 0;
  if (i < rest.length && isNumericToken(rest[i])) goldBalance = Number(rest[i++]) || 0;
  if (i < rest.length && isNumericToken(rest[i])) silverBalance = Number(rest[i++]) || 0;

  return { email, password, tfaSecret, zone, rate, goldBalance, silverBalance };
}

/** Parse multi-line text / CSV with auto delimiter + optional header map. */
export function parseRazerImportText(text) {
  const raw = String(text || "").replace(/^\uFEFF/, "").trim();
  if (!raw) return { rows: [], delimiter: "|", skipped: 0 };

  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (!lines.length) return { rows: [], delimiter: "|", skipped: 0 };

  const delimiter = detectDelimiter(lines.find((l) => l.includes("@")) || lines[0]);
  const headerMap = detectHeaderMap(lines[0], delimiter);
  const startIdx = headerMap ? 1 : 0;
  const rows = [];
  let skipped = headerMap ? 1 : 0;

  for (let i = startIdx; i < lines.length; i += 1) {
    const row = parseRazerAccountLine(lines[i], delimiter, headerMap);
    if (row) rows.push(row);
    else skipped += 1;
  }

  if (!rows.length && lines.length >= 2 && lines.some((l) => l.includes("@"))) {
    const vertical = parseRazerVerticalBlock(raw);
    if (vertical) return { rows: [vertical], delimiter: "newline", skipped: 0 };
  }

  return { rows, delimiter, skipped };
}

/** Single-line or vertical block → one parsed row, or null. */
export function resolveRazerPasteRow(text) {
  const trimmed = String(text || "").replace(/^\uFEFF/, "").trim();
  if (!trimmed) return null;

  const { rows } = parseRazerImportText(trimmed);
  if (rows.length === 1) return rows[0];

  return parseRazerAccountLine(trimmed) || parseRazerVerticalBlock(trimmed);
}

export const RAZER_IMPORT_FORMAT_HINT =
  "email,password,zone  หรือ  Email | Password | 2FA | Region | Rate";

export const RAZER_DELIMITER_LABELS = {
  "|": "pipe (|)",
  ",": "comma (,)",
  "\t": "tab",
  ";": "semicolon (;)",
};

/** Map parsed row → add-form fields */
export function parsedRowToForm(row) {
  if (!row) return null;
  return {
    email: row.email,
    password: row.password,
    tfaSecret: row.tfaSecret,
    zone: row.zone,
    rate: row.rate ? String(row.rate) : "",
    status: "ACTIVE",
    goldBalance: row.goldBalance ? String(row.goldBalance) : "",
    silverBalance: row.silverBalance ? String(row.silverBalance) : "",
  };
}
