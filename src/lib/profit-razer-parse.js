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

function isHeaderRow(email) {
  const lower = String(email || "").toLowerCase();
  return lower === "email" || lower === "e-mail" || lower === "account" || lower === "razer account";
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

/** Parse one row: Email | Password | 2FA | Region | Rate [| Gold | Silver] */
export function parseRazerAccountLine(line, delimiter) {
  const delim = delimiter || detectDelimiter(line);
  const parts = splitParts(line, delim);
  if (parts.length < 2) return null;

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

  // Email | Password | Region
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

  // ถ้าคอลัมน์ที่ 3 เป็นโซน แต่คอลัมน์ที่ 4 ไม่ใช่ตัวเลข — ถือว่าไม่มี 2FA
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

/** Parse multi-line text / file contents with auto delimiter detection. */
export function parseRazerImportText(text) {
  const raw = String(text || "").trim();
  if (!raw) return { rows: [], delimiter: "|", skipped: 0 };

  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (!lines.length) return { rows: [], delimiter: "|", skipped: 0 };

  const delimiter = detectDelimiter(lines.find((l) => l.includes("@")) || lines[0]);
  const rows = [];
  let skipped = 0;

  for (const line of lines) {
    const row = parseRazerAccountLine(line, delimiter);
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
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;

  const { rows } = parseRazerImportText(trimmed);
  if (rows.length === 1) return rows[0];

  return parseRazerAccountLine(trimmed) || parseRazerVerticalBlock(trimmed);
}

export const RAZER_IMPORT_FORMAT_HINT =
  "Email | Password | 2FA Secret | Region | Rate [| Gold | Silver]";

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
    status: "PENDING_TOPUP",
    goldBalance: row.goldBalance ? String(row.goldBalance) : "",
    silverBalance: row.silverBalance ? String(row.silverBalance) : "",
  };
}
