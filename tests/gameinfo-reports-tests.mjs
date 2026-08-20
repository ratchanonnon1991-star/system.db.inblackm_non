import {
  createGamelistReport,
  listOpenGamelistReports,
  normalizeGamelistReportMessage,
  setGamelistReportStatus,
} from "@/server/gameinfo-gamelist-reports.js";
import { reset, setResponder } from "@/lib/db.js";

let pass = 0;
const failures = [];
function check(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) pass += 1;
  else failures.push(name);
}

check("message is trimmed", normalizeGamelistReportMessage("  เติมไม่ได้  "), "เติมไม่ได้");

const reportRow = { id: 9, game_id: 5, source: "topup", message: "เติมไม่ได้", status: "open", created_by: "staff1", created_at: "now", resolved_by: null, resolved_at: null };
reset();
setResponder((text) => {
  if (/SELECT id FROM game_list/.test(text)) return { rows: [{ id: 5 }] };
  if (/INSERT INTO gamelist_reports/.test(text)) return { rows: [reportRow] };
  return null;
});
check("topup report is created", (await createGamelistReport(5, { source: "topup", message: "เติมไม่ได้", actor: "staff1" })).source, "topup");

reset();
setResponder((text) => /status = 'open'/.test(text) ? { rows: [reportRow] } : null);
check("open reports include their game", (await listOpenGamelistReports())[0].gameId, 5);

reset();
setResponder((text) => /UPDATE gamelist_reports/.test(text)
  ? { rows: [{ ...reportRow, status: "resolved", resolved_by: "admin", resolved_at: "later" }] }
  : null);
check("admin resolves report", (await setGamelistReportStatus(5, 9, "resolved", "admin")).status, "resolved");

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
process.exit(failures.length ? 1 : 0);
