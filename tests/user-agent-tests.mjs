import assert from "node:assert/strict";
import { summarizeUserAgent } from "@/lib/user-agent.js";

let passed = 0;
function check(label, actual, expected) {
  assert.deepEqual(actual, expected, label);
  passed += 1;
}

check(
  "Chrome on Windows is labelled plainly",
  summarizeUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  ),
  "Chrome · Windows"
);
check(
  "Edge is not mistaken for Chrome even though its UA carries both tokens",
  summarizeUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0"
  ),
  "Edge · Windows"
);
check(
  "Safari is not mistaken for Chrome",
  summarizeUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
  ),
  "Safari · macOS"
);
check(
  "an iPhone Safari UA reads as iOS, not macOS",
  summarizeUserAgent(
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
  ),
  "Safari · iOS"
);
check(
  "Firefox on Linux",
  summarizeUserAgent("Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0"),
  "Firefox · Linux"
);
check("an empty user agent has nothing to summarize", summarizeUserAgent(""), "");
check("a missing user agent has nothing to summarize", summarizeUserAgent(undefined), "");
check(
  "an unrecognized user agent still says something rather than nothing",
  summarizeUserAgent("SomeWeirdBot/1.0"),
  "อุปกรณ์ไม่ทราบชนิด"
);

console.log(`${passed} passed`);
