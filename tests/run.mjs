// Runs every suite in its own process, so one suite's stubbed pool or module
// state cannot leak into the next, and reports a single total.
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const suites = readdirSync(here)
  .filter((name) => name.endsWith("-tests.mjs"))
  .sort();

// TEST_COVERAGE=1 (npm run test:coverage) wraps each suite in Node's test
// runner only to collect coverage: one lcov file per suite in coverage/ for
// SonarQube. The suite's own "N passed" line and exit code come through as is.
const coverage = process.env.TEST_COVERAGE === "1";
const coverageDir = path.join(here, "..", "coverage");
if (coverage) mkdirSync(coverageDir, { recursive: true });
const coverageFlags = (suite) => coverage ? [
  "--test",
  "--experimental-test-coverage",
  "--test-coverage-include=src/**",
  "--test-reporter=spec", "--test-reporter-destination=stdout",
  "--test-reporter=lcov",
  `--test-reporter-destination=${path.join(coverageDir, suite.replace(/\.mjs$/, ".lcov"))}`,
] : [];

let passed = 0;
const failed = [];

for (const suite of suites) {
  const run = spawnSync(
    process.execPath,
    [
      ...coverageFlags(suite),
      "--import",
      pathToFileURL(path.join(here, "register.mjs")).href,
      path.join(here, suite),
    ],
    { encoding: "utf8" }
  );
  const output = `${run.stdout || ""}${run.stderr || ""}`.trim();
  const count = /(\d+) passed/.exec(output);
  if (count) passed += Number(count[1]);

  if (run.status === 0) {
    console.log(`  ok   ${suite.padEnd(24)} ${count ? `${count[1]} assertions` : ""}`);
  } else {
    failed.push(suite);
    console.log(`  FAIL ${suite}`);
    console.log(output.replace(/^/gm, "       "));
  }
}

console.log(
  `\n${suites.length} suites, ${passed} assertions, ${failed.length} suite(s) failed`
);
if (failed.length) process.exit(1);
