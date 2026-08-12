// gamedb-login-log.js: the DB-backed brute-force guard and the /log alert
// banner it feeds, exercised against the stub pool instead of a real one.
import {
  countRecentFailedLogins,
  listLoginAlerts,
  listLogins,
  MAX_ATTEMPTS_PER_IP,
  MAX_ATTEMPTS_PER_USERNAME,
  recordLogin,
} from "@/server/gamedb-login-log.js";
import { log, reset, setResponder } from "@/lib/db.js";

let pass = 0;
const fail = [];
const ok = (name, cond) => (cond ? pass++ : fail.push(name));

// --- recordLogin -----------------------------------------------------------
reset();
await recordLogin({ username: "Admin", success: false, reason: "wrong", ip: "1.2.3.4" });
const insert = log.find((entry) => /^\s*INSERT INTO gamedb_login_log/i.test(entry.text));
ok("recordLogin writes an INSERT", Boolean(insert));
ok("recordLogin binds every value as a parameter", insert.params.length === 5);
ok("recordLogin never interpolates the username into the SQL text", !insert.text.includes("Admin"));

// --- countRecentFailedLogins -------------------------------------------------
reset({ rows: [{ by_username: 3, by_ip: 5 }] });
let counted = await countRecentFailedLogins({ username: "admin", ip: "1.2.3.4", since: new Date(0) });
ok("countRecentFailedLogins reads by_username", counted.byUsername === 3);
ok("countRecentFailedLogins reads by_ip", counted.byIp === 5);

reset({ rows: [] });
counted = await countRecentFailedLogins({ username: "nobody", ip: "", since: new Date(0) });
ok("countRecentFailedLogins defaults to zero with no matching row",
  counted.byUsername === 0 && counted.byIp === 0);

// --- listLoginAlerts ---------------------------------------------------------
reset();
setResponder((text) => {
  if (text.includes("lower(username) AS key")) {
    return { rows: [{ key: "admin", count: MAX_ATTEMPTS_PER_USERNAME }] };
  }
  if (text.includes("ip AS key")) {
    return { rows: [{ key: "203.0.113.9", count: MAX_ATTEMPTS_PER_IP }] };
  }
  return null;
});
const alerts = await listLoginAlerts(new Date(0));
ok("listLoginAlerts reports a blocked username", alerts.some(
  (a) => a.type === "username" && a.key === "admin" && a.count === MAX_ATTEMPTS_PER_USERNAME
));
ok("listLoginAlerts reports a blocked ip", alerts.some(
  (a) => a.type === "ip" && a.key === "203.0.113.9" && a.count === MAX_ATTEMPTS_PER_IP
));
ok("listLoginAlerts issues two queries, both with bound parameters",
  log.filter((e) => /SELECT/i.test(e.text)).every((e) => Array.isArray(e.params) && e.params.length === 2));

reset({ rows: [] });
ok("listLoginAlerts is empty when nothing crosses the threshold",
  (await listLoginAlerts(new Date(0))).length === 0);

// --- listLogins --------------------------------------------------------------
reset({
  rows: [
    { id: 1, username: "admin", success: true, reason: "", ip: "1.2.3.4", user_agent: "curl", created_at: "now" },
  ],
});
const logins = await listLogins(10);
ok("listLogins maps snake_case columns to camelCase", logins[0].userAgent === "curl");
const limitCall = log.find((e) => /ORDER BY id DESC/i.test(e.text));
ok("limit is bound, not interpolated", limitCall.params[0] === 10);

reset({ rows: [] });
await listLogins(99999);
ok("listLogins clamps an over-large limit to the max",
  log.find((e) => /ORDER BY id DESC/i.test(e.text)).params[0] === 500);

console.log(`\n${pass} passed, ${fail.length} failed`);
if (fail.length) {
  console.log(fail.join("\n"));
  process.exit(1);
}
