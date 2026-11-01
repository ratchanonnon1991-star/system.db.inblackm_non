// UID pack model: only fields the current pack editor/view actually use may
// be persisted, and duplicating a pack must allocate a fresh immutable id.
import {
  createBlankGameinfoPack,
  duplicateGameinfoPack,
  formatGameinfoPackExpiry,
  gameinfoPackDatePassed,
  gameinfoPackOffSale,
  gameinfoPackStatus,
  gameinfoPackStatusPatch,
  sanitizeGameinfoPack,
} from "@/lib/gameinfo-pack-model.js";

let pass = 0;
const failures = [];
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) pass += 1;
  else failures.push(`${name}\n    expected ${e}\n    actual   ${a}`);
}
function ok(name, value) {
  check(name, Boolean(value), true);
}

const source = {
  id: "pk_old",
  name: "86 Diamonds",
  image: "/pack.png",
  price: "30",
  amountCharged: "100", // legacy: must never be written or copied
  amountChargedFee: "103",
  costProfileId: "cost_razer",
  channelsMain: ["Wavepay"],
  channelsSecondary: ["Razer"],
  country: "TH",
  unexpectedDatabaseField: "do not keep",
};

const sanitized = sanitizeGameinfoPack(source);
check("sanitize preserves the immutable id", sanitized.id, "pk_old");
check("sanitize keeps fields currently displayed by the UID pack UI", sanitized, {
  id: "pk_old",
  name: "86 Diamonds",
  image: "/pack.png",
  price: "30",
  amountChargedFee: "103",
  serviceEnabled: true,
  serviceStatus: "",
  costProfileId: "cost_razer",
  channelsMain: ["Wavepay"],
  channelsSecondary: ["Razer"],
  country: "Thailand",
});
ok("sanitize drops the legacy amountCharged field", !("amountCharged" in sanitized));
ok("sanitize drops unknown fields", !("unexpectedDatabaseField" in sanitized));
check(
  "sanitize removes leading zeros from stored numeric fields",
  sanitizeGameinfoPack({ ...source, price: "00100", amountChargedFee: "000.50" }),
  { ...sanitized, price: "100", amountChargedFee: "0.50" }
);

const duplicate = duplicateGameinfoPack(source, "pk_copy");
check("duplicate receives the requested fresh id", duplicate.id, "pk_copy");
check("duplicate is labelled as a copy", duplicate.name, "86 Diamonds (สำเนา)");
check("duplicate keeps the current pack values", duplicate.amountChargedFee, "103");
check("legacy pack defaults to enabled service", duplicate.serviceEnabled, true);
check(
  "explicitly disabled pack remains disabled",
  sanitizeGameinfoPack({ ...source, serviceEnabled: false }).serviceEnabled,
  false
);
check(
  "new pack status is preserved",
  sanitizeGameinfoPack({ ...source, serviceStatus: "new" }).serviceStatus,
  "new"
);
ok("duplicate does not copy the legacy amountCharged field", !("amountCharged" in duplicate));

duplicate.channelsMain.push("New channel");
check("duplicate owns a new main-channel array", source.channelsMain, ["Wavepay"]);

const blank = createBlankGameinfoPack("pk_blank");
check("blank pack has only the current editable fields", blank, {
  id: "pk_blank",
  name: "",
  image: "",
  price: "",
  amountChargedFee: "",
  serviceEnabled: true,
  serviceStatus: "",
  costProfileId: "",
  channelsMain: [],
  channelsSecondary: [],
  country: "",
});

// Statuses: expired (the sheet's red rows) is never on sale; unknown ones drop.
check("an expired pack is closed", sanitizeGameinfoPack({ id: "a", serviceEnabled: true, serviceStatus: "expired" }).serviceEnabled, false);
check("an unknown status drops", sanitizeGameinfoPack({ id: "a", serviceStatus: "sold-out" }).serviceStatus, "");
check(
  "the four statuses",
  [{}, { serviceEnabled: false }, { serviceStatus: "new" }, { serviceEnabled: false, serviceStatus: "expired" }].map(gameinfoPackStatus),
  ["open", "closed", "new", "expired"]
);
check("each status round-trips", ["open", "closed", "new", "expired"].map((status) => gameinfoPackStatus(gameinfoPackStatusPatch(status))), ["open", "closed", "new", "expired"]);

// expiresAt: the last day on sale, by the Bangkok calendar.
const bangkok = (iso) => new Date(iso);
check("a real date is kept", sanitizeGameinfoPack({ id: "a", expiresAt: " 2026-11-04 " }).expiresAt, "2026-11-04");
check("no date stays off the pack", "expiresAt" in sanitizeGameinfoPack({ id: "a", expiresAt: "" }), false);
check("a date that does not exist drops", "expiresAt" in sanitizeGameinfoPack({ id: "a", expiresAt: "2026-02-30" }), false);
check("free text drops", "expiresAt" in sanitizeGameinfoPack({ id: "a", expiresAt: "4/11/2026" }), false);
check("the date reads as the sheet writes it", formatGameinfoPackExpiry("2026-11-04"), "4/11/2026");
check("no date reads as nothing", formatGameinfoPackExpiry(undefined), "");
const dated = { serviceStatus: "new", expiresAt: "2026-11-04" };
check("the last day is still on sale", gameinfoPackStatus(dated, bangkok("2026-11-04T16:59:00Z")), "new");
check("the day after in Bangkok it has expired", gameinfoPackStatus(dated, bangkok("2026-11-04T17:00:00Z")), "expired");
check("a passed date counts as off sale", gameinfoPackOffSale(dated, bangkok("2026-11-05T00:00:00Z")), true);
check("a date to come does not", gameinfoPackOffSale(dated, bangkok("2026-11-01T00:00:00Z")), false);
check("a closed pack is off sale without a date", gameinfoPackOffSale({ serviceEnabled: false }), true);
check("a pack with no date never passes", gameinfoPackDatePassed({}), false);

const detailed = sanitizeGameinfoPack({ ...source, amountBeforeFee: " 236155 X 2 ", amountReceived: "16,160", priceUsd: "400", link: " https://x.example " });
ok("sanitize keeps the sheet's detail fields", detailed.amountBeforeFee === "236155 X 2" && detailed.amountReceived === "16160" && detailed.priceUsd === "400" && detailed.link === "https://x.example");
ok("a pack without them stores no new keys", !("amountBeforeFee" in sanitized) && !("amountReceived" in sanitized) && !("link" in sanitized));

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
process.exit(failures.length ? 1 : 0);
