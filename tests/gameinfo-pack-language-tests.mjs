import {
  duplicateGameinfoPack,
  getGameinfoPackName,
  sanitizeGameinfoPack,
  sanitizeGameinfoPackLocalizedNames,
} from "@/lib/gameinfo-pack-model.js";

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left === right) passed += 1;
  else failures.push(`${name}\n    expected ${right}\n    actual   ${left}`);
}

check(
  "localized names: accepts saved numeric language ids",
  sanitizeGameinfoPackLocalizedNames({ 12: "English Pack", 5: " 中文包 " }),
  { 5: "中文包", 12: "English Pack" }
);
check(
  "localized names: ignores unknown keys and blank values",
  sanitizeGameinfoPackLocalizedNames({ english: "Wrong key", 2: "   ", 3: "Thai" }),
  { 3: "Thai" }
);

const pack = sanitizeGameinfoPack({
  id: "p1",
  name: "ชื่อหลัก",
  localizedNames: { 7: "English", 8: "日本語" },
});
check("pack model: keeps localized names", pack.localizedNames, { 7: "English", 8: "日本語" });
check("pack name: reads the base name without a language", getGameinfoPackName(pack), "ชื่อหลัก");
check("pack name: reads the selected translation", getGameinfoPackName(pack, 7), "English");
check("pack name: an untranslated language is blank", getGameinfoPackName(pack, 99), "");

const duplicate = duplicateGameinfoPack(pack, "p2");
check("duplicate: creates a new id", duplicate.id, "p2");
check("duplicate: preserves localized names", duplicate.localizedNames, pack.localizedNames);

const legacy = sanitizeGameinfoPack({ id: "legacy", name: "Legacy" });
check("legacy packs: do not gain noisy empty translation data", "localizedNames" in legacy, false);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`${passed} passed`);
