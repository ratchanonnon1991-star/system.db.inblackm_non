// UID pack model: only fields the current pack editor/view actually use may
// be persisted, and duplicating a pack must allocate a fresh immutable id.
import {
  createBlankGameinfoPack,
  duplicateGameinfoPack,
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
  costProfileId: "cost_razer",
  channelsMain: ["Wavepay"],
  channelsSecondary: ["Razer"],
  country: "TH",
});
ok("sanitize drops the legacy amountCharged field", !("amountCharged" in sanitized));
ok("sanitize drops unknown fields", !("unexpectedDatabaseField" in sanitized));

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
  costProfileId: "",
  channelsMain: [],
  channelsSecondary: [],
  country: "",
});

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
process.exit(failures.length ? 1 : 0);
